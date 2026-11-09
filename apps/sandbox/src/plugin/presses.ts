/*
 * A plugin that hears presses and long presses on the page, written against Inkbar's public
 * API. Each one is logged with its page, its point in PDF user space and the kind of pointer,
 * and marked on the page for a moment so you can see where it landed.
 *
 * Inkbar reports only the presses it did not act on itself, and only under the select tools:
 * pressing an annotation, a link or a form field reaches the viewer, not this plugin.
 */
import { definePlugin, type PagePress, type PageTransform } from '@inkbar/core/dom'

export interface PressesOptions {
  /** Called once for each press, with `onPress` or `onLongPress` as the name. */
  log(this: void, name: string, payload: unknown): void
}

type Kind = 'press' | 'long-press'

interface Marker {
  kind: Kind
  page: number
  /** User space on `page`. */
  x: number
  y: number
}

/** How long a marker stays on the page, in ms. */
const MARKER_MS = 1500

const round = (n: number) => Math.round(n * 10) / 10

export const pressesPlugin = definePlugin<PressesOptions>(
  'presses',
  (plugin, { log }) => {
    const markers = new Set<Marker>()
    const timers = new Set<ReturnType<typeof setTimeout>>()

    // One marker per press, placed through the page transform, so zoom moves it with the page.
    const layer = plugin.layer({
      render(el: HTMLElement, page: number, transform: PageTransform) {
        const spans = [...markers]
          .filter((m) => m.page === page)
          .map((m) => {
            const { x, y } = transform.toCss({ x: m.x, y: m.y })
            const span = el.ownerDocument.createElement('span')
            span.className = 'presses-marker'
            span.dataset['kind'] = m.kind
            span.style.left = `${x}px`
            span.style.top = `${y}px`
            return span
          })
        el.replaceChildren(...spans)
      },
    })

    const heard =
      (kind: Kind, name: string) =>
      ({ page, point, pointerType }: PagePress) => {
        const x = round(point.x)
        const y = round(point.y)
        log(name, { page, point: { x, y }, pointerType })

        const marker: Marker = { kind, page, x, y }
        markers.add(marker)
        layer.invalidate(page)
        const timer = setTimeout(() => {
          timers.delete(timer)
          markers.delete(marker)
          layer.invalidate(page)
        }, MARKER_MS)
        timers.add(timer)
      }

    plugin.onPress(heard('press', 'onPress'))
    plugin.onLongPress(heard('long-press', 'onLongPress'))

    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
  }
)
