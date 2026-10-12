import { rectFromQuad, type Point, type Quad, type Rect } from './geometry'

import type { PdfjsTextContent, PdfjsTextItem } from '../pdfjs/types'

export interface TextItem {
  str: string
  dir: 'ltr' | 'rtl' | 'ttb'
  fontName: string
  fontSize: number
  hasEOL: boolean
  /** Glyph-run box in user space, following the run's rotation. */
  quad: Quad
  /** Axis-aligned bounds of `quad`. */
  rect: Rect
}

export interface TextContent {
  page: number
  items: TextItem[]
}

/** Fractions of the font size used when PDF.js has no usable metrics for the font. */
const FALLBACK_ASCENT = 0.75
const FALLBACK_DESCENT = 0.25

/**
 * Converts `getTextContent()` output to user-space boxes.
 *
 * For an item with transform [a, b, c, d, e, f] (already in user space):
 * - (e, f) is the start of the run on the baseline;
 * - u = (a, b) / |(a, b)| is the baseline direction, along which the run advances `width`;
 * - v = (c, d) / |(c, d)| is the glyph-up direction, and `fontSize` = |(c, d)|;
 * - the box spans from `descent * fontSize` below the baseline to `ascent * fontSize` above it,
 *   using the font's ascent/descent from `styles` when PDF.js provides them, else 0.75 / 0.25.
 *
 * So p3 = (e, f) - v * descent * fontSize, p4 = p3 + u * width, p1 = p3 + v * (ascent + descent) * fontSize,
 * p2 = p4 + (p1 - p3). `rect` is the axis-aligned bounding box of the quad.
 */
export function textContentFromPdfjs(page: number, tc: PdfjsTextContent): TextContent {
  const items: TextItem[] = []
  for (const raw of tc.items) {
    if (!('str' in raw)) continue
    const item: PdfjsTextItem = raw
    const [a, b, c, d, e, f] = item.transform as [
      number,
      number,
      number,
      number,
      number,
      number,
    ]
    const baseLen = Math.hypot(a, b)
    const fontSize = Math.hypot(c, d)
    const u: Point = baseLen === 0 ? { x: 1, y: 0 } : { x: a / baseLen, y: b / baseLen }
    const v: Point =
      fontSize === 0 ? { x: -u.y, y: u.x } : { x: c / fontSize, y: d / fontSize }
    const { ascent, descent } = metrics(tc.styles[item.fontName])
    const below = descent * fontSize
    const total = (ascent + descent) * fontSize
    const w = item.width
    const p3 = { x: e - v.x * below, y: f - v.y * below }
    const p4 = { x: p3.x + u.x * w, y: p3.y + u.y * w }
    const p1 = { x: p3.x + v.x * total, y: p3.y + v.y * total }
    const p2 = { x: p4.x + v.x * total, y: p4.y + v.y * total }
    const quad: Quad = { p1, p2, p3, p4 }
    items.push({
      str: item.str,
      dir: isDir(item.dir) ? item.dir : 'ltr',
      fontName: item.fontName,
      fontSize,
      hasEOL: item.hasEOL,
      quad,
      rect: rectFromQuad(quad),
    })
  }
  return { page, items }
}

function metrics(style: PdfjsTextContent['styles'][string] | undefined): {
  ascent: number
  descent: number
} {
  // Vertical fonts report metrics for horizontal layout, so they get the fallback box too.
  if (!style || style.vertical)
    return { ascent: FALLBACK_ASCENT, descent: FALLBACK_DESCENT }
  const ascent = style.ascent
  const descent = Math.abs(style.descent)
  if (!(ascent > 0) || !Number.isFinite(descent) || ascent + descent <= 0) {
    return { ascent: FALLBACK_ASCENT, descent: FALLBACK_DESCENT }
  }
  return { ascent, descent }
}

function isDir(dir: string): dir is TextItem['dir'] {
  return dir === 'ltr' || dir === 'rtl' || dir === 'ttb'
}
