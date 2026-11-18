/**
 * Why an engine call failed.
 *
 * - `password-required`: `open` got an encrypted document and no password.
 * - `password-incorrect`: `open` got a password that does not unlock the document.
 * - `invalid-pdf`: `open` got bytes that are not a PDF, or a PDF with no pages.
 * - `unsupported-security`: `open` got a document protected by a security handler PDFium
 *   does not support.
 * - `out-of-memory`: the engine could not allocate memory. When a bitmap or its copy cannot be
 *   allocated the engine keeps working. When an allocation fails inside PDFium and aborts it, the
 *   engine stops, as after any internal error.
 * - `write-failed`: `write` could not write an annotation or a form value. The message names the
 *   annotation's id, which is also in `annotation`, or the field. The document is left as it was opened, and the engine keeps
 *   working.
 * - `redaction-failed`: `redact` could not apply the marks or sanitise the file. `page` names the
 *   page, and `annotation` the mark when one mark was the cause. The document is left as it was
 *   opened, and the engine keeps working.
 * - `check-failed`: `checkRedaction` could not inspect the file or a page, as when a limit of the
 *   inspection was reached. `page` names the page when one was the cause. Nothing was found or
 *   not found, so the file has not passed the check. The engine keeps working.
 * - `aborted`: the call's signal fired while it was queued, or `destroy()` ran while it was queued.
 * - `engine-failure`: anything else. The engine or its worker could not load, a document was
 *   used after `close()`, the engine was used after `destroy()`, or PDFium failed. After an
 *   internal error the engine stops and every later call fails with this code, except `close()`
 *   and `destroy()`, which still resolve; create a new engine.
 */
export type EngineErrorCode =
  | 'password-required'
  | 'password-incorrect'
  | 'invalid-pdf'
  | 'unsupported-security'
  | 'out-of-memory'
  | 'write-failed'
  | 'redaction-failed'
  | 'check-failed'
  | 'aborted'
  | 'engine-failure'

/**
 * Why `redact` refused before changing anything. `unremovable-content`: a mark lies over content
 * the apply cannot remove. `could-not-inspect`: the engine could not look under the marks.
 */
export type RefusalReason = 'unremovable-content' | 'could-not-inspect'

/**
 * Content the apply cannot remove: a shape painted with a tiling pattern, a mesh or
 * function-based shading, artwork under a soft mask whose group has content there, or a Type 3
 * glyph that paints outside its box.
 */
export type UnremovableKind = 'pattern' | 'shading' | 'mask-group' | 'glyph'

/**
 * The error every engine call rejects with, apart from a `RangeError` for a bad page index or
 * scale, a render larger than the pixel limit, a bad name or a box with no area in an
 * appearance, or a region with no quads or a number that is not finite as a 32-bit float.
 */
export class EngineError extends Error {
  /** What went wrong. */
  readonly code: EngineErrorCode
  /** PDFium's own error number, when it gave one. For diagnostics only. */
  readonly pdfiumError?: number
  /**
   * The id of the annotation a `write-failed` or `redaction-failed` error is about, when it is
   * about one.
   */
  readonly annotation?: string
  /**
   * The page index, from 0, a `redaction-failed` or `check-failed` error is about, when it is
   * about one.
   */
  readonly page?: number
  /**
   * Why a `redaction-failed` refused before changing anything, when it did: a mark over content
   * the apply cannot remove, or a page the engine could not look under.
   */
  readonly reason?: RefusalReason
  /**
   * For `reason: 'unremovable-content'`: the ids of the marks given that lie over such content,
   * on every page. Inkbar's earlier locked marks have no id here; `page` names their page.
   */
  readonly marks?: string[]
  /** For `reason: 'unremovable-content'`: the kinds of content found under the marks. */
  readonly kinds?: UnremovableKind[]

  constructor(
    code: EngineErrorCode,
    message: string,
    options?: {
      pdfiumError?: number
      annotation?: string
      page?: number
      reason?: RefusalReason
      marks?: string[]
      kinds?: UnremovableKind[]
      cause?: unknown
    }
  ) {
    super(message, options && 'cause' in options ? { cause: options.cause } : undefined)
    this.name = 'EngineError'
    this.code = code
    if (options?.pdfiumError !== undefined) this.pdfiumError = options.pdfiumError
    if (options?.annotation !== undefined) this.annotation = options.annotation
    if (options?.page !== undefined) this.page = options.page
    if (options?.reason !== undefined) this.reason = options.reason
    if (options?.marks !== undefined) this.marks = options.marks
    if (options?.kinds !== undefined) this.kinds = options.kinds
  }
}

export function fromPdfiumError(error: number, hadPassword: boolean): EngineError {
  switch (error) {
    case 2:
    case 3:
      return new EngineError('invalid-pdf', 'The file is not a valid PDF.')
    case 4:
      return hadPassword
        ? new EngineError('password-incorrect', 'The password is incorrect.')
        : new EngineError('password-required', 'The document needs a password.')
    case 5:
      return new EngineError(
        'unsupported-security',
        'The document uses an unsupported security handler.'
      )
    default:
      return new EngineError('engine-failure', `The engine failed (error ${error}).`, {
        pdfiumError: error,
      })
  }
}

/**
 * A bad argument from the caller. Callers see a plain `RangeError`; the subclass lets the engine
 * tell its own range errors from one thrown out of the module, such as a stack overflow.
 */
export class ArgumentError extends RangeError {
  constructor(message: string) {
    super(message)
    this.name = 'RangeError'
  }
}
