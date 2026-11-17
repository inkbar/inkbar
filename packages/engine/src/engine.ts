import { EngineError } from './errors.ts'
import { createInThreadTransport } from './transport/in-thread.ts'
import { createWorkerTransport } from './transport/worker.ts'

import type { Request, Transport } from './protocol.ts'
import type {
  OpenOptions,
  PageInfo,
  RenderedPage,
  RenderOptions,
  SaveOptions,
  WriteInput,
} from './types.ts'
/** Options for `createEngine`. */
export interface EngineOptions {
  /**
   * URL or bytes of `inkbar-pdfium.wasm`. Default: the file beside this module. In Node the
   * default is read from disk; elsewhere it is fetched.
   */
  wasm?: string | URL | Uint8Array
  /**
   * URL of the worker script, a Worker, or false to run in the calling thread. Default: a worker
   * in a browser, false elsewhere. The engine takes ownership of a `Worker` passed in: it
   * terminates it if start-up or the worker fails, and on `destroy()`.
   */
  worker?: string | URL | Worker | false
}

/**
 * An open PDF. It holds engine memory until `close()` or the engine's `destroy()`. Calls on all
 * documents of one engine share one queue and run one at a time, in the order they were made.
 */
export interface EngineDocument {
  /** Number of pages. Always at least 1. */
  readonly pageCount: number
  /**
   * Size and rotation of a page. `index` counts from 0. An index that is not a whole number
   * from 0 to `pageCount - 1` rejects with a `RangeError`.
   */
  pageInfo(index: number): Promise<PageInfo>
  /**
   * Renders a page to an RGBA bitmap in displayed orientation, after /Rotate. The bitmap is
   * `ceil(width × scale)` by `ceil(height × scale)` pixels, where width and height are the
   * displayed size in points. A bad index or scale, or a bitmap above 268,435,456 pixels,
   * rejects with a `RangeError`. The returned data belongs to the caller.
   */
  renderPage(index: number, options?: RenderOptions): Promise<RenderedPage>
  /**
   * Writes annotations into the document: removes the ones in `remove`, then appends each of
   * `annotations` to its page, in order, with its dictionary written from its Gloss form, the
   * appearance given and its data. Each call starts from the document as it was opened, so
   * writing again replaces the last write rather than adding to it. `save` then gives the result.
   *
   * The engine copies the input when `write` is called, so the caller keeps its arrays. A page
   * index outside the document, or a resource name in an appearance that is not made of A-Z, a-z
   * and 0-9, rejects with a `RangeError`. A part that cannot be written rejects with
   * `write-failed`, naming the annotation; the document is then as it was opened.
   */
  write(input: WriteInput): Promise<void>
  /**
   * Writes the document to a new buffer that belongs to the caller. `'rewrite'` (the default)
   * writes a complete file. `'incremental'` returns the original bytes with the changes
   * appended. Saving keeps the document's encryption.
   */
  save(options?: SaveOptions): Promise<Uint8Array>
  /**
   * Frees the document's engine memory. Later calls on it reject with `engine-failure`.
   * Closing twice, or after the engine is destroyed or has stopped, resolves.
   */
  close(): Promise<void>
}

/**
 * A PDF engine: one PDFium instance, in a worker or in the calling thread.
 *
 * Engine memory grows to fit the largest work it has done and does not shrink. Closing a
 * document lets the engine reuse its memory. Only `destroy()` returns all of it.
 *
 * Errors are `EngineError`s. A `RangeError` means a bad page index or scale, a render larger
 * than 268,435,456 pixels, or a bad resource name in an appearance given to `write`. After an
 * internal error in PDFium the engine stops. Every later call rejects with `engine-failure`,
 * except `close()` and `destroy()`, which still resolve. Create a new engine to go on.
 */
export interface Engine {
  /**
   * Opens a PDF. The engine copies `bytes` when `open` is called, so the caller keeps its array
   * and may change it at once. `signal` cancels the call while it waits in the queue.
   */
  open(
    bytes: Uint8Array,
    options?: OpenOptions & { signal?: AbortSignal }
  ): Promise<EngineDocument>
  /**
   * Rejects queued calls with `aborted`, closes every document and frees the engine. In a worker
   * it waits up to two seconds for the running call, then terminates the worker; a running call
   * that has not finished by then rejects with `aborted`. In the calling thread it waits for the
   * running call to finish. Later calls reject with `engine-failure`; a later `destroy()` or
   * document `close()` resolves.
   */
  destroy(): Promise<void>
}

const failure = (message: string) => new EngineError('engine-failure', message)

class Session {
  destroyed = false
  constructor(readonly transport: Transport) {}

  call<T>(request: Request, signal?: AbortSignal): Promise<T> {
    if (this.destroyed) return Promise.reject(failure('The engine is destroyed.'))
    return this.transport.call<T>(request, signal)
  }
}

class Document implements EngineDocument {
  #closed = false

  constructor(
    private readonly session: Session,
    private readonly id: number,
    readonly pageCount: number
  ) {}

  pageInfo(index: number): Promise<PageInfo> {
    return this.#call({ op: 'pageInfo', doc: this.id, index })
  }

  renderPage(index: number, options: RenderOptions = {}): Promise<RenderedPage> {
    return this.#call(
      {
        op: 'renderPage',
        doc: this.id,
        index,
        scale: options.scale ?? 1,
        annotations: options.annotations ?? true,
      },
      options.signal
    )
  }

  async write(input: WriteInput): Promise<void> {
    // A copy taken now, so a change the caller makes while the call waits is not written. Input
    // that cannot be copied rejects.
    const copy = structuredClone(input)
    await this.#call({ op: 'write', doc: this.id, input: copy })
  }

  save(options: SaveOptions = {}): Promise<Uint8Array> {
    return this.#call({ op: 'save', doc: this.id, mode: options.mode ?? 'rewrite' })
  }

  async close(): Promise<void> {
    if (this.#closed || this.session.destroyed) return
    this.#closed = true
    try {
      await this.session.call({ op: 'close', doc: this.id })
    } catch (error) {
      // destroy() closes every document, so a close it took off the queue has nothing left to do.
      const cutShort =
        this.session.destroyed && error instanceof EngineError && error.code === 'aborted'
      if (!cutShort) throw error
    }
  }

  #call<T>(request: Request, signal?: AbortSignal): Promise<T> {
    if (this.#closed) return Promise.reject(failure('The document is closed.'))
    return this.session.call<T>(request, signal)
  }
}

class EngineImpl implements Engine {
  constructor(private readonly session: Session) {}

  async open(
    bytes: Uint8Array,
    options: OpenOptions & { signal?: AbortSignal } = {}
  ): Promise<EngineDocument> {
    const { signal, ...openOptions } = options
    const opened = await this.session.call<{ id: number; pageCount: number }>(
      { op: 'open', bytes: new Uint8Array(bytes), options: openOptions },
      signal
    )
    return new Document(this.session, opened.id, opened.pageCount)
  }

  #destroying: Promise<void> | undefined

  destroy(): Promise<void> {
    this.session.destroyed = true
    // A later call waits for the first one to finish.
    this.#destroying ??= this.session.transport.destroy()
    return this.#destroying
  }
}

/** Wraps an existing transport. The public entry point is `createEngine`. */
export function engineOver(transport: Transport): Engine {
  return new EngineImpl(new Session(transport))
}

const isNode = () =>
  typeof process !== 'undefined' && typeof process.versions?.node === 'string'

async function defaultWasm(): Promise<string | URL | Uint8Array> {
  const url = new URL('./inkbar-pdfium.wasm', import.meta.url)
  if (!isNode()) return url
  try {
    // A module import of a `node:` specifier would be resolved, and rejected, by a browser
    // bundler. This branch runs only in Node, which has `getBuiltinModule` from 22.3.
    const { readFile } = process.getBuiltinModule('node:fs/promises')
    return new Uint8Array(await readFile(url))
  } catch (cause) {
    throw new EngineError(
      'engine-failure',
      `Could not read the PDF engine from ${url.href}.`,
      {
        cause,
      }
    )
  }
}

/**
 * The default worker's URL, for messages only. A bundler copies the file at a literal
 * `new URL('./…', import.meta.url)` as an asset, so only the `new Worker(...)` call below names
 * it literally; this one goes through a variable the bundler leaves alone.
 */
const WORKER_FILE = './worker.mjs'
const defaultWorkerHref = () => new URL(WORKER_FILE, import.meta.url).href

function startWorker(worker: string | URL | Worker | undefined): {
  worker: Worker
  url?: string
} {
  if (worker instanceof Worker) return { worker }
  // The literal `new Worker(new URL(..., import.meta.url))` form is what bundlers look for.
  if (worker === undefined)
    return {
      worker: new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' }),
      url: defaultWorkerHref(),
    }
  return { worker: new Worker(worker, { type: 'module' }), url: String(worker) }
}

/**
 * Starts an engine. It loads the WebAssembly module and, in a worker, the worker script. It
 * requests nothing else. It rejects with `engine-failure`, naming the URL, when the module or
 * the worker cannot be loaded.
 */
export async function createEngine(options: EngineOptions = {}): Promise<Engine> {
  const { worker } = options
  if (worker !== false && typeof Worker !== 'undefined') {
    const wasm = options.wasm ?? new URL('./inkbar-pdfium.wasm', import.meta.url)
    let started: ReturnType<typeof startWorker>
    try {
      started = startWorker(worker)
    } catch (cause) {
      const from =
        worker === undefined
          ? ` from ${defaultWorkerHref()}`
          : worker instanceof Worker
            ? ''
            : ` from ${String(worker)}`
      throw new EngineError(
        'engine-failure',
        `Could not start the engine worker${from}.`,
        {
          cause,
        }
      )
    }
    return engineOver(
      await createWorkerTransport(started.worker, wasm, { url: started.url })
    )
  }
  const wasm = options.wasm ?? (await defaultWasm())
  return engineOver(await createInThreadTransport({ wasm }))
}
