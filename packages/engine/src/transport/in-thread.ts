import { EngineCore, nextTask, type CoreOptions } from '../native/core.ts'
import { loadNative } from '../native/module.ts'
import { anySignal } from '../signals.ts'

import { CallQueue } from './queue.ts'

import type { Request, Transport } from '../protocol.ts'

/**
 * Runs a request on the core. A render, annotation draw, text read, write or redact first fetches
 * the fallback fonts of the pages it loads; that fetch, and a render's or draw's slices, stop
 * once `signal` aborts.
 * Every other call runs to the end. With no font sources a text read, write or redact runs at
 * once, as it did before the engine had fonts.
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
    case 'pageText':
      if (!core.fetchesFonts) return core.pageText(request.doc, request.index)
      return core.pageTextAfterFonts(request.doc, request.index, signal)
    case 'pageLinks':
      return core.pageLinks(request.doc, request.index)
    case 'documentFacts':
      return core.documentFacts(request.doc)
    case 'pageAnnotations':
      return core.pageAnnotations(request.doc, request.index)
    case 'formFields':
      return core.formFields(request.doc)
    case 'scripts':
      return core.scripts(request.doc)
    case 'structureOrder':
      return core.structureOrder(request.doc, request.index)
    case 'outline':
      return core.outline(request.doc)
    case 'namedDestination':
      return core.namedDestination(request.doc, request.name)
    case 'renderPage':
      return core.renderPageSliced(
        request.doc,
        request.index,
        request.options,
        () => signal.aborted,
        signal
      )
    case 'renderAnnotations':
      return core.renderAnnotationsSliced(
        request.doc,
        request.index,
        request.options,
        () => signal.aborted,
        signal
      )
    case 'write':
      if (!core.fetchesFonts) {
        core.write(request.doc, request.input)
        return undefined
      }
      return core.writeAfterFonts(request.doc, request.input, signal)
    case 'redact':
      if (!core.fetchesFonts) return core.redact(request.doc, request.input)
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
      // Only a call that can stop part way listens to the caller's signal once it runs.
      const stoppable =
        request.op === 'renderPage' ||
        request.op === 'renderAnnotations' ||
        (this.#core.fetchesFonts &&
          (request.op === 'pageText' ||
            request.op === 'write' ||
            request.op === 'redact'))
      if (!stoppable || !signal)
        return dispatch(this.#core, request, this.#ending.signal) as T
      const stop = anySignal([signal, this.#ending.signal])
      let result: unknown
      try {
        result = dispatch(this.#core, request, stop.signal)
      } catch (error) {
        stop.dispose()
        throw error
      }
      if (result instanceof Promise) return result.finally(stop.dispose) as T
      stop.dispose()
      return result as T
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
