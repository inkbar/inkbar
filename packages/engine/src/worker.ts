import { EngineError } from './errors.ts'
import { EngineCore } from './native/core.ts'
import { loadNative } from './native/module.ts'
import { dispatch } from './transport/in-thread.ts'

import type { FromWorker, ToWorker, WireError } from './protocol.ts'

const scope = self as unknown as {
  postMessage(message: FromWorker, transfer?: Transferable[]): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<ToWorker>) => void
  ): void
  addEventListener(type: 'messageerror', listener: () => void): void
}

function toWire(error: unknown): WireError {
  if (error instanceof RangeError)
    return { code: 'range-error', message: error.message, range: true }
  if (error instanceof EngineError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.pdfiumError !== undefined && { pdfiumError: error.pdfiumError }),
    }
  }
  return {
    code: 'engine-failure',
    message: error instanceof Error ? error.message : String(error),
  }
}

/** Buffers whose ownership moves to the page along with the result. */
function transferables(value: unknown): Transferable[] {
  if (value instanceof Uint8Array || value instanceof Uint8ClampedArray)
    return [value.buffer as ArrayBuffer]
  if (typeof value === 'object' && value !== null && 'data' in value)
    return transferables(value.data)
  return []
}

let core: Promise<EngineCore> | undefined

scope.addEventListener('message', (event) => {
  const message = event.data
  if ('type' in message) {
    core = loadNative({ wasm: message.wasm }).then((native) => new EngineCore(native))
    core.then(
      () => scope.postMessage({ type: 'ready' }),
      (error: unknown) => scope.postMessage({ type: 'failed', error: toWire(error) })
    )
    return
  }
  const { id, request } = message
  void (async () => {
    try {
      const value = dispatch(await core!, request)
      scope.postMessage({ id, ok: true, value }, transferables(value))
    } catch (error) {
      scope.postMessage({ id, ok: false, error: toWire(error) })
    }
  })()
})

// A request that cannot be deserialized has no readable id, so it cannot be answered by id.
// Report a failure the page treats as fatal: it rejects every pending call and terminates us.
scope.addEventListener('messageerror', () => {
  scope.postMessage({
    type: 'failed',
    error: { code: 'engine-failure', message: 'A request could not be read.' },
  })
})
