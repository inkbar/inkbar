// Writes a document through @inkbar/engine, which it loads only through the host's loader: one
// engine and one open copy of the file, kept for the next save. Nothing here imports the engine
// or names its types: this module's types are public, and a host without the engine checks them.
import { InkError, isInkError } from '../errors'

import { AnnotationUnwritable } from './write-input'

import type { Quad, Rect } from '../geometry'

/** What a save writes, as far as the saver looks into it: the engine's `WriteInput` fits. */
export interface SaveInput {
  remove?: readonly { page: number; objectNumber: number }[]
  annotations?: readonly object[]
  fields?: Readonly<Record<string, { value: string | readonly string[]; text?: string }>>
}

/** What applying redactions writes, as far as the saver looks into it: the engine's `RedactInput` fits. */
export interface RedactSaveInput extends SaveInput {
  /** The marks, each with the overlay left in its place as its appearance. */
  marks: readonly object[]
}

/** What sanitising removed from a redacted file. */
export interface RedactionSanitised {
  /** The document information dictionary or XMP metadata. */
  metadata: boolean
  /** The number of attached files. */
  attachments: number
  /** JavaScript: document scripts and script actions. */
  scripts: boolean
  /** Page thumbnails. */
  thumbnails: boolean
  /** Private application data and links to full-resolution originals. */
  privateData: boolean
}

/** What the engine says an apply did: the engine's `RedactResult`, by shape. */
export interface RedactEngineResult {
  /** Per page with marks applied: the marks, and the file annotations removed, pop-ups included. */
  pages: readonly { page: number; marks: number; annotationsRemoved: number }[]
  /** Inkbar's own earlier marks applied where they came back locked, in an encrypted file. */
  ownLockedMarks: number
  /** Redact annotations from other programs, left in the file unapplied. */
  foreignMarks: number
  /** The form fields not written because a mark removed their widgets. */
  fieldsSkipped: readonly string[]
  sanitised: RedactionSanitised
  /** Whether the file has layers that are hidden. They are not cleaned. */
  hiddenLayers: boolean
  /** Whether the file held a digital signature, which stops verifying. */
  signed: boolean
}

/** A place the check looks under: one mark's quads on a page, in user space. */
export interface RedactionRegion {
  page: number
  quads: readonly Quad[]
}

/** A place the check looked under, and what it found there. */
export interface RedactionCandidate {
  /** Page index, from 0. */
  page: number
  /** For `kind: 'region'`, the index of the region it answers in the list checked. */
  region?: number
  /** The place, in user space. */
  rect: Rect
  kind: 'region' | 'redact-annotation' | 'filled-box' | 'annotation-box'
  /** Text that text extraction can read under it. */
  text: 'none' | 'present'
  /** Image samples under it that are not one flat value. */
  image: 'none' | 'present'
  /** Vector paths or shadings crossing it. */
  drawing: 'none' | 'present'
  /** `clean` when nothing was found under it. */
  verdict: 'clean' | 'content-remains' | 'unapplied'
}

/**
 * What the check of a redacted file found: the engine's `RedactionFindings`, by shape. Places,
 * counts and flags, never text from the file.
 */
export interface RedactionFindings {
  /** Page by page; on a page, regions in the order given. */
  candidates: readonly RedactionCandidate[]
  file: {
    /** Revisions kept before the last one. */
    earlierVersions: number
    metadata: boolean
    attachments: number
    scripts: boolean
    hiddenLayers: boolean
    signed: boolean
  }
}

/**
 * What core asks of the engine's open document when it saves. Declared here, by shape, so that
 * core's types name nothing from @inkbar/engine and a host without the engine can still check
 * them.
 */
export interface SaveEngineDocument {
  /** Writes annotations and form values into the document as it was opened. */
  write(input: SaveInput): Promise<void>
  /**
   * Applies redaction marks to the document as it was opened, writes the rest after them and
   * sanitises. After it, `save` rewrites and `write` rejects.
   */
  redact(input: RedactSaveInput): Promise<RedactEngineResult>
  /** The document's bytes, with what was written. */
  save(): Promise<Uint8Array>
  /** Frees the document. */
  close(): Promise<void>
}

/** What core asks of an engine when it saves: see `SaveEngineDocument`. */
export interface SaveEngine {
  open(bytes: Uint8Array, options?: { password?: string }): Promise<SaveEngineDocument>
  /** Checks what is left under each region of a file the engine just redacted. */
  checkRedaction(
    bytes: Uint8Array,
    options?: { password?: string; regions?: readonly RedactionRegion[] }
  ): Promise<RedactionFindings>
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
  /**
   * Applies `input()` to the file as opened, saves it and checks the saved bytes under
   * `regions`, in the same turn as writes, so it never overlaps one. Rejects with
   * `RedactionFailed` when the engine cannot be started, cannot apply or write the input, or
   * cannot check the bytes, and with `DocumentDestroyed` once destroyed. `details.stage` says
   * which: `'engine'`, `'apply'` or `'verify'`; `details.page` and `details.annotation` name
   * the page and the annotation when the engine named one.
   */
  redact(
    input: () => Promise<RedactSaveInput>,
    regions: readonly RedactionRegion[]
  ): Promise<{
    bytes: Uint8Array
    result: RedactEngineResult
    findings: RedactionFindings
  }>
  /** Destroys the engine. A write in flight rejects with `DocumentDestroyed`. */
  destroy(): void
}

interface Session {
  engine: SaveEngine
  doc: SaveEngineDocument
  /** A redaction ran on `doc`: it takes no more writes, so the file is opened again. */
  spent: boolean
}

const destroyedError = (): InkError =>
  new InkError('DocumentDestroyed', 'The document has been destroyed')

/** The loader or `createEngine` failed: the engine never started, whatever the file. */
class NotStarted extends Error {
  constructor(cause: unknown) {
    super('The engine did not start', { cause })
  }
}

/** The check of a redacted file failed or could not run: `cause` says why. */
class NotChecked extends Error {
  constructor(cause: unknown) {
    super('The redacted file could not be checked', { cause })
  }
}

/** An `EngineError`, told by its name: core never imports the engine's classes. */
const engineCode = (e: unknown): string | undefined =>
  e instanceof Error && e.name === 'EngineError'
    ? (e as Error & { code?: string }).code
    : undefined

/** The id of the annotation an `EngineError` says it could not write or apply, if it names one. */
const engineAnnotation = (e: unknown): string | undefined => {
  const code = engineCode(e)
  if (code !== 'write-failed' && code !== 'redaction-failed') return undefined
  const id = (e as Error & { annotation?: unknown }).annotation
  return typeof id === 'string' ? id : undefined
}

/** The page an `EngineError` names, if it names one. */
const enginePage = (e: unknown): number | undefined => {
  if (engineCode(e) === undefined) return undefined
  const page = (e as Error & { page?: unknown }).page
  return typeof page === 'number' ? page : undefined
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
  const passwordOption = options.password ? { password: options.password } : {}

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
        const doc = await engine.open(bytes, passwordOption)
        return { engine, doc, spent: false }
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

  /** The session's document, opened again from the file when a redaction has spent it. */
  const docOf = async (s: Session): Promise<SaveEngineDocument> => {
    if (!s.spent) return s.doc
    await s.doc.close()
    const bytes = await options.bytes()
    if (destroyed) throw destroyedError()
    s.doc = await s.engine.open(bytes, passwordOption)
    s.spent = false
    return s.doc
  }

  const redactFailed = (error: unknown): unknown => {
    if (destroyed) return destroyedError()
    if (isInkError(error)) return error
    if (error instanceof NotStarted)
      return new InkError(
        'RedactionFailed',
        'The engine could not be loaded or started',
        { stage: 'engine' },
        error.cause
      )
    if (error instanceof AnnotationUnwritable)
      return new InkError(
        'RedactionFailed',
        `The annotation ${error.annotation} could not be written into this file`,
        { stage: 'apply', annotation: error.annotation },
        error.cause
      )
    if (error instanceof NotChecked) {
      const page = enginePage(error.cause)
      return new InkError(
        'RedactionFailed',
        'The redacted file could not be checked',
        { stage: 'verify', ...(page !== undefined && { page }) },
        error.cause
      )
    }
    const page = enginePage(error)
    const annotation = engineAnnotation(error)
    return new InkError(
      'RedactionFailed',
      annotation === undefined
        ? 'The redactions could not be applied to this file'
        : `The annotation ${annotation} could not be applied to this file`,
      {
        stage: 'apply',
        ...(page !== undefined && { page }),
        ...(annotation !== undefined && { annotation }),
      },
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
      const s = await current
      if (destroyed) throw destroyedError()
      try {
        const doc = await docOf(s)
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

  const redact: Saver['redact'] = async (input, regions) => {
    try {
      if (destroyed) throw destroyedError()
      const written = await input()
      if (destroyed) throw destroyedError()
      return await exclusive(async () => {
        if (destroyed) throw destroyedError()
        const current = session ?? open()
        const s = await current
        if (destroyed) throw destroyedError()
        try {
          const doc = await docOf(s)
          // Spent from here, whether the apply works or not: the next write opens the file again.
          s.spent = true
          const result = await doc.redact(written)
          const bytes = await doc.save()
          if (destroyed) throw destroyedError()
          // Whatever the check throws, the file has not passed it.
          // A throw as the call is made counts, not only a rejection.
          const findings = await (async () =>
            s.engine.checkRedaction(bytes, { ...passwordOption, regions }))().catch(
            (cause: unknown) => {
              throw new NotChecked(cause)
            }
          )
          if (destroyed) throw destroyedError()
          return { bytes, result, findings }
        } catch (error) {
          const cause = error instanceof NotChecked ? error.cause : error
          if (STOPPED_CODES.has(engineCode(cause))) drop(current)
          throw error
        }
      })
    } catch (error) {
      throw redactFailed(error)
    }
  }

  return {
    redact,
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
