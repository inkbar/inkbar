// Inline styles here are structural only: the layer covers the page host
// (`position:absolute; inset:0`) and its text must stay selectable whatever the page around it
// sets (`user-select:text`). PDF.js sets the layer's width/height from `--total-scale-factor`.
// Span styling (transparent colour, absolute positioning, font sizing, rotation transforms)
// is the theme's job.
import { mountPdfjsTextLayer, type MountedTextLayer } from '../pdfjs/text-layer'

import type { PageTransform } from './transform'
import type { InkDocument } from '../model/document'

export interface TextLayerOptions {
  document: InkDocument
  /** Zero-based page index. */
  page: number
  /** The page host (`div.ink-page`), which must carry `--total-scale-factor`. */
  host: HTMLElement
  transform: PageTransform
  /** Mount or update failures. Cancellation by `destroy` is not reported. */
  onError?(error: unknown): void
}

export interface TextLayerHandle {
  readonly element: HTMLElement
  /** Resolves once the latest mount or `update` has applied. Never rejects. */
  readonly ready: Promise<void>
  update(transform: PageTransform): void
  destroy(): void
}

export function createTextLayer(opts: TextLayerOptions): TextLayerHandle {
  const { document: doc, page } = opts
  const el = opts.host.ownerDocument.createElement('div')
  el.className = 'ink-text-layer'
  el.dataset.inkTextLayer = ''
  el.style.cssText = 'position:absolute;inset:0;user-select:text;'
  opts.host.append(el)

  const abort = new AbortController()
  let mounted: MountedTextLayer | undefined

  const viewportFor = async (transform: PageTransform) => {
    const pdfPage = await doc._pdfjs.getPage(page)
    return {
      pdfPage,
      viewport: pdfPage.getViewport({
        scale: transform.zoom,
        rotation: transform.totalRotation,
      }),
    }
  }

  const report = (error: unknown) => {
    if (!abort.signal.aborted) opts.onError?.(error)
  }

  let ready: Promise<void> = (async () => {
    const { pdfPage, viewport } = await viewportFor(opts.transform)
    if (abort.signal.aborted) return
    mounted = await mountPdfjsTextLayer({
      module: doc._pdfjs.module,
      pdfPage,
      container: el,
      viewport,
      signal: abort.signal,
    })
  })().catch(report)

  return {
    element: el,
    get ready() {
      return ready
    },
    update(transform) {
      if (abort.signal.aborted) return
      ready = ready
        .then(async () => {
          if (abort.signal.aborted || !mounted) return
          const { viewport } = await viewportFor(transform)
          if (!abort.signal.aborted) mounted.update(viewport)
        })
        .catch(report)
    },
    destroy() {
      if (abort.signal.aborted) return
      abort.abort()
      el.remove()
    },
  }
}
