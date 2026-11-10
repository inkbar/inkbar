import { createFormLayer, type FormLayer, type SignFieldRequest } from './form-layer'
import { pageStopOrder } from './form-order'
import { createLinkLayer, textInBox, type LinkLayer } from './link-layer'
import { createOverlay, type DecorateAnnotation, type Overlay } from './overlay'
import { createPageRenderer, type PageRenderer } from './page-renderer'
import { createTextLayer, type TextLayerHandle } from './text-layer'

import type { PluginLayers } from './plugins/layer'
import type { SearchHighlights } from './search/highlights'
import type { PageTransform } from './transform'
import type { AnnotationStore } from '../model/annotations/store'
import type { Annotation } from '../model/annotations/types'
import type { LinkTarget } from '../model/destination'
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
  /** A link was activated from the keyboard or by assistive technology. */
  followLink?(target: LinkTarget): void
  /** Plugin layers, mounted above the overlay. The engine passes them for its pages only. */
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
   * layer mounted or applied an update. Pair it with `onError` to tell when a failed layer has
   * recovered.
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
  /** The page's links; undefined when the page has none. */
  readonly links: LinkLayer | undefined
  /** The page's fields and links Tab stops at, in the one order they share. */
  tabStops(): HTMLElement[]
  update(transform: PageTransform): void
  destroy(): void
}

/**
 * Canvas, text layer, links, search highlights, form layer, annotation overlay and any plugin
 * layers for one page, stacked in that order.
 */
export function createPageMount(opts: PageMountOptions): PageMount {
  const { document, page, host } = opts
  let transform = opts.transform
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
  // Links are named by the text under them, which shows once the text layer first mounts.
  let named = false
  const text = callbacks('text')
  const textLayer = createTextLayer({
    document,
    page,
    host,
    transform,
    ...text,
    onRendered: () => {
      if (!named) {
        named = true
        links?.relabel()
      }
      text.onRendered?.()
    },
  })
  const links =
    document.links(page).length > 0
      ? createLinkLayer({
          host,
          page,
          transform,
          document,
          follow: (target) => opts.followLink?.(target),
          textUnder: (rect) => {
            const box = transform.toCssRect(rect)
            const origin = host.getBoundingClientRect()
            const left = origin.left + box.left
            const top = origin.top + box.top
            return textInBox(textLayer.element, {
              left,
              top,
              right: left + box.width,
              bottom: top + box.height,
            })
          },
        })
      : undefined
  const marks = opts.highlights?.mount(page, host, transform)
  // The fields sit under the annotations: a press on an annotation's shape is the
  // annotation's (to select or delete a signature that fills a field), and a press anywhere
  // else in a field's box is the field's.
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

  /**
   * Each stop's place in the page's one order of fields and links, worked out on first use: the
   * two sit in separate layers, so the order comes from the page, not the DOM.
   */
  let ranks: Map<string, number> | undefined
  const rankOf = (stop: HTMLElement): number => {
    ranks ??= new Map(
      pageStopOrder(
        document.form.fields
          .get()
          .flatMap((f) => f.widgets.filter((w) => w.page === page)),
        document.links(page),
        document.form._tabs.get(page),
        document.pages[page],
        page,
        document.form._structure.get(page)
      ).map((id, i) => [id, i])
    )
    const id =
      stop.dataset.inkLink ??
      stop.closest<HTMLElement>('[data-ink-widget]')?.dataset.inkWidget
    return (id === undefined ? undefined : ranks.get(id)) ?? Infinity
  }

  return {
    renderer,
    textLayer,
    overlay,
    form,
    links,
    tabStops() {
      const fields = form?.tabStops() ?? []
      const linked = links?.tabStops() ?? []
      if (fields.length === 0) return linked
      if (linked.length === 0) return fields
      // A sort is stable, so stops of equal rank keep each layer's own order.
      return [...fields, ...linked].sort((a, b) => rankOf(a) - rankOf(b))
    },
    update(next) {
      transform = next
      renderer.update(next)
      textLayer.update(next)
      links?.update(next)
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
      links?.destroy()
      textLayer.destroy()
      renderer.destroy()
    },
  }
}
