import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import type { PdfAssets } from './types'

/** File-path assets for Node tests. Never exported from the package. */
export function nodeAssets(): PdfAssets {
  const require = createRequire(import.meta.url)
  const root = dirname(require.resolve('pdfjs-dist/package.json'))
  return {
    worker: require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
    cMaps: join(root, 'cmaps') + '/',
    standardFonts: join(root, 'standard_fonts') + '/',
    wasm: join(root, 'wasm') + '/',
    icc: join(root, 'iccs') + '/',
  }
}
