import { describe, expect, test } from 'vitest'

import { arcToCubics } from './arc'
import { describeAnnotation } from './describe'
import { describeNote, GLYPHS, glyphItems } from './note'
import { standardMeasure } from './text/measure'

import type { Point } from '../../geometry'
import type { NoteAnnotation } from '../types'
import type { DrawContext, DrawItem, PathCommand } from './types'

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

  test('a name inherited from Object draws the square alone', () => {
    for (const icon of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(itemsOf({ ...note, icon }), icon).toHaveLength(1)
    }
  })

  test('a reversed or negative rect is the box it spans', () => {
    const upright = describeNote(note, context())
    const reversed = describeNote(
      { ...note, rect: { x: 120, y: 720, width: -20, height: -20 } },
      context()
    )
    expect(reversed).toEqual(upright)
    const negative = describeNote(
      { ...note, rect: { x: 100, y: 700, width: -20, height: 20 } },
      context()
    )
    expect(negative.bounds).toEqual({ x: 80, y: 700, width: 20, height: 20 })
    const [group] = negative.items
    if (group?.kind !== 'group') throw new Error('expected a group')
    const arcs = group.items.flatMap((i) =>
      i.kind === 'path' ? i.commands.filter((c) => c.op === 'A') : []
    )
    for (const arc of arcs) if (arc.op === 'A') expect(arc.rx).toBeGreaterThan(0)
  })

  test('an unknown icon draws the square alone', () => {
    const d = describeNote({ ...note, icon: 'Check' }, context())
    expect(d.items).toHaveLength(1)
    expect(itemsOf({ ...note, icon: 'Check' })).toHaveLength(1)
  })

  /** Points along an item's outline, arcs and curves included. */
  function outline(item: DrawItem): Point[] {
    if (item.kind !== 'path') return pointsOf(item)
    const out: Point[] = []
    let at: Point = { x: 0, y: 0 }
    const along = (cubics: PathCommand[]): void => {
      for (const c of cubics) {
        if (c.op !== 'C') continue
        for (let k = 1; k <= 16; k++) {
          const u = k / 16
          const v = 1 - u
          const f = (a: number, b: number, c2: number, d: number): number =>
            v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c2 + u * u * u * d
          out.push({
            x: f(at.x, c.c1.x, c.c2.x, c.to.x),
            y: f(at.y, c.c1.y, c.c2.y, c.to.y),
          })
        }
        at = c.to
      }
    }
    for (const c of item.commands) {
      if (c.op === 'M' || c.op === 'L') {
        out.push(c.to)
        at = c.to
      } else if (c.op === 'C') along([c])
      else if (c.op === 'A') along(arcToCubics(at, c))
    }
    return out
  }

  test('a glyph stays inside the middle 60% along its arcs and curves', () => {
    for (const rotate of [0, 90, 180, 270] as const) {
      for (const icon of ICONS) {
        const [, ...glyph] = itemsOf({ ...note, icon }, rotate)
        // Half the stroke is not counted: the box bounds the path, as the brief says.
        for (const p of glyph.flatMap(outline)) {
          expect(p.x, `${icon} ${rotate}`).toBeGreaterThanOrEqual(104 - 1e-6)
          expect(p.x, `${icon} ${rotate}`).toBeLessThanOrEqual(116 + 1e-6)
          expect(p.y, `${icon} ${rotate}`).toBeGreaterThanOrEqual(704 - 1e-6)
          expect(p.y, `${icon} ${rotate}`).toBeLessThanOrEqual(716 + 1e-6)
        }
      }
    }
  })

  test('every node of the seven glyphs is a kind the describer draws, one item each', () => {
    expect(Object.keys(GLYPHS).sort()).toEqual([...ICONS].sort())
    for (const icon of ICONS) {
      const nodes = GLYPHS[icon]!
      for (const [tag] of nodes) expect(['path', 'circle', 'rect'], icon).toContain(tag)
      expect(itemsOf({ ...note, icon }).length - 1, icon).toBe(nodes.length)
    }
  })

  test('a glyph in a rect that is not square is centred and not stretched', () => {
    const wide = {
      ...note,
      icon: 'Insert',
      rect: { x: 100, y: 700, width: 40, height: 20 },
    }
    const [, chevron] = itemsOf(wide)
    const xs = pointsOf(chevron!).map((p) => p.x)
    const ys = pointsOf(chevron!).map((p) => p.y)
    // Lucide's chevron runs 6 to 18 across and 9 to 15 down in 24 units, drawn at 12/24.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(3)
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(120)
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(710)
  })

  test('a rect node becomes a rect item with its corner radius, and a line node is skipped', () => {
    const nodes = [
      ['rect', { x: '4', y: '6', width: '16', height: '12', rx: '2' }],
      ['line', { x1: '0', y1: '0', x2: '24', y2: '24' }],
    ] as const
    const square = { x: 0, y: 0, width: 24, height: 24 }
    const [upright, ...rest] = glyphItems(nodes, square, 0)
    expect(rest).toEqual([])
    expect(upright).toMatchObject({ kind: 'rect', role: 'note-glyph', radius: 1.2 })
    const r = (upright as Extract<DrawItem, { kind: 'rect' }>).rect
    expect(r.x).toBeCloseTo(7.2)
    expect(r.y).toBeCloseTo(8.4)
    expect(r.width).toBeCloseTo(9.6)
    expect(r.height).toBeCloseTo(7.2)
    // On a sideways page the box is the same as displayed, so its user-space sides swap.
    const [turned] = glyphItems(nodes, square, 90)
    const q = (turned as Extract<DrawItem, { kind: 'rect' }>).rect
    expect(q.width).toBeCloseTo(7.2)
    expect(q.height).toBeCloseTo(9.6)
  })
})
