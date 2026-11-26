// Test support only, never production code. PDF.js as a second reader, for tests that check a
// file Inkbar wrote opens and reads elsewhere too. It opens bytes through the PDF.js loading code
// under `pdfjs/`, with PDF.js's own files: from the installed pdfjs-dist in Node, and in a browser
// from where the fixture server (`serveFixtures`) puts them.
import { InkError } from '../model/errors'
import { openWithPdfjs, type PdfjsOpened } from '../pdfjs/open'

import type { PdfAssets as PdfjsAssets } from '../pdfjs/types'

/** PDF.js's worker, CMaps, standard fonts, wasm and ICC profiles. */
export function pdfjsAssets(): PdfjsAssets {
  if (typeof window !== 'undefined')
    return {
      worker: '/pdfjs/build/pdf.worker.min.mjs',
      cMaps: '/pdfjs/cmaps/',
      standardFonts: '/pdfjs/standard_fonts/',
      wasm: '/pdfjs/wasm/',
      icc: '/pdfjs/iccs/',
    }
  const nodeModule = process.getBuiltinModule('node:module')
  const path = process.getBuiltinModule('node:path')
  const require = nodeModule.createRequire(import.meta.url)
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'))
  return {
    worker: require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
    cMaps: path.join(root, 'cmaps') + '/',
    standardFonts: path.join(root, 'standard_fonts') + '/',
    wasm: path.join(root, 'wasm') + '/',
    icc: path.join(root, 'iccs') + '/',
  }
}

/** `bytes` open in PDF.js; `destroy()` it when done. PDF.js takes over the bytes it is given. */
export async function openWithPdfjsReader(
  bytes: Uint8Array,
  password?: string
): Promise<PdfjsOpened> {
  let destroyed = false
  const opened = await openWithPdfjs({
    assets: pdfjsAssets(),
    password,
    // PDF.js's warnings about the files are not the tests' subject.
    verbosity: 0,
    bytes: () => Promise.resolve(bytes.slice()),
    destroyed: () => destroyed,
    destroyedError: () => new InkError('DocumentDestroyed', 'Destroyed'),
    measure: undefined,
  })
  return {
    ...opened,
    destroy: () => {
      destroyed = true
      return opened.destroy()
    },
  }
}
