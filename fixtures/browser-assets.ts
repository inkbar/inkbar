// Browser-safe: no Node imports. URLs match what `serveFixtures()` serves under /pdfjs/.

/** Structurally the same as `PdfAssets` from `@inkbar/core`, which this package cannot depend on. */
export interface BrowserPdfAssets {
  worker: string
  cMaps: string
  standardFonts: string
  wasm: string
  icc: string
}

/** PDF.js asset URLs for browser tests, served from the installed pdfjs-dist by `serveFixtures()`. */
export function browserAssets(): BrowserPdfAssets {
  return {
    worker: '/pdfjs/build/pdf.worker.min.mjs',
    cMaps: '/pdfjs/cmaps/',
    standardFonts: '/pdfjs/standard_fonts/',
    wasm: '/pdfjs/wasm/',
    icc: '/pdfjs/iccs/',
  }
}
