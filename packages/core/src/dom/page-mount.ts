import { createOverlay, type DecorateAnnotation, type Overlay } from './overlay'
import { createPageRenderer, type PageRenderer } from './page-renderer'
import { createTextLayer, type TextLayerHandle } from './text-layer'

import type { PluginLayers } from './plugins/layer'
import type { SearchHighlights } from './search/highlights'
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
  /** The app's data attributes and classes for each annotation element (see `OverlayOptions`). */
  decorate?: DecorateAnnotation
  /** Defaults to `window.devicePixelRatio`. */
  devicePixelRatio?: number
  /** Plugin layers, mounted above the overlay. The engine passes them for its pages only. */
  layers?: PluginLayers
  /** Search match highlights, mounted below the overlay. */
  highlights?: SearchHighlights
  /**
   * Canvas and text layer failures, with the layer that failed (cancellations are not
   * reported).
   */
  onError?(error: unknown, layer: PageLayer): void
  /**
   * A layer finished without error: the canvas painted, or the text layer mounted or applied
   * an update. Pair it with `onError` to tell when a failed layer has recovered.
   */
  onRendered?(layer: PageLayer): void
}

/** The page layers that can fail and recover: the canvas and the text layer. */
export type PageLayer = 'canvas' | 'text'

export interface PageMount {
  readonly renderer: PageRenderer
  readonly textLayer: TextLayerHandle
  readonly overlay: Overlay
  update(transform: PageTransform): void
  destroy(): void
}

/**
 * Canvas, text layer, annotation overlay and any plugin layers for one page, stacked in that
 * order.
 */
export function createPageMount(opts: PageMountOptions): PageMount {
  const { document, page, host, transform } = opts
  const callbacks = (layer: PageLayer) => ({
    ...(opts.onError
      ? { onError: (error: unknown) => opts.onError?.(error, layer) }
      : {}),
    ...(opts.onRendered ? { onRendered: () => opts.onRendered?.(layer) } : {}),
  })
  const renderer = createPageRenderer({
    document,
    page,
    host,
    transform,
    ...(opts.devicePixelRatio === undefined
      ? {}
      : { devicePixelRatio: opts.devicePixelRatio }),
    ...callbacks('canvas'),
  })
  const textLayer = createTextLayer({
    document,
    page,
    host,
    transform,
    ...callbacks('text'),
  })
  const marks = opts.highlights?.mount(page, host, transform)
  const overlay = createOverlay({
    host,
    page,
    store: opts.store,
    transform,
    document,
    ...(opts.devicePixelRatio === undefined
      ? {}
      : { devicePixelRatio: opts.devicePixelRatio }),
    ...(opts.onActivate ? { onActivate: (id: string) => opts.onActivate?.(id) } : {}),
    ...(opts.isCustom
      ? { isCustom: (a: Annotation) => opts.isCustom?.(a) === true }
      : {}),
    ...(opts.decorate ? { decorate: opts.decorate } : {}),
  })
  const layers = opts.layers?.mount(page, host, transform)
  return {
    renderer,
    textLayer,
    overlay,
    update(next) {
      renderer.update(next)
      textLayer.update(next)
      overlay.update(next)
      layers?.update(next)
      marks?.update(next)
    },
    destroy() {
      layers?.destroy()
      overlay.destroy()
      marks?.destroy()
      textLayer.destroy()
      renderer.destroy()
    },
  }
}
