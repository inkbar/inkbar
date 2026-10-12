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
 * On any rejection the layer is cancelled and detached from `signal`.
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
  const onAbort = (): void => layer.cancel()
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  if (opts.signal?.aborted) layer.cancel()
  try {
    await layer.render()
  } catch (error) {
    // A failed layer is dropped here: cancelled, and no longer held by the caller's signal, so
    // a retry on the same signal does not keep every failed attempt alive.
    opts.signal?.removeEventListener('abort', onAbort)
    layer.cancel()
    throw error
  }
  return mounted
}
