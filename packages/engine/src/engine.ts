import { EngineError } from './errors.ts'
import { createInThreadTransport } from './transport/in-thread.ts'
import { createWorkerTransport } from './transport/worker.ts'

import type { Request, Transport } from './protocol.ts'
import type {
  CheckRedactionOptions,
  OpenOptions,
  PageInfo,
  RedactInput,
  RedactionFindings,
  RedactResult,
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
   * Renders a page, or the `region` of it, to an RGBA bitmap in displayed orientation, after
   * /Rotate and `rotation`. The bitmap is `size`, or else `ceil(width × scale)` by
   * `ceil(height × scale)` pixels, where width and height are the region's displayed size in
   * user-space units. A bad index, scale, size, region, rotation or `hide` list, or a bitmap
   * above 268,435,456 pixels, rejects with a `RangeError`. The returned data belongs to the
   * caller.
   */
  renderPage(index: number, options?: RenderOptions): Promise<RenderedPage>
  /**
   * Writes form values and annotations into the document: sets each of `fields` and redraws its
   * widgets, removes the annotations in `remove`, then appends each of `annotations` to its page,
   * in order, with its dictionary written from its Gloss form, the appearance given and its data.
   * Each call starts from the document as it was opened, so writing again replaces the last write
   * rather than adding to it. `save` then gives the result. The file's permission flags do not
   * stop a write: a file that forbids annotating or filling its form takes both.
   *
   * The engine copies the input when `write` is called, so the caller keeps its arrays. A page
   * index outside the document, a resource name in an appearance that is not made of A-Z, a-z
   * and 0-9, an appearance whose bounds have no area, or a field value that is not a string or
   * a list of strings, rejects with a `RangeError`. A part that cannot be written rejects with `write-failed`, naming the
   * annotation or field; the document is then as it was opened.
   *
   * After a `redact`, `write` rejects with a `RangeError`: starting again from the opened bytes
   * would undo the redaction. Save the document and open the redacted bytes as a new document to
   * write to them.
   */
  write(input: WriteInput): Promise<void>
  /**
   * Applies redaction marks: removes the text, image samples and drawing under each mark and the
   * annotations a mark overlaps, leaves the mark's appearance in its place as part of the page,
   * and removes the file's metadata, attached files, scripts, thumbnails and private application
   * data. In order: removes `remove`, writes the marks, applies them page by page, writes
   * `annotations`, writes `fields`, and sanitises. Like `write`, each call starts from the
   * document as it was opened. `save` then gives the result, always by rewriting the file.
   *
   * A mark with no area, or wholly outside its page's box, is skipped. In an encrypted file,
   * Inkbar's own earlier marks, which come back locked, are applied too; other programs' marks
   * are left in place and counted. Bad input rejects with a `RangeError` as `write` does, as
   * does a mark that is not a `redact` annotation, has no appearance, or has neither quads of
   * finite corners nor a finite `rect`. A mark or page that cannot be applied rejects with `redaction-failed`, naming the
   * page and, when one mark was the cause, the mark; an annotation or field that cannot be
   * written rejects with `write-failed`. The document is then as it was opened.
   *
   * A second `redact` is allowed and starts again from the document as opened. A `write` after a
   * `redact` rejects with a `RangeError`.
   */
  redact(input: RedactInput): Promise<RedactResult>
  /**
   * Writes the document to a new buffer that belongs to the caller. `'rewrite'` writes a
   * complete file. `'incremental'` returns the original bytes with the changes appended, so a
   * signature over them can still be verified. With no mode, a document that holds a digital
   * signature is saved incrementally and any other is rewritten; an empty signature field, still
   * to be signed, does not count. After a `redact`, it always rewrites, and `'incremental'`
   * rejects with a `RangeError`: the earlier revision would keep what was removed. Saving keeps
   * the document's encryption.
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
 * Errors are `EngineError`s. A `RangeError` means a bad page index or render option, a render larger
 * than 268,435,456 pixels, a bad resource name or a box with no area in an appearance given
 * to `write`, or a region `checkRedaction` cannot use. After an
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
   * Checks what is left under redactions in a file, by its objects rather than by how it looks,
   * so content hidden under an opaque box counts. With `regions` it checks each region given, and
   * each is clean only when no text, image samples that are not one flat value, or drawing lies
   * under it. Without regions it looks for candidates itself: Redact annotations, opaque filled
   * boxes in the page content, and Square, Highlight and Stamp annotations drawn as opaque boxes.
   * It also reports what the file carries besides its pages.
   *
   * With `regions` the check trusts the `/INKB_Overlay` tag an apply puts on its overlays and
   * counts nothing inside a tagged form, so it proves nothing about a file the engine did not
   * just produce. Check a file from elsewhere without regions, and on an engine of its own: the
   * check runs to the end on the shared queue, so a hostile file can hold up or stop the engine
   * for every open document.
   *
   * The engine copies `bytes` when the call is made, loads them on their own, and closes them
   * before it resolves; documents the engine has open are not touched. The findings hold places,
   * counts and flags, never text from the file. A candidate that is not `clean` is a finding,
   * not an error.
   *
   * It rejects with `password-required`, `password-incorrect`, `invalid-pdf` or
   * `unsupported-security` as `open` does, with `check-failed` when a page or the file could not
   * be inspected, and with a `RangeError` for a region on a page the file does not have, with no
   * quads, or with a number that is not finite as a 32-bit float.
   */
  checkRedaction(
    bytes: Uint8Array,
    options?: CheckRedactionOptions
  ): Promise<RedactionFindings>
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

  async renderPage(index: number, options: RenderOptions = {}): Promise<RenderedPage> {
    const { signal, ...rest } = options
    // A copy taken now, as in `write`, so a region or list the caller changes while the call
    // waits is not used. The core checks the options.
    const copy = structuredClone(rest)
    return this.#call({ op: 'renderPage', doc: this.id, index, options: copy }, signal)
  }

  async write(input: WriteInput): Promise<void> {
    // A copy taken now, so a change the caller makes while the call waits is not written. Input
    // that cannot be copied rejects.
    const copy = structuredClone(input)
    await this.#call({ op: 'write', doc: this.id, input: copy })
  }

  async redact(input: RedactInput): Promise<RedactResult> {
    // A copy taken now, as in `write`. Input that cannot be copied rejects.
    const copy = structuredClone(input)
    return this.#call({ op: 'redact', doc: this.id, input: copy })
  }

  save(options: SaveOptions = {}): Promise<Uint8Array> {
    return this.#call({ op: 'save', doc: this.id, mode: options.mode })
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

  async checkRedaction(
    bytes: Uint8Array,
    options: CheckRedactionOptions = {}
  ): Promise<RedactionFindings> {
    const { signal, password, regions } = options
    // Copies taken now, as in `open` and `write`.
    return this.session.call<RedactionFindings>(
      {
        op: 'checkRedaction',
        bytes: new Uint8Array(bytes),
        options: {
          ...(password !== undefined && { password }),
          ...(regions !== undefined && { regions: structuredClone(regions) }),
        },
      },
      signal
    )
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
