import { describe, expect, test } from 'vitest'

import { describeAnnotation } from './describe'
import { describeNote } from './note'
import { standardMeasure } from './text/measure'

import type { Point } from '../../geometry'
import type { NoteAnnotation } from '../types'
import type { DrawContext, DrawItem } from './types'

const note: NoteAnnotation = {
  id: 'a',
  type: 'text',
  page: 0,
  color: '#3366CC',
  opacity: 1,
  createdAt: '2026-10-19T12:00:00.000Z',
  modifiedAt: '2026-10-19T12:00:00.000Z',
  source: 'session',
  rect: { x: 100, y: 700, width: 20, height: 20 },
  icon: 'Comment',
}

const context = (rotate: 0 | 90 | 180 | 270 = 0): DrawContext => ({
  page: { box: { x: 0, y: 0, width: 612, height: 792 }, rotate, userUnit: 1 },
  measure: standardMeasure,
})

const ICONS = ['Comment', 'Note', 'Help', 'Insert', 'Key', 'NewParagraph', 'Paragraph']

/** The items of the one group a note is drawn in. */
const itemsOf = (n: NoteAnnotation, rotate: 0 | 90 | 180 | 270 = 0): DrawItem[] => {
  const [group] = describeNote(n, context(rotate)).items
  if (group?.kind !== 'group') throw new Error('expected a group')
  return [...group.items]
}

type PathItem = Extract<DrawItem, { kind: 'path' }>
const square = (n: NoteAnnotation, rotate: 0 | 90 | 180 | 270 = 0): PathItem => {
  const item = itemsOf(n, rotate)[0]
  if (item?.kind !== 'path') throw new Error('expected a path')
  return item
}

/** The user-space points an item places, control points included. */
function pointsOf(item: DrawItem): Point[] {
  switch (item.kind) {
    case 'path':
      return item.commands.flatMap((c) =>
        c.op === 'C' ? [c.c1, c.c2, c.to] : c.op === 'Z' ? [] : [c.to]
      )
    case 'ellipse':
    case 'rect': {
      const { x, y, width, height } = item.rect
      return [
        { x, y },
        { x: x + width, y: y + height },
      ]
    }
    default:
      return []
  }
}

describe('describeNote', () => {
  test('a note is a rounded square in its own colour', () => {
    const d = describeAnnotation({ ...note, icon: 'Check' }, context())!
    expect(d.layer).toBe('annotation')
    expect(d.bounds).toEqual(note.rect)
    expect(d.items).toMatchObject([
      {
        kind: 'group',
        opacity: 1,
        items: [{ kind: 'path', role: 'note', paint: { fill: { color: '#3366CC' } } }],
      },
    ])
    const commands = square(note).commands
    const arcs = commands.filter((c) => c.op === 'A')
    expect(arcs).toHaveLength(3)
    for (const arc of arcs) expect(arc).toMatchObject({ rx: 3, ry: 3, sweep: false })
    expect(commands.map((c) => c.op)).toEqual([
      'M',
      'L',
      'A',
      'L',
      'A',
      'L',
      'L',
      'A',
      'Z',
    ])
  })

  test('the opacity is the group’s', () => {
    const [group] = describeNote({ ...note, opacity: 0.4 }, context()).items
    expect(group).toMatchObject({ kind: 'group', opacity: 0.4 })
  })

  test('the radius is 15% of the shorter side', () => {
    const wide = { ...note, rect: { x: 0, y: 0, width: 40, height: 20 } }
    expect(square(wide).commands.find((c) => c.op === 'A')).toMatchObject({ rx: 3 })
  })

  test('the square corner follows the page rotation', () => {
    // The corner that is bottom-left as displayed is the one with a line in and a line out.
    const corner = (rotate: 0 | 90 | 180 | 270): Point => {
      const commands = square(note, rotate).commands
      const i = commands.findIndex((c, k) => c.op === 'L' && commands[k + 1]?.op === 'L')
      return (commands[i] as { to: Point }).to
    }
    expect(corner(0)).toEqual({ x: 100, y: 700 })
    expect(corner(90)).toEqual({ x: 120, y: 700 })
    expect(corner(180)).toEqual({ x: 120, y: 720 })
    expect(corner(270)).toEqual({ x: 100, y: 720 })
  })

  test('each known icon has a glyph inside the middle 60%', () => {
    for (const rotate of [0, 90, 180, 270] as const) {
      for (const icon of ICONS) {
        const [, ...glyph] = itemsOf({ ...note, icon }, rotate)
        expect(glyph.length, icon).toBeGreaterThan(0)
        for (const item of glyph) {
          expect(item.role).toBe('note-glyph')
          for (const p of pointsOf(item)) {
            expect(p.x, `${icon} ${rotate}`).toBeGreaterThanOrEqual(104 - 1e-9)
            expect(p.x, `${icon} ${rotate}`).toBeLessThanOrEqual(116 + 1e-9)
            expect(p.y, `${icon} ${rotate}`).toBeGreaterThanOrEqual(704 - 1e-9)
            expect(p.y, `${icon} ${rotate}`).toBeLessThanOrEqual(716 + 1e-9)
          }
        }
      }
    }
  })

  test('a glyph is stroked in ink at 2/24 of its size with round joins and caps', () => {
    const [, glyph] = itemsOf(note)
    expect(glyph).toMatchObject({
      paint: { stroke: { color: '#151820', width: 1, join: 'round', cap: 'round' } },
    })
  })

  test('a glyph is upright as the page is displayed', () => {
    // Insert is a chevron pointing up on the displayed page: its apex is the highest point as
    // displayed, whatever the page's rotation.
    const apex: Record<number, (p: Point) => number> = {
      0: (p) => p.y,
      90: (p) => -p.x,
      180: (p) => -p.y,
      270: (p) => p.x,
    }
    for (const rotate of [0, 90, 180, 270] as const) {
      const [, chevron] = itemsOf({ ...note, icon: 'Insert' }, rotate)
      const points = pointsOf(chevron!)
      const [a, b, c] = points as [Point, Point, Point]
      const height = apex[rotate]!
      expect(height(b), String(rotate)).toBeGreaterThan(height(a))
      expect(height(b), String(rotate)).toBeGreaterThan(height(c))
    }
  })

  test('arcs of a glyph swap their radii on a sideways page and keep their sense', () => {
    const arcs = (rotate: 0 | 90): PathItem['commands'] =>
      (itemsOf({ ...note, icon: 'Note' }, rotate)[1] as PathItem).commands.filter(
        (c) => c.op === 'A'
      )
    // Lucide's arcs are circular, so the swap is invisible in the numbers; the sense is not.
    expect(arcs(0).every((c) => c.op === 'A' && c.rx === c.ry)).toBe(true)
    expect(arcs(0).map((c) => c.op === 'A' && c.sweep)).toEqual(
      arcs(90).map((c) => c.op === 'A' && c.sweep)
    )
  })

  test('the dot of a key is filled', () => {
    const items = itemsOf({ ...note, icon: 'Key' })
    const dot = items.find((i) => i.kind === 'ellipse')
    expect(dot).toMatchObject({
      role: 'note-glyph',
      paint: { fill: { color: '#151820' } },
    })
  })

  test('an unknown icon draws the square alone', () => {
    const d = describeNote({ ...note, icon: 'Check' }, context())
    expect(d.items).toHaveLength(1)
    expect(itemsOf({ ...note, icon: 'Check' })).toHaveLength(1)
  })
})
