import { createFormLayer, type FormLayer, type SignFieldRequest } from './form-layer'
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
  /** Tints fillable form fields. Default true. */
  formHighlight?: boolean
  /**
   * Whether form fields take input now. Default: always. The engine passes "the default
   * pointer tool is active".
   */
  formActive?(): boolean
  /** A signature field asked to be signed. */
  onSignField?(req: SignFieldRequest): void
  /** Plugin layers, mounted above the form layer. The engine passes them for its pages only. */
  layers?: PluginLayers
  /** Search match highlights, mounted below the overlay. */
  highlights?: SearchHighlights
  /**
   * Canvas, text layer and form appearance failures, with the layer that failed (cancellations
   * are not reported).
   */
  onError?(error: unknown, layer: PageLayer): void
  /**
   * A layer finished without error: the canvas or the form appearances painted, or the text
   * layer mounted or applied an update. Pair it with `onError` to tell when a failed layer has recovered.
   */
  onRendered?(layer: PageLayer): void
}

/**
 * The page layers that can fail and recover: the canvas, the text layer and the form layer's
 * canvas of widget appearances.
 */
export type PageLayer = 'canvas' | 'text' | 'form'

export interface PageMount {
  readonly renderer: PageRenderer
  readonly textLayer: TextLayerHandle
  readonly overlay: Overlay
  /** The page's form fields; undefined when the document has none. */
  readonly form: FormLayer | undefined
  update(transform: PageTransform): void
  destroy(): void
}

/**
 * Canvas, text layer, annotation overlay, form layer and any plugin layers for one page, stacked
 * in that order.
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
  const form =
    document.form.fields.get().length > 0
      ? createFormLayer({
          host,
          page,
          transform,
          document,
          highlight: opts.formHighlight ?? true,
          isActive: () => opts.formActive?.() ?? true,
          ...(opts.onSignField
            ? { onSignField: (req: SignFieldRequest) => opts.onSignField?.(req) }
            : {}),
          ...(opts.devicePixelRatio === undefined
            ? {}
            : { devicePixelRatio: opts.devicePixelRatio }),
          ...callbacks('form'),
        })
      : undefined
  const layers = opts.layers?.mount(page, host, transform)
  return {
    renderer,
    textLayer,
    overlay,
    form,
    update(next) {
      renderer.update(next)
      textLayer.update(next)
      overlay.update(next)
      form?.update(next)
      layers?.update(next)
      marks?.update(next)
    },
    destroy() {
      layers?.destroy()
      form?.destroy()
      overlay.destroy()
      marks?.destroy()
      textLayer.destroy()
      renderer.destroy()
    },
  }
}
