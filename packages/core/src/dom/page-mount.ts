import { createOverlay, type Overlay } from './overlay'
import { createPageRenderer, type PageRenderer } from './page-renderer'
import { createTextLayer, type TextLayerHandle } from './text-layer'

import type { PageTransform } from './transform'
import type { AnnotationStore } from '../model/annotations/store'
import type { Annotation } from '../model/annotations/types'
import type { InkDocument } from '../model/document'

export interface PageMountOptions {
  document: InkDocument
  /** Zero-based page index. */
  page: number
  /** The page host (`div.ink-page`) from the viewport's `onMount`. */
  host: HTMLElement
  transform: PageTransform
  store: AnnotationStore
  onActivate?(id: string): void
  isCustom?(a: Annotation): boolean
  /** Defaults to `window.devicePixelRatio`. */
  devicePixelRatio?: number
}

export interface PageMount {
  readonly renderer: PageRenderer
  readonly textLayer: TextLayerHandle
  readonly overlay: Overlay
  update(transform: PageTransform): void
  destroy(): void
}

/** Canvas, text layer and annotation overlay for one page, stacked in that order. */
export function createPageMount(opts: PageMountOptions): PageMount {
  const { document, page, host, transform } = opts
  const renderer = createPageRenderer({
    document,
    page,
    host,
    transform,
    ...(opts.devicePixelRatio === undefined
      ? {}
      : { devicePixelRatio: opts.devicePixelRatio }),
  })
  const textLayer = createTextLayer({ document, page, host, transform })
  const overlay = createOverlay({
    host,
    page,
    store: opts.store,
    transform,
    ...(opts.onActivate ? { onActivate: (id: string) => opts.onActivate?.(id) } : {}),
    ...(opts.isCustom
      ? { isCustom: (a: Annotation) => opts.isCustom?.(a) === true }
      : {}),
  })
  return {
    renderer,
    textLayer,
    overlay,
    update(next) {
      renderer.update(next)
      textLayer.update(next)
      overlay.update(next)
    },
    destroy() {
      overlay.destroy()
      textLayer.destroy()
      renderer.destroy()
    },
  }
}
