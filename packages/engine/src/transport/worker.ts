import { EngineError } from '../errors.ts'

import { CallQueue } from './queue.ts'

import type { FontSources } from '../fonts.ts'
import type { FromWorker, Request, ToWorker, Transport, WireError } from '../protocol.ts'
import type { FontKey } from '../types.ts'

const failure = (message: string, cause?: unknown) =>
  new EngineError('engine-failure', message, { cause })

export function fromWire(error: WireError): Error {
  if (error.range) return new RangeError(error.message)
  return new EngineError(error.code, error.message, {
    ...(error.pdfiumError !== undefined && { pdfiumError: error.pdfiumError }),
    ...(error.annotation !== undefined && { annotation: error.annotation }),
    ...(error.page !== undefined && { page: error.page }),
    ...(error.reason !== undefined && { reason: error.reason }),
    ...(error.marks !== undefined && { marks: error.marks }),
    ...(error.kinds !== undefined && { kinds: error.kinds }),
  })
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  /**
   * Asks the worker to stop the call; set for the calls that can stop part way: a render or
   * annotation draw, and a text read, write or redact while it waits for a fallback font.
   */
  abort?: () => void
}

class WorkerTransport implements Transport {
  readonly #worker: Worker
  readonly #queue = new CallQueue()
  readonly #pending = new Map<number, Pending>()
  #nextId = 1
  readonly #destroyTimeout: number
  #dead: EngineError | undefined
  #destroying: Promise<void> | undefined

  constructor(worker: Worker, destroyTimeout: number) {
    this.#worker = worker
    this.#destroyTimeout = destroyTimeout
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

  call<T>(
    request: Request,
    signal?: AbortSignal,
    options?: { background?: boolean }
  ): Promise<T> {
    return this.#queue.enqueue(
      () => {
        // The worker and its documents are gone, so there is nothing left to close.
        if (this.#dead && request.op === 'close') return undefined as T
        if (this.#dead) throw this.#dead
        return new Promise<T>((resolve, reject) => {
          const id = this.#nextId++
          const stoppable =
            request.op === 'renderPage' ||
            request.op === 'renderAnnotations' ||
            request.op === 'pageText' ||
            request.op === 'write' ||
            request.op === 'redact'
          const abort = () => {
            // Only while the call is unanswered: once the reply has arrived it stands.
            if (!this.#pending.has(id)) return
            const message: ToWorker = { type: 'abort', id }
            try {
              this.#worker.postMessage(message)
            } catch {
              // The worker is gone; `fail` or `destroy` settles the call.
            }
          }
          const settled = () => signal?.removeEventListener('abort', abort)
          this.#pending.set(id, {
            resolve: (value) => {
              settled()
              resolve(value as T)
            },
            reject: (reason) => {
              settled()
              reject(reason)
            },
            ...(stoppable && { abort }),
          })
          let sent = request
          const transfer: Transferable[] = []
          if (request.op === 'open' || request.op === 'checkRedaction') {
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
            return
          }
          // A call that can stop part way does so when its signal aborts; the worker then answers
          // `aborted`.
          if (stoppable && signal) {
            if (signal.aborted) abort()
            else signal.addEventListener('abort', abort, { once: true })
          }
        })
      },
      signal,
      options
    )
  }

  /**
   * Rejects queued calls, stops a running render, or a text read, write or redact waiting for a
   * font, waits up to the bound for the running call, then terminates the worker. A running call
   * that has not answered by then rejects with `aborted`.
   */
  destroy(): Promise<void> {
    this.#destroying ??= this.#destroy()
    return this.#destroying
  }

  async #destroy(): Promise<void> {
    const drained = this.#queue.destroy()
    for (const pending of this.#pending.values()) pending.abort?.()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = await Promise.race([
      drained.then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => {
          resolve(true)
        }, this.#destroyTimeout)
      }),
    ])
    clearTimeout(timer)
    this.#dead ??= failure('The engine is destroyed.')
    this.#worker.terminate()
    if (!timedOut) return
    // Terminating the worker released its documents; settle the call it never answered.
    const aborted = new EngineError(
      'aborted',
      'The call was aborted because the engine was destroyed.'
    )
    for (const pending of this.#pending.values()) pending.reject(aborted)
    this.#pending.clear()
    await drained
  }
}

/**
 * The font sources with each URL made absolute against the page, since the worker's base URL can
 * differ from the page's. Bytes pass through.
 */
function absoluteSources(
  sources: FontSources | undefined
): Partial<Record<FontKey, string | Uint8Array>> | undefined {
  if (!sources) return undefined
  const out: Partial<Record<FontKey, string | Uint8Array>> = {}
  for (const [key, source] of Object.entries(sources) as [
    FontKey,
    FontSources[FontKey],
  ][]) {
    if (source === undefined) continue
    if (source instanceof Uint8Array) {
      out[key] = source
      continue
    }
    try {
      out[key] = new URL(source, globalThis.location?.href).href
    } catch (cause) {
      throw failure(
        `The fallback font URL ${String(source)} for ${key} is not valid.`,
        cause
      )
    }
  }
  return out
}

/** Longest the worker may take to answer its first message. */
const START_TIMEOUT_MS = 60_000
/** Longest `destroy()` waits for the running call before it terminates the worker. */
const DESTROY_TIMEOUT_MS = 2_000

export async function createWorkerTransport(
  worker: Worker,
  wasm: string | URL | Uint8Array,
  // Internal: `url` names the worker script in errors, and `hint` follows what they say when the
  // worker cannot start; tests shorten the two bounds.
  options: {
    url?: string | undefined
    hint?: string | undefined
    startTimeout?: number
    destroyTimeout?: number
    fallbackFonts?: FontSources | undefined
  } = {}
): Promise<Transport> {
  const transport = new WorkerTransport(
    worker,
    options.destroyTimeout ?? DESTROY_TIMEOUT_MS
  )
  const named = options.url === undefined ? '' : ` at ${options.url}`
  const hint = options.hint === undefined ? '' : ` ${options.hint}`
  let source: string | Uint8Array
  try {
    // The worker's base URL can differ from the page's.
    source =
      wasm instanceof Uint8Array ? wasm : new URL(wasm, globalThis.location?.href).href
  } catch (cause) {
    worker.terminate()
    throw failure(`The engine's wasm URL ${String(wasm)} is not valid.`, cause)
  }
  let fallbackFonts: Partial<Record<FontKey, string | Uint8Array>> | undefined
  try {
    fallbackFonts = absoluteSources(options.fallbackFonts)
  } catch (error) {
    worker.terminate()
    throw error
  }
  const where = wasm instanceof Uint8Array ? 'the supplied bytes' : source.toString()
  let started = false

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      fail(failure(`The engine worker${named} did not start in time.${hint}`))
    }, options.startTimeout ?? START_TIMEOUT_MS)
    const fail = (error: EngineError) => {
      clearTimeout(timer)
      transport.fail(error)
      reject(error)
    }
    worker.addEventListener('message', (event: MessageEvent<FromWorker>) => {
      const message = event.data
      if ('type' in message) {
        if (message.type === 'ready') {
          started = true
          clearTimeout(timer)
          resolve()
        } else
          fail(
            started
              ? // The worker stopped: it could not read a request or hit an internal error.
                failure(message.error.message)
              : new EngineError(
                  'engine-failure',
                  `Could not load the PDF engine from ${where}.`,
                  { cause: fromWire(message.error) }
                )
          )
      } else transport.handle(message)
    })
    worker.addEventListener('error', (event) => {
      const why = event.message || 'it could not be loaded or started'
      fail(failure(`The engine worker${named} failed: ${why}.${started ? '' : hint}`))
    })
    worker.addEventListener('messageerror', () => {
      fail(failure('The engine worker sent a message that could not be read.'))
    })
    const init: ToWorker = {
      type: 'init',
      wasm: source,
      ...(fallbackFonts && { fallbackFonts }),
    }
    try {
      worker.postMessage(init)
    } catch (cause) {
      fail(failure('Could not start the engine worker.', cause))
    }
  })
  return transport
}
