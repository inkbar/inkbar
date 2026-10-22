/*
 * Plugin page layers. Each layer a plugin adds gets one element per mounted page of the main
 * viewport, `div.ink-plugin-layer[data-plugin="<id>"]`, appended to the page host after the
 * annotation overlay and covering the page. The plugin draws into it in user space through the
 * page transform it is handed, which is the only conversion to CSS pixels it needs.
 *
 * A layer is drawn when its page mounts, whenever the page's transform changes (zoom,
 * rotation) and when the plugin invalidates it; it is torn down when the page unmounts. Layers
 * added after pages have mounted (from `onDocument`, say) appear on those pages at once.
 *
 * The layer element is `pointer-events: none`, so a press that misses the plugin's marks
 * reaches the overlay and the tools underneath; the theme turns its children back to `auto`.
 * Presses and keys on those children are the plugin's: the tool controller leaves them alone.
 * Marks that take focus are Tab stops after the page's annotations, by DOM order.
 */
import type { LayerSpec, PluginLayerHandle } from './define'
import type { PageTransform } from '../transform'

/** A layer as the host keeps it: the plugin's spec and the id of the plugin that added it. */
export type PluginLayer = LayerSpec & { readonly plugin: string }

/**
 * What a layer source reports: a layer was added, or one asked to redraw.
 *
 * @internal For bindings, which mount plugin layers; not for plugin authors.
 */
export type LayerEvent =
  | { type: 'add'; layer: PluginLayer }
  | { type: 'invalidate'; layer: PluginLayer; page?: number | undefined }

/**
 * Where page layers come from: a plugin host.
 *
 * @internal For bindings, which mount plugin layers; not for plugin authors.
 */
export interface LayerSource {
  readonly layers: readonly PluginLayer[]
  /** Calls `listener` for every layer added and every invalidate; returns a stop function. */
  watchLayers(listener: (event: LayerEvent) => void): () => void
}

/** The host's side of `ctx.layer`: records layers and passes their invalidates on. */
export interface LayerRegistry extends LayerSource {
  add(layer: PluginLayer): PluginLayerHandle
}

export function createLayerRegistry(): LayerRegistry {
  const layers: PluginLayer[] = []
  const listeners = new Set<(event: LayerEvent) => void>()
  const emit = (event: LayerEvent) => {
    for (const listener of [...listeners]) listener(event)
  }
  return {
    layers,
    watchLayers(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    add(layer) {
      layers.push(layer)
      emit({ type: 'add', layer })
      return { invalidate: (page) => emit({ type: 'invalidate', layer, page }) }
    },
  }
}

/**
 * One page's plugin layers, made by `PluginLayers.mount`.
 *
 * @internal For bindings, which mount plugin layers; not for plugin authors.
 */
export interface PageLayers {
  update(transform: PageTransform): void
  destroy(): void
}

/** The plugin layers of one viewer's pages; see `createPluginLayers`. */
export interface PluginLayers {
  mount(page: number, host: HTMLElement, transform: PageTransform): PageLayers
  /** Stops following the source. Pages still mounted keep their layers until they unmount. */
  destroy(): void
}

/** Runs a plugin's drawing; a throw is logged so one plugin cannot break the page. */
function guard(fn: () => void): void {
  try {
    fn()
  } catch (error) {
    console.error(error)
  }
}

interface MountedPage {
  host: HTMLElement
  transform: PageTransform
  elements: Map<PluginLayer, HTMLElement>
}

/**
 * Mounts `source`'s layers on the pages the engine mounts, and follows it: a layer added later
 * is drawn on every mounted page, and an invalidate redraws its page, or all of them.
 *
 * @internal For bindings, which mount plugin layers; plugin authors add a layer with
 * `ctx.layer`.
 */
export function createPluginLayers(source: LayerSource): PluginLayers {
  const pages = new Map<number, MountedPage>()

  const draw = (layer: PluginLayer, el: HTMLElement, page: number, t: PageTransform) =>
    guard(() => layer.render(el, page, t))

  const add = (layer: PluginLayer, page: number, state: MountedPage) => {
    const el = state.host.ownerDocument.createElement('div')
    el.className = 'ink-plugin-layer'
    el.dataset.plugin = layer.plugin
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
    state.host.append(el)
    state.elements.set(layer, el)
    draw(layer, el, page, state.transform)
  }

  const stop = source.watchLayers((event) => {
    if (event.type === 'add') {
      for (const [page, state] of pages) add(event.layer, page, state)
      return
    }
    const redraw = (page: number, state: MountedPage) => {
      const el = state.elements.get(event.layer)
      if (el) draw(event.layer, el, page, state.transform)
    }
    if (event.page === undefined) for (const [page, state] of pages) redraw(page, state)
    else {
      const state = pages.get(event.page)
      if (state) redraw(event.page, state)
    }
  })

  return {
    mount(page, host, transform) {
      const state: MountedPage = { host, transform, elements: new Map() }
      pages.set(page, state)
      for (const layer of source.layers) add(layer, page, state)
      return {
        update(next) {
          state.transform = next
          for (const [layer, el] of state.elements) draw(layer, el, page, next)
        },
        destroy() {
          if (pages.get(page) === state) pages.delete(page)
          for (const [layer, el] of state.elements) {
            if (layer.destroy) guard(() => layer.destroy?.(el, page))
            el.remove()
          }
          state.elements.clear()
        },
      }
    },
    destroy: stop,
  }
}
