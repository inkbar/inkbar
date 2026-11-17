// Writes a document through @inkbar/engine, which it loads only through the host's loader: one
// engine and one open copy of the file, kept for the next save. Nothing here imports the engine.
import { InkError, isInkError } from '../errors'

import type { Engine, EngineDocument, EngineOptions, WriteInput } from '@inkbar/engine'

/**
 * Loads @inkbar/engine; `() => import('@inkbar/engine')` is one. Core calls `createEngine` with
 * no options: a host that serves the engine's files itself wraps it to pass their URLs.
 */
export type EngineLoader = () => Promise<{
  createEngine: (options?: EngineOptions) => Promise<Engine>
}>

export interface SaverOptions {
  loader: EngineLoader
  /** The bytes the document was opened from. */
  bytes: () => Promise<Uint8Array>
  /** The password the document was opened with. */
  password: string | undefined
}

export interface Saver {
  /**
   * The file with `input()` written into it. `key` names what is written: a call with the key
   * of the last write gets that write's result, running or done, without writing again. Each
   * call resolves with its own copy of the bytes. Rejects with `SaveFailed` when the engine
   * cannot write or the input cannot be painted, and with `DocumentDestroyed` once destroyed.
   */
  write(key: string, input: () => Promise<WriteInput>): Promise<Uint8Array>
  /** Destroys the engine. A write in flight rejects with `DocumentDestroyed`. */
  destroy(): void
}

interface Session {
  engine: Engine
  doc: EngineDocument
}

const destroyedError = (): InkError =>
  new InkError('DocumentDestroyed', 'The document has been destroyed')

/** An `EngineError`, told by its name: core never imports the engine's classes. */
const engineCode = (e: unknown): string | undefined =>
  e instanceof Error && e.name === 'EngineError'
    ? (e as Error & { code?: string }).code
    : undefined

export function createSaver(options: SaverOptions): Saver {
  let destroyed = false
  let session: Promise<Session> | undefined
  let last: { key: string; bytes: Promise<Uint8Array> } | undefined

  const quietly = (p: Promise<unknown>) => void p.catch(() => undefined)

  /** The engine and the file open in it, made on first use and kept. */
  const open = (): Promise<Session> => {
    const made = (async () => {
      const { createEngine } = await options.loader()
      if (destroyed) throw destroyedError()
      const engine = await createEngine()
      if (destroyed) {
        quietly(engine.destroy())
        throw destroyedError()
      }
      try {
        const bytes = await options.bytes()
        const doc = await engine.open(
          bytes,
          options.password ? { password: options.password } : {}
        )
        return { engine, doc }
      } catch (error) {
        quietly(engine.destroy())
        throw error
      }
    })()
    session = made
    // A session that failed to start is not kept: the next save tries again.
    made.catch(() => {
      if (session === made) session = undefined
    })
    return made
  }

  /** Drops the session, destroying its engine; the next save starts a new one. */
  const drop = (which: Promise<Session> | undefined) => {
    if (!which) return
    if (session === which) session = undefined
    quietly(which.then((s) => s.engine.destroy()))
  }

  const failed = (error: unknown): unknown => {
    if (destroyed) return destroyedError()
    if (isInkError(error)) return error
    // An EngineError, an UnpaintableError, or a loader that could not load the engine.
    return new InkError(
      'SaveFailed',
      'The changes could not be written into this file',
      {},
      error
    )
  }

  const run = async (input: () => Promise<WriteInput>): Promise<Uint8Array> => {
    const written = await input()
    if (destroyed) throw destroyedError()
    const current = session ?? open()
    const { doc } = await current
    if (destroyed) throw destroyedError()
    try {
      await doc.write(written)
      const bytes = await doc.save()
      if (destroyed) throw destroyedError()
      return bytes
    } catch (error) {
      if (engineCode(error) === 'engine-failure') drop(current)
      throw error
    }
  }

  return {
    write(key, input) {
      if (destroyed) return Promise.reject(destroyedError())
      let entry = last
      if (entry?.key !== key) {
        const made = { key, bytes: run(input) }
        entry = last = made
        // A failed write is not kept: the next save writes again.
        made.bytes.catch(() => {
          if (last === made) last = undefined
        })
      }
      return entry.bytes.then(
        (bytes) => {
          if (destroyed) throw destroyedError()
          return bytes.slice()
        },
        (error: unknown) => {
          throw failed(error)
        }
      )
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      last = undefined
      drop(session)
    },
  }
}
