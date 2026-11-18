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
 *   annotation's id, or the field. The document is left as it was opened, and the engine keeps
 *   working.
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
  | 'aborted'
  | 'engine-failure'

/**
 * The error every engine call rejects with, apart from a `RangeError` for a bad page index or
 * scale, a render larger than the pixel limit, or a bad name in an appearance.
 */
export class EngineError extends Error {
  /** What went wrong. */
  readonly code: EngineErrorCode
  /** PDFium's own error number, when it gave one. For diagnostics only. */
  readonly pdfiumError?: number

  constructor(
    code: EngineErrorCode,
    message: string,
    options?: { pdfiumError?: number; cause?: unknown }
  ) {
    super(message, options && 'cause' in options ? { cause: options.cause } : undefined)
    this.name = 'EngineError'
    this.code = code
    if (options?.pdfiumError !== undefined) this.pdfiumError = options.pdfiumError
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
