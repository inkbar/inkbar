// Browser-safe: no Node imports. URLs match what `serveFixtures()` serves.

/** Structurally the same as `PdfAssets` from `@inkbar/core`, which this package cannot depend on. */
export interface BrowserPdfAssets {
  engine: string
  worker: string
  fonts: string
  sandbox: string
}

/**
 * Inkbar's own files for browser tests, served by `serveFixtures()`: the engine's binary and
 * worker from `@inkbar/engine`'s build, the fallback fonts from `@inkbar/fonts`, and the form
 * script sandbox from the installed pdfjs-dist.
 */
export function browserAssets(): BrowserPdfAssets {
  return {
    engine: '/inkbar-engine/inkbar-pdfium.wasm',
    worker: '/inkbar-engine/worker.mjs',
    fonts: '/inkbar-fonts/',
    sandbox: '/pdfjs/wasm/',
  }
}
