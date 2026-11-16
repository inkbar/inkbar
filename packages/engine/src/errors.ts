export type EngineErrorCode =
  | 'password-required'
  | 'password-incorrect'
  | 'invalid-pdf'
  | 'unsupported-security'
  | 'out-of-memory'
  | 'aborted'
  | 'engine-failure'

export class EngineError extends Error {
  readonly code: EngineErrorCode
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
