import { EngineError } from './errors.ts'
import { createInThreadTransport } from './transport/in-thread.ts'

import type { Request, Transport } from './protocol.ts'
import type {
  OpenOptions,
  PageInfo,
  RenderedPage,
  RenderOptions,
  SaveOptions,
} from './types.ts'

export interface EngineOptions {
  /** URL or bytes of inkbar-pdfium.wasm. Default: resolved beside this module. */
  wasm?: string | URL | Uint8Array
  /** URL of the worker script, a Worker, or false to run in the calling thread. Default: a worker in a browser, false elsewhere. */
  worker?: string | URL | Worker | false
}

export interface EngineDocument {
  readonly pageCount: number
  pageInfo(index: number): Promise<PageInfo>
  renderPage(index: number, options?: RenderOptions): Promise<RenderedPage>
  save(options?: SaveOptions): Promise<Uint8Array>
  close(): Promise<void>
}

export interface Engine {
  open(
    bytes: Uint8Array,
    options?: OpenOptions & { signal?: AbortSignal }
  ): Promise<EngineDocument>
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
      { op: 'renderPage', doc: this.id, index, scale: options.scale ?? 1 },
      options.signal
    )
  }

  save(options: SaveOptions = {}): Promise<Uint8Array> {
    return this.#call({ op: 'save', doc: this.id, mode: options.mode ?? 'rewrite' })
  }

  async close(): Promise<void> {
    if (this.#closed || this.session.destroyed) return
    this.#closed = true
    await this.session.call({ op: 'close', doc: this.id })
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
      { op: 'open', bytes, options: openOptions },
      signal
    )
    return new Document(this.session, opened.id, opened.pageCount)
  }

  async destroy(): Promise<void> {
    if (this.session.destroyed) return
    this.session.destroyed = true
    await this.session.transport.destroy()
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
    // Dynamic, so a browser bundle carries no `node:` import.
    const { readFile } = await import('node:fs/promises')
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

export async function createEngine(options: EngineOptions = {}): Promise<Engine> {
  const { worker } = options
  if (worker !== false && typeof Worker !== 'undefined')
    throw failure(
      'Running the engine in a worker is not supported yet; pass worker: false.'
    )
  const wasm = options.wasm ?? (await defaultWasm())
  return engineOver(await createInThreadTransport({ wasm }))
}
