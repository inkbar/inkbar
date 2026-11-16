/**
 * Why an engine call failed.
 *
 * - `password-required`: `open` got an encrypted document and no password.
 * - `password-incorrect`: `open` got a password that does not unlock the document.
 * - `invalid-pdf`: `open` got bytes that are not a PDF, or a PDF with no pages.
 * - `unsupported-security`: `open` got a document protected by a security handler PDFium
 *   does not support.
 * - `out-of-memory`: the engine could not allocate memory. When this comes from inside PDFium the
 *   engine stops, as for `engine-failure`.
 * - `aborted`: the call's signal fired while it was queued, or `destroy()` ran while it was queued.
 * - `engine-failure`: anything else. The engine or its worker could not load, a document was
 *   used after `close()`, the engine was used after `destroy()`, or PDFium failed. After an
 *   internal error the engine stops and every later call fails with this code; create a new
 *   engine.
 */
export type EngineErrorCode =
  | 'password-required'
  | 'password-incorrect'
  | 'invalid-pdf'
  | 'unsupported-security'
  | 'out-of-memory'
  | 'aborted'
  | 'engine-failure'

/** The error every engine call rejects with, apart from a `RangeError` for a bad argument. */
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
