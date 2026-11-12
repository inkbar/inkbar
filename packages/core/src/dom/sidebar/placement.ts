import type { SidebarLayout } from './controller'

/** The narrowest the document may get before sidebars float or narrow, in px. */
export const MIN_DOCUMENT_WIDTH = 480

/** One sidebar as the placement function sees it. */
export interface SidebarSlot {
  /** Unique per controller. */
  key: number
  layout: SidebarLayout
  visible: boolean
  /** Any panel open. */
  open: boolean
  /** The chosen width, already within min..max. */
  want: number
  /** The sidebar's minimum width. */
  min: number
  /** The rail's width in px (rail layout only; 0 otherwise). */
  rail: number
  resizing: boolean
  /** Increases each time the sidebar goes from no panel open to one open. */
  openedAt: number
  /** The narrowest document width this sidebar accepts. */
  minDocument: number
}

/** Where a sidebar sits and how wide its panel is. */
export interface SidebarPlacement {
  floating: boolean
  shown: number
}

function footprint(slot: SidebarSlot, placement: SidebarPlacement): number {
  if (!slot.visible) return 0
  if (placement.floating) return slot.rail
  if (slot.layout === 'rail') return slot.open ? placement.shown : slot.rail
  if (slot.layout === 'tabs') return slot.open ? placement.shown : 0
  return placement.shown
}

/**
 * Decide, for sidebars sharing a container, whether each sits beside the
 * document, floats over it, or narrows. Open rails float first (the one being
 * resized, then the most recently opened); tabs and stack sidebars narrow
 * toward their minimum when floating is not enough.
 */
export function placeSidebars(
  container: number,
  slots: readonly SidebarSlot[]
): Map<number, SidebarPlacement> {
  const result = new Map<number, SidebarPlacement>()
  for (const slot of slots) result.set(slot.key, { floating: false, shown: slot.want })

  const minimum = slots.reduce((m, s) => Math.max(m, s.minDocument), 0)
  const documentWidth = () =>
    container - slots.reduce((sum, s) => sum + footprint(s, result.get(s.key)!), 0)

  const candidates = slots
    .filter((s) => s.visible && s.open && s.layout === 'rail')
    .sort(
      (a, b) =>
        Number(b.resizing) - Number(a.resizing) ||
        b.openedAt - a.openedAt ||
        b.key - a.key
    )
  for (const slot of candidates) {
    if (documentWidth() >= minimum) break
    result.get(slot.key)!.floating = true
  }

  for (const slot of candidates) {
    const placement = result.get(slot.key)!
    if (placement.floating) {
      placement.shown = Math.min(slot.want, Math.max(slot.min, container - slot.rail))
    }
  }

  let shortfall = minimum - documentWidth()
  const narrowable = slots.filter(
    (s) => s.visible && (s.layout === 'stack' || (s.layout === 'tabs' && s.open))
  )
  while (shortfall > 1e-9) {
    const room = narrowable.filter((s) => result.get(s.key)!.shown > s.min)
    if (room.length === 0) break
    const top = Math.max(...room.map((s) => result.get(s.key)!.shown))
    const widest = room.filter((s) => result.get(s.key)!.shown === top)
    const below = Math.max(
      ...room.map((s) =>
        result.get(s.key)!.shown < top ? result.get(s.key)!.shown : -Infinity
      ),
      ...widest.map((s) => s.min)
    )
    const step = Math.min(top - below, shortfall / widest.length)
    for (const slot of widest) result.get(slot.key)!.shown = top - step
    shortfall -= step * widest.length
  }

  return result
}
