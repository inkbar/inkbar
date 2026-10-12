// The only file that touches PDF.js's `TextLayer`. It takes the already-loaded PDF.js module
// instead of importing `#pdfjs`, so `@inkbar/core/dom` can re-export the text layer without
// evaluating PDF.js at import time.
import type { PdfjsModule, PdfjsPage, PdfjsViewport } from './types'

export interface MountedTextLayer {
  update(viewport: PdfjsViewport): void
  cancel(): void
}

export interface MountPdfjsTextLayerOptions {
  /** The loaded PDF.js module, i.e. `InkDocument._pdfjs.module`. */
  module: PdfjsModule
  pdfPage: PdfjsPage
  container: HTMLElement
  viewport: PdfjsViewport
  /** Aborting cancels the render (and any later use of the layer). */
  signal?: AbortSignal
}

/**
 * Renders the page's text into `container` as positioned spans. The constructor sizes the
 * container from `--total-scale-factor` and sets `data-main-rotation`; CSS (the theme) turns
 * those into the final layout. Rejects with PDF.js's `AbortException` if `signal` aborts first.
 */
export async function mountPdfjsTextLayer(
  opts: MountPdfjsTextLayerOptions
): Promise<MountedTextLayer> {
  const layer = new opts.module.TextLayer({
    textContentSource: opts.pdfPage.streamTextContent({
      includeMarkedContent: false,
      disableNormalization: true,
    }),
    container: opts.container,
    viewport: opts.viewport,
  })
  const mounted: MountedTextLayer = {
    update(viewport) {
      layer.update({ viewport })
    },
    cancel() {
      layer.cancel()
    },
  }
  opts.signal?.addEventListener('abort', () => layer.cancel(), { once: true })
  if (opts.signal?.aborted) layer.cancel()
  await layer.render()
  return mounted
}
