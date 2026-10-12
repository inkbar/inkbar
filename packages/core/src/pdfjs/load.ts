import { InkError } from '../model/errors'

import type { PdfAssets, PdfjsDocument, PdfjsLoadingTask, PdfjsModule } from './types'

const REQUIRED: ReadonlyArray<keyof PdfAssets> = [
  'worker',
  'cMaps',
  'standardFonts',
  'wasm',
]

export function assertAssets(value: unknown): asserts value is PdfAssets {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >
  const missing = REQUIRED.filter(
    (k) => typeof record[k] !== 'string' || record[k] === ''
  )
  if (value === undefined || value === null || missing.length > 0) {
    throw new InkError(
      'AssetConfigMissing',
      'openDocument needs an `assets` option naming the PDF.js worker, cMaps, standardFonts and wasm locations. ' +
        'Vite users: add the @inkbar/core/vite plugin and pass `assets` from "virtual:inkbar-assets".',
      { missing: value == null ? [...REQUIRED] : missing }
    )
  }
}

let modulePromise: Promise<PdfjsModule> | undefined
let configuredWorker: string | undefined

/**
 * Loads PDF.js once. `#pdfjs` resolves to the legacy build in Node and the
 * modern build everywhere else (see package.json "imports").
 */
export async function loadPdfjs(assets: PdfAssets): Promise<PdfjsModule> {
  assertAssets(assets)
  modulePromise ??= import('#pdfjs').catch((cause: unknown) => {
    modulePromise = undefined
    throw new InkError('AssetLoadFailed', 'PDF.js could not be imported', {}, cause)
  }) as Promise<PdfjsModule>
  const pdfjs = await modulePromise
  if (configuredWorker === undefined) {
    pdfjs.GlobalWorkerOptions.workerSrc = assets.worker
    configuredWorker = assets.worker
  } else if (configuredWorker !== assets.worker) {
    throw new InkError(
      'AssetConfigMissing',
      'PDF.js worker URL cannot change after the first document is opened',
      { configured: configuredWorker, requested: assets.worker }
    )
  }
  return pdfjs
}

export interface OpenProxyOptions {
  assets: PdfAssets
  password?: string | undefined
  /** PDF.js log level (0 errors, 1 warnings, 5 infos). Left to PDF.js when omitted. */
  verbosity?: number | undefined
}

export async function openProxy(
  pdfjs: PdfjsModule,
  bytes: Uint8Array,
  options: OpenProxyOptions
): Promise<{ task: PdfjsLoadingTask; proxy: PdfjsDocument }> {
  const { assets, password, verbosity } = options
  const task = pdfjs.getDocument({
    data: bytes,
    ...(password !== undefined ? { password } : {}),
    ...(verbosity !== undefined ? { verbosity } : {}),
    cMapUrl: assets.cMaps,
    cMapPacked: true,
    standardFontDataUrl: assets.standardFonts,
    wasmUrl: assets.wasm,
    ...(assets.icc !== undefined ? { iccUrl: assets.icc } : {}),
  })
  try {
    const proxy = await task.promise
    return { task, proxy }
  } catch (cause: unknown) {
    try {
      await task.destroy()
    } catch {
      // The caller already receives the mapped load error below; a failure
      // while tearing down the half-open task adds nothing actionable.
    }
    throw mapLoadError(cause, password !== undefined)
  }
}

/** `PasswordResponses` values from PDF.js (`NEED_PASSWORD = 1`, `INCORRECT_PASSWORD = 2`). */
const INCORRECT_PASSWORD = 2

/**
 * PDF.js 6 exports only some exception classes (`PasswordException`,
 * `InvalidPDFException`, `ResponseException`, `AbortException`), and errors
 * that cross the worker boundary are rebuilt by name, so match on `name`.
 * Inputs here are always in-memory bytes, so there is no fetch to fail:
 * every non-password failure means the bytes are not a usable PDF.
 */
export function mapLoadError(cause: unknown, passwordSupplied = false): InkError {
  const name = (cause as { name?: unknown } | null)?.name
  const rawMessage = (cause as { message?: unknown } | null)?.message
  const message =
    typeof rawMessage === 'string' && rawMessage !== ''
      ? rawMessage
      : 'Unknown PDF.js error'
  if (name === 'PasswordException') {
    const wrong = (cause as { code?: unknown }).code === INCORRECT_PASSWORD
    return new InkError(
      'PasswordRequired',
      wrong
        ? 'The password is incorrect'
        : 'This document is encrypted and needs a password',
      { passwordSupplied, incorrect: wrong },
      cause
    )
  }
  // InvalidPDFException, FormatError, UnknownErrorException, MissingPDFException,
  // UnexpectedResponseException, ResponseException and anything unrecognised.
  return new InkError(
    'InvalidPdf',
    message,
    {
      pdfjsErrorName: typeof name === 'string' ? name : undefined,
      pdfjsMessage: message,
    },
    cause
  )
}
