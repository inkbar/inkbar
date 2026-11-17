import {
  ChevronUp,
  CircleQuestionMark,
  KeyRound,
  ListPlus,
  MessageSquare,
  Pilcrow,
  StickyNote,
  type IconNode,
} from '@inkbar/icons'

import { AXES } from './freetext'
import { parsePathData } from './path-data'

import type { Point, Rect } from '../../geometry'
import type { NoteAnnotation } from '../types'
import type { DrawContext, DrawItem, Drawing, Paint, PathCommand } from './types'

/** The corner radius of a note's square, as a share of its shorter side. */
const RADIUS = 0.15
/** The share of the shorter side the glyph's 24-unit box is scaled into. */
const GLYPH = 0.6
/** The glyph's stroke, in its own 24-unit box: Lucide's. */
const STROKE = 2
const BOX = 24
const INK = '#151820'

/** The glyph each note icon name stands for. A name that is not here draws the square alone. */
export const GLYPHS: Readonly<Record<string, IconNode>> = {
  Comment: MessageSquare,
  Note: StickyNote,
  Help: CircleQuestionMark,
  Insert: ChevronUp,
  Key: KeyRound,
  NewParagraph: ListPlus,
  Paragraph: Pilcrow,
}

/** Parsed `d` strings, by the string: the icons are constants. */
const parsed = new Map<string, PathCommand[]>()
const commandsOf = (d: string): PathCommand[] => {
  let out = parsed.get(d)
  if (!out) parsed.set(d, (out = parsePathData(d)))
  return out
}

/** The displayed box of `rect` on a page turned by `rotate`: its size and a map into user space. */
function displayedFrame(rect: Rect, rotate: 0 | 90 | 180 | 270) {
  const { dir, down } = AXES[rotate]
  const sideways = rotate === 90 || rotate === 270
  const width = sideways ? rect.height : rect.width
  const height = sideways ? rect.width : rect.height
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  const origin: Point = {
    x: centre.x - (dir.x * width) / 2 - (down.x * height) / 2,
    y: centre.y - (dir.y * width) / 2 - (down.y * height) / 2,
  }
  /** A point of the displayed box (x right, y down from its top-left) in user space. */
  const at = (u: number, v: number): Point => ({
    x: origin.x + dir.x * u + down.x * v,
    y: origin.y + dir.y * u + down.y * v,
  })
  return { width, height, sideways, at }
}

/**
 * A note: a rounded square in its own colour, square at the corner that is bottom-left as the
 * page is displayed, with its icon's glyph in the middle. The glyph is upright for the page as the
 * file displays it, like text. All in one group that carries the opacity.
 */
export function describeNote(a: NoteAnnotation, context: DrawContext): Drawing {
  const { rect } = a
  const { width, height, at } = displayedFrame(rect, context.page.rotate)

  const r = Math.min(width, height) * RADIUS
  // Clockwise as displayed: sweep is false in a description's terms.
  const arc = (u: number, v: number): PathCommand => ({
    op: 'A',
    rx: r,
    ry: r,
    largeArc: false,
    sweep: false,
    to: at(u, v),
  })
  const square: PathCommand[] = [
    { op: 'M', to: at(r, 0) },
    { op: 'L', to: at(width - r, 0) },
    arc(width, r),
    { op: 'L', to: at(width, height - r) },
    arc(width - r, height),
    { op: 'L', to: at(0, height) },
    { op: 'L', to: at(0, r) },
    arc(r, 0),
    { op: 'Z' },
  ]

  const items: DrawItem[] = [
    {
      kind: 'path',
      role: 'note',
      commands: square,
      paint: { fill: { color: a.color } },
    },
  ]
  const glyph = Object.hasOwn(GLYPHS, a.icon) ? GLYPHS[a.icon] : undefined
  if (glyph) items.push(...glyphItems(glyph, rect, context.page.rotate))

  return {
    layer: 'annotation',
    bounds: rect,
    items: [{ kind: 'group', opacity: a.opacity, items }],
  }
}

/**
 * The items of an icon's nodes (`path`, `circle` and `rect`; any other tag is skipped) scaled from
 * their 24-unit box into the middle of `rect`'s shorter side, upright for a page turned by `rotate`.
 */
export function glyphItems(
  glyph: IconNode,
  rect: Rect,
  rotate: 0 | 90 | 180 | 270
): DrawItem[] {
  const { width, height, sideways, at } = displayedFrame(rect, rotate)
  const items: DrawItem[] = []
  const side = Math.min(width, height) * GLYPH
  const scale = side / BOX
  const left = (width - side) / 2
  const top = (height - side) / 2
  const to = (x: number, y: number): Point => at(left + x * scale, top + y * scale)
  /** The user-space box of a box given in the glyph's own units. */
  const boxOf = (x: number, y: number, w: number, h: number): Rect => {
    const p = to(x, y)
    const q = to(x + w, y + h)
    return {
      x: Math.min(p.x, q.x),
      y: Math.min(p.y, q.y),
      width: Math.abs(q.x - p.x),
      height: Math.abs(q.y - p.y),
    }
  }
  const stroke = {
    color: INK,
    width: (side * STROKE) / BOX,
    join: 'round',
    cap: 'round',
  } as const
  for (const [tag, attrs] of glyph) {
    const num = (name: string): number => Number(attrs[name] ?? 0)
    const paint: Paint = {
      ...(attrs.fill === 'currentColor' ? { fill: { color: INK } } : {}),
      stroke,
    }
    if (tag === 'path') {
      const commands = commandsOf(attrs.d ?? '').map((c): PathCommand => {
        switch (c.op) {
          case 'M':
          case 'L':
            return { op: c.op, to: to(c.to.x, c.to.y) }
          case 'C':
            return {
              op: 'C',
              c1: to(c.c1.x, c.c1.y),
              c2: to(c.c2.x, c.c2.y),
              to: to(c.to.x, c.to.y),
            }
          case 'A':
            return {
              op: 'A',
              rx: (sideways ? c.ry : c.rx) * scale,
              ry: (sideways ? c.rx : c.ry) * scale,
              largeArc: c.largeArc,
              // The icon's sweep is as drawn with y down; a description's is the other way.
              sweep: !c.sweep,
              to: to(c.to.x, c.to.y),
            }
          case 'Z':
            return c
        }
      })
      items.push({ kind: 'path', role: 'note-glyph', commands, paint })
    } else if (tag === 'circle') {
      const [cx, cy, radius] = [num('cx'), num('cy'), num('r')]
      items.push({
        kind: 'ellipse',
        role: 'note-glyph',
        rect: boxOf(cx - radius, cy - radius, radius * 2, radius * 2),
        paint,
      })
    } else if (tag === 'rect') {
      const radius = num('rx') * scale
      items.push({
        kind: 'rect',
        role: 'note-glyph',
        rect: boxOf(num('x'), num('y'), num('width'), num('height')),
        ...(radius > 0 ? { radius } : {}),
        paint,
      })
    }
  }
  return items
}
