import { EngineError } from '../errors.ts'

import { CallQueue } from './queue.ts'

import type { EngineErrorCode } from '../errors.ts'
import type { FromWorker, Request, ToWorker, Transport, WireError } from '../protocol.ts'

const failure = (message: string, cause?: unknown) =>
  new EngineError('engine-failure', message, { cause })

function fromWire(error: WireError): Error {
  if (error.range) return new RangeError(error.message)
  return new EngineError(error.code as EngineErrorCode, error.message, {
    ...(error.pdfiumError !== undefined && { pdfiumError: error.pdfiumError }),
  })
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

class WorkerTransport implements Transport {
  readonly #worker: Worker
  readonly #queue = new CallQueue()
  readonly #pending = new Map<number, Pending>()
  #nextId = 1
  #dead: EngineError | undefined
  #destroying: Promise<void> | undefined

  constructor(worker: Worker) {
    this.#worker = worker
  }

  /** Handles a reply to a request; start-up replies are handled by `createWorkerTransport`. */
  handle(message: FromWorker): void {
    if (!('id' in message)) return
    const pending = this.#pending.get(message.id)
    if (!pending) return
    this.#pending.delete(message.id)
    if (message.ok) pending.resolve(message.value)
    else pending.reject(fromWire(message.error))
  }

  /** The worker is unusable: reject everything in flight and stop it. */
  fail(error: EngineError): void {
    this.#dead ??= error
    for (const pending of this.#pending.values()) pending.reject(this.#dead)
    this.#pending.clear()
    this.#worker.terminate()
  }

  call<T>(request: Request, signal?: AbortSignal): Promise<T> {
    return this.#queue.enqueue(() => {
      if (this.#dead) throw this.#dead
      return new Promise<T>((resolve, reject) => {
        const id = this.#nextId++
        this.#pending.set(id, { resolve: resolve as Pending['resolve'], reject })
        let sent = request
        const transfer: Transferable[] = []
        if (request.op === 'open') {
          // The engine hands over a private copy; a view on a larger buffer is copied first.
          const { bytes } = request
          const own =
            bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
          const owned = own ? bytes : bytes.slice()
          sent = { ...request, bytes: owned }
          transfer.push(owned.buffer as ArrayBuffer)
        }
        const message: ToWorker = { id, request: sent }
        try {
          this.#worker.postMessage(message, transfer)
        } catch (error) {
          this.#pending.delete(id)
          reject(failure('The request could not be sent to the engine worker.', error))
        }
      })
    }, signal)
  }

  destroy(): Promise<void> {
    this.#destroying ??= this.#queue.destroy().then(() => {
      this.#dead ??= failure('The engine is destroyed.')
      this.#worker.terminate()
    })
    return this.#destroying
  }
}

export async function createWorkerTransport(
  worker: Worker,
  wasm: string | URL | Uint8Array
): Promise<Transport> {
  const transport = new WorkerTransport(worker)
  // The worker's base URL can differ from the page's.
  const source =
    wasm instanceof Uint8Array ? wasm : new URL(wasm, globalThis.location?.href).href
  const where = wasm instanceof Uint8Array ? 'the supplied bytes' : String(source)

  await new Promise<void>((resolve, reject) => {
    const fail = (error: EngineError) => {
      transport.fail(error)
      reject(error)
    }
    worker.addEventListener('message', (event: MessageEvent<FromWorker>) => {
      const message = event.data
      if ('type' in message) {
        if (message.type === 'ready') resolve()
        else
          fail(
            new EngineError(
              'engine-failure',
              `Could not load the PDF engine from ${where}.`,
              { cause: fromWire(message.error) }
            )
          )
      } else transport.handle(message)
    })
    worker.addEventListener('error', (event) => {
      fail(failure(`The engine worker failed: ${event.message || 'it could not start'}.`))
    })
    worker.addEventListener('messageerror', () => {
      fail(failure('The engine worker sent a message that could not be read.'))
    })
    const init: ToWorker = { type: 'init', wasm: source }
    worker.postMessage(init)
  })
  return transport
}
