import { EngineCore, nextTask, type CoreOptions } from '../native/core.ts'
import { loadNative } from '../native/module.ts'

import { CallQueue } from './queue.ts'

import type { Request, Transport } from '../protocol.ts'

/**
 * Runs a request on the core. A render, write or redact first fetches the fallback fonts of the
 * pages it loads; that fetch, and a render's slices, stop once `signal` aborts. Every other call
 * runs to the end.
 */
export function dispatch(
  core: EngineCore,
  request: Request,
  signal: AbortSignal
): unknown {
  switch (request.op) {
    case 'open':
      return core.open(request.bytes, request.options)
    case 'pageInfo':
      return core.pageInfo(request.doc, request.index)
    case 'renderPage':
      return core.renderPageSliced(
        request.doc,
        request.index,
        request.options,
        () => signal.aborted,
        signal
      )
    case 'write':
      return core.writeAfterFonts(request.doc, request.input, signal)
    case 'redact':
      return core.redactAfterFonts(request.doc, request.input, signal)
    case 'save':
      return core.save(request.doc, request.mode)
    case 'close':
      core.close(request.doc)
      return undefined
    case 'checkRedaction':
      return core.checkRedaction(request.bytes, request.options)
  }
}

export class InThreadTransport implements Transport {
  readonly #core: EngineCore
  // Yielding between calls lets a queued call be aborted while another runs.
  readonly #queue = new CallQueue(nextTask)
  #destroying: Promise<void> | undefined
  /** Aborted when `destroy()` is called: it stops a running render. */
  readonly #ending = new AbortController()

  constructor(core: EngineCore) {
    this.#core = core
  }

  /** Current size of the WASM heap in bytes. For tests and diagnostics. */
  get heapBytes(): number {
    return this.#core.heapBytes
  }

  call<T>(request: Request, signal?: AbortSignal): Promise<T> {
    return this.#queue.enqueue(() => {
      const stop = signal
        ? AbortSignal.any([signal, this.#ending.signal])
        : this.#ending.signal
      return dispatch(this.#core, request, stop) as T
    }, signal)
  }

  destroy(): Promise<void> {
    this.#ending.abort()
    this.#destroying ??= this.#queue.destroy().then(() => {
      this.#core.destroy()
    })
    return this.#destroying
  }
}

export async function createInThreadTransport(
  source: { wasm: string | URL | Uint8Array },
  options: CoreOptions = {}
): Promise<InThreadTransport> {
  return new InThreadTransport(new EngineCore(await loadNative(source), options))
}
