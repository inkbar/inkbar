// Writes a document through @inkbar/engine, with an engine lent for each write: the one the
// document's reader holds, or one started for the write while the reader has stopped. Nothing here
// imports the engine or names its types: some of this module's types are public.
import { InkError, isInkError } from '../errors'

import { AnnotationUnwritable } from './write-input'

import type { Quad, Rect } from '../geometry'

/**
 * @internal What a save writes, as far as the saver looks into it: the engine's `WriteInput`
 * fits.
 */
export interface SaveInput {
  remove?: readonly { page: number; objectNumber: number }[]
  annotations?: readonly object[]
  fields?: Readonly<Record<string, { value: string | readonly string[]; text?: string }>>
}

/**
 * @internal What applying redactions writes, as far as the saver looks into it: the engine's
 * `RedactInput` fits.
 */
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

/** @internal What the engine says an apply did: the engine's `RedactResult`, by shape. */
export interface RedactEngineResult {
  /** Per page with marks applied: the marks, and the file annotations removed, pop-ups included. */
  pages: readonly { page: number; marks: number; annotationsRemoved: number }[]
  /** Inkbar's own earlier marks applied where they came back locked, in an encrypted file. */
  ownLockedMarks: number
  /** The regions of those marks, per page, read before the apply removed them. */
  ownLockedRegions: readonly RedactionRegion[]
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

/** @internal What core asks of the engine's open document when it saves, by shape. */
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

/** @internal What core asks of an engine when it saves: see `SaveEngineDocument`. */
export interface SaveEngine {
  /**
   * Opens `bytes` for a save. The engine copies them: it must not transfer them (to a worker,
   * say) or change them, as the caller may still be reading them.
   */
  open(bytes: Uint8Array, options?: { password?: string }): Promise<SaveEngineDocument>
  /** Checks what is left under each region of a file the engine just redacted. */
  checkRedaction(
    bytes: Uint8Array,
    options?: { password?: string; regions?: readonly RedactionRegion[] }
  ): Promise<RedactionFindings>
  destroy(): Promise<void>
}

/** An engine lent for one write: one another part of core holds, or one started for it. */
export interface BorrowedEngine {
  engine: SaveEngine
  /**
   * Says a call failed in a way that may have stopped the engine, so its holder can check and
   * replace it. Resolves once the holder knows, with the error the write fails with instead when
   * the holder gives one.
   */
  stopped(): Promise<InkError | undefined>
  /**
   * Called once the write is done with the engine, after its document is closed, whatever
   * happened. An engine started for the one write is destroyed here.
   */
  done?(): Promise<void>
  /**
   * The error a write that failed on this engine rejects with, given the one it failed with,
   * once its document is closed and the holder told of any stop. Its holder decides, as it is
   * the one that knows what became of the engine. Without it, the write rejects with that error.
   */
  failed?(error: unknown): unknown
}

export interface SaverOptions {
  /**
   * The engine to write with, asked for at each write, since its holder may replace it. The
   * saver opens a document of its own in it for each write, closes it after and then calls
   * `done`; it never destroys the engine itself. An `InkError` it rejects with fails the write as
   * it is.
   */
  borrow: () => Promise<BorrowedEngine>
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
   * A `SaveFailed` has `details.stage` `'write'`: the engine could not open or write this file,
   * or the input could not be painted. When one annotation could not be painted or written,
   * `details.annotation` is its id. An `InkError` from lending the engine, such as
   * `EngineUnavailable`, is passed on as it is.
   */
  write(key: string, input: () => Promise<SaveInput>): Promise<Uint8Array>
  /**
   * Applies `input()` to the file as opened, saves it and checks the saved bytes under `regions`
   * followed by the regions of the earlier marks the engine applied, in the same turn as writes, so
   * it never overlaps one. Resolves with the regions it checked, in that order. Rejects with
   * `RedactionFailed` when the engine cannot apply or write the input, or cannot check the bytes,
   * and with `DocumentDestroyed` once destroyed. `details.stage` says which: `'apply'` or
   * `'verify'`; `details.page` and `details.annotation` name the page and the annotation when the
   * engine named one.
   */
  redact(
    input: () => Promise<RedactSaveInput>,
    regions: readonly RedactionRegion[]
  ): Promise<{
    bytes: Uint8Array
    result: RedactEngineResult
    /** The regions checked: `regions`, then `result.ownLockedRegions`. */
    checked: readonly RedactionRegion[]
    findings: RedactionFindings
  }>
  /**
   * Stops the saver; the engine is left to its holder. A write in flight rejects with
   * `DocumentDestroyed`.
   */
  destroy(): void
}

const destroyedError = (): InkError =>
  new InkError('DocumentDestroyed', 'The document has been destroyed')

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

/** Content the engine's apply cannot remove, by kind. */
export type UnremovableKind = 'pattern' | 'shading' | 'mask-group' | 'glyph'

/**
 * Why an `EngineError` refused a redaction before changing anything, with the marks it named
 * and the kinds of content it found, when it says.
 */
const engineRefusal = (
  e: unknown
):
  | {
      reason: 'unremovable-content' | 'could-not-inspect'
      annotations: string[]
      kinds: UnremovableKind[]
    }
  | undefined => {
  if (engineCode(e) !== 'redaction-failed') return undefined
  const { reason, marks, kinds } = e as Error & {
    reason?: unknown
    marks?: unknown
    kinds?: unknown
  }
  if (reason !== 'unremovable-content' && reason !== 'could-not-inspect') return undefined
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  return {
    reason,
    annotations: strings(marks),
    kinds: strings(kinds) as UnremovableKind[],
  }
}

/** The page an `EngineError` names, if it names one. */
const enginePage = (e: unknown): number | undefined => {
  if (engineCode(e) === undefined) return undefined
  const page = (e as Error & { page?: unknown }).page
  return typeof page === 'number' ? page : undefined
}

/**
 * The engine's codes for an engine that has stopped: an internal error, or an allocation that
 * failed inside it. Every later call on that engine fails, so its holder is told.
 */
const STOPPED_CODES: ReadonlySet<string | undefined> = new Set([
  'engine-failure',
  'out-of-memory',
])

export function createSaver(options: SaverOptions): Saver {
  let destroyed = false
  let last: { key: string; bytes: Promise<Uint8Array> } | undefined

  const passwordOption = options.password ? { password: options.password } : {}

  const failed = (error: unknown): unknown => {
    if (destroyed) return destroyedError()
    if (isInkError(error)) return error
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

  const redactFailed = (error: unknown): unknown => {
    if (destroyed) return destroyedError()
    if (isInkError(error)) return error
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
    const refusal = engineRefusal(error)
    if (refusal) {
      const { reason, annotations, kinds } = refusal
      return new InkError(
        'RedactionFailed',
        reason === 'unremovable-content'
          ? 'A redaction mark covers content that cannot be removed'
          : 'What lies under the redaction marks could not be inspected',
        {
          stage: 'apply',
          reason,
          ...(page !== undefined && { page }),
          ...(annotations.length > 0 && { annotations, annotation: annotations[0] }),
          ...(kinds.length > 0 && { kinds }),
        },
        error
      )
    }
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

  /** Whether `error`, or the check failure it wraps, says the engine has stopped. */
  const stoppedBy = (error: unknown): boolean =>
    STOPPED_CODES.has(engineCode(error instanceof NotChecked ? error.cause : error))

  /** Closes the write's document, if it opened, then hands the engine back. Never rejects. */
  const giveBack = async (
    lent: BorrowedEngine,
    doc: SaveEngineDocument | undefined
  ): Promise<void> => {
    if (doc) await (async () => doc.close())().catch(() => undefined)
    if (lent.done) await (async () => lent.done?.())().catch(() => undefined)
  }

  /**
   * `work` on a document opened for this write in the borrowed engine, and that engine. The
   * document is closed after it, whatever happens, and the engine handed back. A call that
   * stopped the engine is told to its holder at once, before the close joins the engine's queue
   * behind reads that would find the engine stopped first, and the write rejects only once the
   * holder knows, so the next write is not lent a stopped engine. It rejects with the error the
   * holder answers with, when it gives one, as the holder's `failed` has it.
   */
  const withDocument = async <T>(
    work: (doc: SaveEngineDocument, engine: SaveEngine) => Promise<T>
  ): Promise<T> => {
    const lent = await options.borrow()
    let doc: SaveEngineDocument | undefined
    try {
      if (destroyed) throw destroyedError()
      const bytes = await options.bytes()
      if (destroyed) throw destroyedError()
      doc = await lent.engine.open(bytes, passwordOption)
      const result = await work(doc, lent.engine)
      await giveBack(lent, doc)
      return result
    } catch (error) {
      const told = stoppedBy(error) ? lent.stopped() : undefined
      await giveBack(lent, doc)
      const failure = (await told) ?? error
      throw lent.failed ? lent.failed(failure) : failure
    }
  }

  const run = async (input: () => Promise<SaveInput>): Promise<Uint8Array> => {
    const written = await input()
    if (destroyed) throw destroyedError()
    return exclusive(async () => {
      if (destroyed) throw destroyedError()
      return withDocument(async (doc) => {
        await doc.write(written)
        const bytes = await doc.save()
        if (destroyed) throw destroyedError()
        return bytes
      })
    })
  }

  const redact: Saver['redact'] = async (input, regions) => {
    try {
      if (destroyed) throw destroyedError()
      const written = await input()
      if (destroyed) throw destroyedError()
      return await exclusive(async () => {
        if (destroyed) throw destroyedError()
        return withDocument(async (doc, engine) => {
          const result = await doc.redact(written)
          const bytes = await doc.save()
          if (destroyed) throw destroyedError()
          // The earlier marks the engine applied are known only now, and are checked too.
          const checked = [...regions, ...result.ownLockedRegions]
          // Whatever the check throws, the file has not passed it.
          // A throw as the call is made counts, not only a rejection.
          const findings = await (async () =>
            engine.checkRedaction(bytes, {
              ...passwordOption,
              regions: checked,
            }))().catch((cause: unknown) => {
            throw new NotChecked(cause)
          })
          if (destroyed) throw destroyedError()
          return { bytes, result, checked, findings }
        })
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
    },
  }
}
