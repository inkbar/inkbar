import { EngineCore } from '../native/core.ts'
import { loadNative } from '../native/module.ts'

import { CallQueue } from './queue.ts'

import type { Request, Transport } from '../protocol.ts'

const nextMacrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

export function dispatch(core: EngineCore, request: Request): unknown {
  switch (request.op) {
    case 'open':
      return core.open(request.bytes, request.options)
    case 'pageInfo':
      return core.pageInfo(request.doc, request.index)
    case 'renderPage':
      return core.renderPage(request.doc, request.index, request.scale)
    case 'save':
      return core.save(request.doc, request.mode)
    case 'close':
      core.close(request.doc)
      return undefined
  }
}

export class InThreadTransport implements Transport {
  readonly #core: EngineCore
  // Yielding between calls lets a queued call be aborted while another runs.
  readonly #queue = new CallQueue(nextMacrotask)
  #destroying: Promise<void> | undefined

  constructor(core: EngineCore) {
    this.#core = core
  }

  call<T>(request: Request, signal?: AbortSignal): Promise<T> {
    return this.#queue.enqueue(() => dispatch(this.#core, request) as T, signal)
  }

  destroy(): Promise<void> {
    this.#destroying ??= this.#queue.destroy().then(() => {
      this.#core.destroy()
    })
    return this.#destroying
  }
}

export async function createInThreadTransport(source: {
  wasm: string | URL | Uint8Array
}): Promise<InThreadTransport> {
  return new InThreadTransport(new EngineCore(await loadNative(source)))
}
