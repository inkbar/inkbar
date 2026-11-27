// Test support only, never production code: node tests import it.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import type { PdfAssets } from '../model/assets'

/** File-path assets for Node tests, from the installed packages. */
export function nodeAssets(): PdfAssets {
  const require = createRequire(import.meta.url)
  const engine = join(dirname(require.resolve('@inkbar/engine/package.json')), 'dist')
  const pdfjs = dirname(require.resolve('pdfjs-dist/package.json'))
  return {
    engine: join(engine, 'inkbar-pdfium.wasm'),
    worker: join(engine, 'worker.mjs'),
    fonts: dirname(require.resolve('@inkbar/fonts/files/NotoSans-Regular.ttf')) + '/',
    sandbox: join(pdfjs, 'wasm') + '/',
  }
}
