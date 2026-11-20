import { EngineError } from '../errors.ts'
import { EngineCore } from '../native/core.ts'
import { loadNative } from '../native/module.ts'

import { dispatch } from './in-thread.ts'

import type { FromWorker, ToWorker, WireError } from '../protocol.ts'

/** The parts of a worker's global scope the host uses. */
export interface WorkerScope {
  postMessage(message: FromWorker, transfer?: Transferable[]): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<ToWorker>) => void
  ): void
  addEventListener(type: 'messageerror', listener: () => void): void
}

const STOPPED = 'The engine stopped after an internal error; create a new engine.'

export function toWire(error: unknown): WireError {
  if (error instanceof RangeError) return { range: true, message: error.message }
  if (error instanceof EngineError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.pdfiumError !== undefined && { pdfiumError: error.pdfiumError }),
      ...(error.annotation !== undefined && { annotation: error.annotation }),
      ...(error.page !== undefined && { page: error.page }),
      ...(error.reason !== undefined && { reason: error.reason }),
      ...(error.marks !== undefined && { marks: error.marks }),
      ...(error.kinds !== undefined && { kinds: error.kinds }),
    }
  }
  return {
    code: 'engine-failure',
    message: error instanceof Error ? error.message : String(error),
  }
}

/**
 * Buffers whose ownership moves to the page along with the result. Only an array that spans its
 * whole buffer moves; a view on part of a larger buffer, such as engine memory, is copied.
 */
export function transferables(value: unknown): Transferable[] {
  if (value instanceof Uint8Array || value instanceof Uint8ClampedArray) {
    const whole = value.byteOffset === 0 && value.byteLength === value.buffer.byteLength
    return whole ? [value.buffer as ArrayBuffer] : []
  }
  if (typeof value === 'object' && value !== null && 'data' in value)
    return transferables(value.data)
  return []
}

const loadCore = async (wasm: string | Uint8Array) =>
  new EngineCore(await loadNative({ wasm }))

/** Answers the page's requests on `scope`. `load` is replaced by tests. */
export function serve(
  scope: WorkerScope,
  load: (wasm: string | Uint8Array) => Promise<EngineCore> = loadCore
): void {
  let core: Promise<EngineCore> | undefined
  /** The calls not yet answered, each with whether the page has asked to stop it. */
  const calls = new Map<number, { aborted: boolean }>()

  scope.addEventListener('message', (event) => {
    const message = event.data
    if ('type' in message && message.type === 'abort') {
      // An abort for a call already answered finds nothing and is dropped.
      const call = calls.get(message.id)
      if (call) call.aborted = true
      return
    }
    if ('type' in message) {
      core = load(message.wasm)
      core.then(
        () => {
          scope.postMessage({ type: 'ready' })
        },
        (error: unknown) => {
          scope.postMessage({ type: 'failed', error: toWire(error) })
        }
      )
      return
    }
    const { id, request } = message
    const call = { aborted: false }
    calls.set(id, call)
    void (async () => {
      let ready: EngineCore | undefined
      try {
        ready = await core!
        // A render returns here between slices, so an abort message for it is handled meanwhile.
        const value = await dispatch(ready, request, () => call.aborted)
        calls.delete(id)
        // The pixels move to the page rather than being copied.
        scope.postMessage({ id, ok: true, value }, transferables(value))
      } catch (error) {
        calls.delete(id)
        scope.postMessage({ id, ok: false, error: toWire(error) })
        // The instance is unusable. The page fails what is pending and terminates the worker.
        if (ready?.stopped)
          scope.postMessage({
            type: 'failed',
            error: { code: 'engine-failure', message: STOPPED },
          })
      }
    })()
  })

  // A request that cannot be deserialized has no readable id, so it cannot be answered by id.
  // Report a failure the page treats as fatal: it rejects every pending call and terminates us.
  scope.addEventListener('messageerror', () => {
    scope.postMessage({
      type: 'failed',
      error: {
        code: 'engine-failure',
        message: 'The engine worker could not read a request.',
      },
    })
  })
}
