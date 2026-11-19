import { staticDefaults } from '../annotations/defaults'
import { standardMeasure } from '../annotations/drawing/text/measure'
import { rectFromQuad } from '../geometry'

import type { DrawItem, Drawing, TextFont } from '../annotations/drawing/types'
import type { Annotation } from '../annotations/types'
import type { Point, Rect } from '../geometry'

const FONT: TextFont = { family: 'Helvetica', bold: false, italic: false }
const MIN_SIZE = 4
const MAX_SIZE = 24

/** Relative luminance of a `#RRGGBB` colour, by the WCAG formula on sRGB. */
function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

/**
 * What stays where a mark was: its quads (or its `rect`) filled opaque in `interiorColor`, with no
 * outline, and the mark's `overlayText` on it when it has one. The text is Helvetica, centred in
 * the mark's box on one line, at the largest size from 4 to 24 points that fits the box, white on
 * a dark fill and black on a light one.
 */
export function redactionOverlay(mark: Annotation): Drawing {
  if (mark.type !== 'redact')
    throw new TypeError('redactionOverlay needs a redact annotation')
  const fill = mark.interiorColor || staticDefaults.fill()
  const paint = { fill: { color: fill, opacity: 1 } }
  // A mark with no quads, or an empty list of them, covers its `rect`, as the region does.
  const quads = mark.quads && mark.quads.length > 0 ? mark.quads : undefined
  const items: DrawItem[] = quads
    ? quads.map((q): DrawItem => ({
        kind: 'polygon',
        points: [q.p1, q.p2, q.p4, q.p3],
        paint,
      }))
    : [{ kind: 'rect', rect: mark.rect, paint }]
  const box: Rect = mark.rect
  if (mark.overlayText) {
    const text = mark.overlayText
    const { ascent, descent } = standardMeasure.vertical(FONT)
    let size = MIN_SIZE
    for (let s = MAX_SIZE; s > MIN_SIZE; s--) {
      if (
        s * (ascent + descent) <= box.height &&
        standardMeasure.width(text, FONT, s).width <= box.width
      ) {
        size = s
        break
      }
    }
    const { width, outside } = standardMeasure.width(text, FONT, size)
    const origin: Point = {
      x: box.x + (box.width - width) / 2,
      y: box.y + box.height / 2 - ((ascent - descent) / 2) * size,
    }
    items.push({
      kind: 'text',
      lines: [{ text, origin, width, outside }],
      font: FONT,
      size,
      color: luminance(fill) < 0.5 ? '#FFFFFF' : '#000000',
      angle: 0,
      outsideStandardFonts: outside,
    })
  }
  const covered = quads ? quads.map(rectFromQuad) : [mark.rect]
  const x = Math.min(...covered.map((r) => r.x))
  const y = Math.min(...covered.map((r) => r.y))
  return {
    layer: 'annotation',
    bounds: {
      x,
      y,
      width: Math.max(...covered.map((r) => r.x + r.width)) - x,
      height: Math.max(...covered.map((r) => r.y + r.height)) - y,
    },
    items,
  }
}
