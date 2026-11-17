// Writes a document through @inkbar/engine, which it loads only through the host's loader: one
// engine and one open copy of the file, kept for the next save. Nothing here imports the engine
// or names its types: this module's types are public, and a host without the engine checks them.
import { InkError, isInkError } from '../errors'

import { AnnotationUnwritable } from './write-input'

/** What a save writes, as far as the saver looks into it: the engine's `WriteInput` fits. */
export interface SaveInput {
  remove?: readonly { page: number; objectNumber: number }[]
  annotations?: readonly object[]
  fields?: Readonly<Record<string, { value: string | readonly string[]; text?: string }>>
}

/**
 * What core asks of the engine's open document when it saves. Declared here, by shape, so that
 * core's types name nothing from @inkbar/engine and a host without the engine can still check
 * them.
 */
export interface SaveEngineDocument {
  /** Writes annotations and form values into the document as it was opened. */
  write(input: SaveInput): Promise<void>
  /** The document's bytes, with what was written. */
  save(): Promise<Uint8Array>
}

/** What core asks of an engine when it saves: see `SaveEngineDocument`. */
export interface SaveEngine {
  open(bytes: Uint8Array, options?: { password?: string }): Promise<SaveEngineDocument>
  destroy(): Promise<void>
}

/**
 * Loads @inkbar/engine; `() => import('@inkbar/engine')` is one. Core calls `createEngine` with
 * no options: a host that serves the engine's files itself wraps it to pass their URLs.
 */
export type EngineLoader = () => Promise<{
  createEngine: () => Promise<SaveEngine>
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
   * A `SaveFailed` says why in `details.stage`: `'engine'` when the loader or `createEngine`
   * failed (the engine could not be fetched or started, as when offline), `'write'` when the
   * engine could not open or write this file, or the input could not be painted. When one
   * annotation could not be painted or written, `details.annotation` is its id.
   */
  write(key: string, input: () => Promise<SaveInput>): Promise<Uint8Array>
  /** Destroys the engine. A write in flight rejects with `DocumentDestroyed`. */
  destroy(): void
}

interface Session {
  engine: SaveEngine
  doc: SaveEngineDocument
}

const destroyedError = (): InkError =>
  new InkError('DocumentDestroyed', 'The document has been destroyed')

/** The loader or `createEngine` failed: the engine never started, whatever the file. */
class NotStarted extends Error {
  constructor(cause: unknown) {
    super('The engine did not start', { cause })
  }
}

/** An `EngineError`, told by its name: core never imports the engine's classes. */
const engineCode = (e: unknown): string | undefined =>
  e instanceof Error && e.name === 'EngineError'
    ? (e as Error & { code?: string }).code
    : undefined

/** The id of the annotation an `EngineError` says it could not write, if it names one. */
const engineAnnotation = (e: unknown): string | undefined => {
  if (engineCode(e) !== 'write-failed') return undefined
  const id = (e as Error & { annotation?: unknown }).annotation
  return typeof id === 'string' ? id : undefined
}

/**
 * The engine's codes for an engine that has stopped: an internal error, or an allocation that
 * failed inside it. Every later call on that engine fails, so the session is dropped.
 */
const STOPPED_CODES: ReadonlySet<string | undefined> = new Set([
  'engine-failure',
  'out-of-memory',
])

export function createSaver(options: SaverOptions): Saver {
  let destroyed = false
  let session: Promise<Session> | undefined
  let last: { key: string; bytes: Promise<Uint8Array> } | undefined

  const quietly = (p: Promise<unknown>) => void p.catch(() => undefined)

  /** The engine and the file open in it, made on first use and kept. */
  const open = (): Promise<Session> => {
    const made = (async () => {
      let engine: SaveEngine
      try {
        const { createEngine } = await options.loader()
        if (destroyed) throw destroyedError()
        engine = await createEngine()
      } catch (error) {
        throw isInkError(error) ? error : new NotStarted(error)
      }
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
    if (error instanceof NotStarted)
      return new InkError(
        'SaveFailed',
        'The engine could not be loaded or started',
        { stage: 'engine' },
        error.cause
      )
    // One annotation's drawing could not be painted: the cause says why.
    if (error instanceof AnnotationUnwritable)
      return new InkError(
        'SaveFailed',
        `The annotation ${error.annotation} could not be written into this file`,
        { stage: 'write', annotation: error.annotation },
        error.cause
      )
    // An EngineError from opening or writing the file.
    const annotation = engineAnnotation(error)
    return new InkError(
      'SaveFailed',
      annotation === undefined
        ? 'The changes could not be written into this file'
        : `The annotation ${annotation} could not be written into this file`,
      annotation === undefined ? { stage: 'write' } : { stage: 'write', annotation },
      error
    )
  }

  /**
   * The end of the last write's turn. A write and its save are two engine calls on one
   * document, and each write starts from the file as opened, so a second write between them
   * would change what the first one saves. Each runs only after the one before has saved.
   */
  let turn: Promise<unknown> = Promise.resolve()
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const result = turn.then(work)
    turn = result.catch(() => undefined)
    return result
  }

  const run = async (input: () => Promise<SaveInput>): Promise<Uint8Array> => {
    const written = await input()
    if (destroyed) throw destroyedError()
    return exclusive(async () => {
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
        if (STOPPED_CODES.has(engineCode(error))) drop(current)
        throw error
      }
    })
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
