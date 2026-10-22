export type InkErrorCode =
  | 'PasswordRequired'
  | 'InvalidPdf'
  | 'SourceFetchFailed'
  | 'AssetConfigMissing'
  | 'AssetLoadFailed'
  | 'EngineUnavailable'
  | 'ControlledMutationIgnored'
  | 'DocumentDestroyed'
  | 'PageOutOfRange'
  | 'DuplicateId'
  | 'DuplicatePlugin'
  | 'InvalidPluginId'
  | 'InvalidCommandLabel'
  | 'UnknownCommand'

export class InkError extends Error {
  override readonly name = 'InkError'
  readonly code: InkErrorCode
  readonly details: Readonly<Record<string, unknown>>

  constructor(
    code: InkErrorCode,
    message: string,
    details: Record<string, unknown> = {},
    cause?: unknown
  ) {
    super(message, cause === undefined ? undefined : { cause })
    this.code = code
    this.details = details
  }
}

export function isInkError(value: unknown): value is InkError {
  return (
    value instanceof InkError ||
    (typeof value === 'object' &&
      value !== null &&
      (value as { name?: unknown }).name === 'InkError')
  )
}
