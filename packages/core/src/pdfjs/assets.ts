// The check `openDocument` makes of its assets before anything loads. It is kept apart from
// PDF.js's loading: when the engine opens the file the assets are still needed, for the scripting
// sandbox, but PDF.js is never loaded.
import { InkError } from '../model/errors'

import type { PdfAssets } from './types'

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
