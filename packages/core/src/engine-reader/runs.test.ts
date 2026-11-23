import { describe, expect, it } from 'vitest'

import { matchPage } from '../model/search'
import { searchableText } from '../model/search-text'

import { runsFromChars, type PageChars } from './runs'

import type { Quad } from '../model/geometry'
import type { TextItem } from '../model/text'

type Font = PageChars['fontTable'][number]

const HELVETICA: Font = {
  name: 'Helvetica',
  fixedPitch: false,
  serif: false,
  vertical: false,
}
const BOLD: Font = {
  name: 'Helvetica-Bold',
  fixedPitch: false,
  serif: false,
  vertical: false,
}

/** One character as a test lays it out: the engine's fields, with a cell built from them. */
interface Spec {
  /** One code point. */
  c: string
  /** The origin, on the baseline. */
  x: number
  y: number
  /** The advance along the baseline. Default half the size. */
  w?: number
  size?: number
  font?: number
  flags?: number
  /** The text matrix's a, b, c, d. */
  m?: readonly [number, number, number, number]
  /** The loose box, when the cell built from the advance is not wanted. */
  box?: readonly [number, number, number, number]
}

const GENERATED = 1
const HYPHEN = 2
const UNMAPPED = 4

/**
 * The engine's arrays for `specs`. A character's loose box is the axis-aligned bounds of its cell:
 * the advance along the baseline, a quarter of the size below it and three quarters above. A
 * generated character has an empty box at its origin, as the engine gives it.
 */
function chars(
  specs: readonly Spec[],
  fontTable: readonly Font[] = [HELVETICA]
): PageChars {
  const count = specs.length
  const geometry = new Float32Array(count * 15)
  const codes = new Uint32Array(count)
  const flags = new Uint8Array(count)
  const fonts = new Uint16Array(count)
  specs.forEach((s, i) => {
    const size = s.size ?? 12
    const w = s.w ?? size / 2
    const [a, b, c, d] = s.m ?? [1, 0, 0, 1]
    const ul = Math.hypot(a, b) || 1
    const ux = a / ul
    const uy = b / ul
    const vl = Math.hypot(c, d) || 1
    const vx = c / vl
    const vy = d / vl
    const generated = ((s.flags ?? 0) & GENERATED) !== 0
    let box: readonly number[]
    if (s.box) box = s.box
    else if (generated) box = [s.x, s.y, s.x, s.y]
    else {
      const corners = [0, w].flatMap((along) =>
        [-0.25 * size, 0.75 * size].map((up) => ({
          x: s.x + ux * along + vx * up,
          y: s.y + uy * along + vy * up,
        }))
      )
      const xs = corners.map((p) => p.x)
      const ys = corners.map((p) => p.y)
      box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    }
    geometry.set([...box, ...box, s.x, s.y, size, a, b, c, d], i * 15)
    codes[i] = (s.flags ?? 0) & UNMAPPED ? 0 : s.c.codePointAt(0)!
    flags[i] = s.flags ?? 0
    fonts[i] = s.font ?? 0
  })
  return { count, codes, geometry, flags, fonts, fontTable }
}

/** `text` laid out left to right from `x`, each character `w` wide. */
function line(text: string, x: number, y: number, extra: Partial<Spec> = {}): Spec[] {
  const w = extra.w ?? 6
  return [...text].map((c, i) => ({ ...extra, c, x: x + i * w, y, w }))
}

const lineBreak = (x: number, y: number, font = 0): Spec[] => [
  { c: '\r', x, y, flags: GENERATED, font },
  { c: '\n', x, y, flags: GENERATED, font },
]

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 4)

function nonDecreasing(values: readonly number[]) {
  values.slice(1).forEach((v, i) => expect(v).toBeGreaterThanOrEqual(values[i]! - 1e-9))
}

function allFinite(quad: Quad) {
  for (const p of [quad.p1, quad.p2, quad.p3, quad.p4]) {
    expect(Number.isFinite(p.x)).toBe(true)
    expect(Number.isFinite(p.y)).toBe(true)
  }
}

describe('runsFromChars', () => {
  it('makes one item of characters on one baseline in one font', () => {
    const { content, families } = runsFromChars(3, chars(line('Hello', 72, 700)))
    expect(content.page).toBe(3)
    expect(content.items).toHaveLength(1)
    const [item] = content.items
    expect(item).toMatchObject({
      str: 'Hello',
      dir: 'ltr',
      fontName: 'Helvetica',
      fontSize: 12,
      hasEOL: true,
    })
    // The first origin less the descent: a quarter of the size, as the cells are built.
    close(item!.quad.p3.x, 72)
    close(item!.quad.p3.y, 697)
    close(item!.quad.p4.x, 102)
    close(item!.quad.p1.y, 709)
    expect(item!.rect).toEqual({ x: 72, y: 697, width: 30, height: 12 })
    expect(item!.advances).toHaveLength(6)
    expect(item!.advances![0]).toBe(0)
    expect(item!.advances![5]).toBe(1)
    nonDecreasing(item!.advances!)
    expect(item!.glyphEnds).toHaveLength(5)
    close(item!.glyphEnds![0]!, 0.2)
    expect(families).toEqual(['sans-serif'])
  })

  it('starts a new item where the font changes', () => {
    const page = chars(
      [...line('ab', 72, 700), ...line('cd', 84, 700, { font: 1 })],
      [HELVETICA, BOLD]
    )
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => [i.str, i.fontName])).toEqual([
      ['ab', 'Helvetica'],
      ['cd', 'Helvetica-Bold'],
    ])
  })

  it('starts a new item where the size changes', () => {
    const page = chars([...line('ab', 72, 700), ...line('cd', 84, 700, { size: 14 })])
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => [i.str, i.fontSize])).toEqual([
      ['ab', 12],
      ['cd', 14],
    ])
  })

  it('keeps a generated space inside a run', () => {
    // A gap of a fifth of the size: under the gap that ends a run.
    const page = chars([
      ...line('ab', 72, 700),
      { c: ' ', x: 84, y: 700, flags: GENERATED },
      ...line('cd', 86.4, 700),
    ])
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => i.str)).toEqual(['ab cd'])
    const { advances, glyphEnds } = content.items[0]!
    expect(advances).toHaveLength(6)
    expect(glyphEnds).toHaveLength(5)
    nonDecreasing(advances!)
    // The run spans 72 to 98.4. The space runs from the end of b, at 84, to the start of c.
    close(advances![2]!, 12 / 26.4)
    close(glyphEnds![2]!, 14.4 / 26.4)
    close(glyphEnds![1]!, advances![2]!)
    close(advances![3]!, glyphEnds![2]!)
  })

  it('makes a generated space where the run breaks an item of its own, as PDF.js does', () => {
    // Half the size apart: the gap ends the run, and the space spans the gap.
    const page = chars([
      ...line('ab', 72, 700),
      { c: ' ', x: 84, y: 700, flags: GENERATED },
      ...line('cd', 90, 700),
    ])
    const { content, families } = runsFromChars(0, page)
    expect(content.items.map((i) => [i.str, i.hasEOL])).toEqual([
      ['ab', false],
      [' ', false],
      ['cd', true],
    ])
    const space = content.items[1]!
    expect(space.rect).toEqual({ x: 84, y: 697, width: 6, height: 12 })
    expect(space.advances).toEqual([0, 1])
    expect(space.glyphEnds).toEqual([1])
    expect(families).toHaveLength(3)
    // Copied span by span, the words keep their space; search adds no second one.
    expect(content.items.map((i) => i.str).join('')).toBe('ab cd')
    expect(searchableText(content).raw).toBe('ab cd ')
  })

  it('makes a generated space at a font change an item of its own', () => {
    const page = chars(
      [
        ...line('ab', 72, 700),
        { c: ' ', x: 84, y: 700, flags: GENERATED },
        ...line('cd', 87, 700, { font: 1 }),
      ],
      [HELVETICA, BOLD]
    )
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => [i.str, i.fontName])).toEqual([
      ['ab', 'Helvetica'],
      [' ', 'Helvetica'],
      ['cd', 'Helvetica-Bold'],
    ])
    expect(searchableText(content).raw).toBe('ab cd ')
  })

  it('lays a space between right-to-left runs against the baseline, falling from 1 to 0', () => {
    // של, a gap of half the size, then ום further left: the space runs from 120 left to 114.
    const page = chars([
      { c: 'ש', x: 130, y: 700, w: 10 },
      { c: 'ל', x: 120, y: 700, w: 10 },
      { c: ' ', x: 120, y: 700, flags: GENERATED },
      { c: 'ו', x: 104, y: 700, w: 10 },
      { c: 'ם', x: 94, y: 700, w: 10 },
    ])
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => [i.str, i.dir])).toEqual([
      ['של', 'rtl'],
      [' ', 'rtl'],
      ['ום', 'rtl'],
    ])
    const space = content.items[1]!
    expect(space.rect.x).toBeCloseTo(114, 5)
    expect(space.rect.width).toBeCloseTo(6, 5)
    expect(space.advances).toEqual([1, 0])
  })

  it('lays a space from a left-to-right run to the near end of a right-to-left one', () => {
    // ab from 72 to 84, then של from 90 to 110: ש, read first, is drawn rightmost.
    const page = chars([
      ...line('ab', 72, 700),
      { c: ' ', x: 84, y: 700, flags: GENERATED },
      { c: 'ש', x: 100, y: 700, w: 10 },
      { c: 'ל', x: 90, y: 700, w: 10 },
    ])
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => [i.str, i.dir])).toEqual([
      ['ab', 'ltr'],
      [' ', 'ltr'],
      ['של', 'rtl'],
    ])
    const space = content.items[1]!
    expect(space.rect).toEqual({ x: 84, y: 697, width: 6, height: 12 })
    expect(space.advances).toEqual([0, 1])
  })

  it('lays a space from a right-to-left run to the near end of a left-to-right one', () => {
    // של from 100 to 120, then ab further left, from 82 to 94: b, read last, is drawn rightmost.
    // The engine puts the space one advance right of ל's origin, at 110.
    const page = chars([
      { c: 'ש', x: 110, y: 700, w: 10 },
      { c: 'ל', x: 100, y: 700, w: 10 },
      { c: ' ', x: 110, y: 700, flags: GENERATED },
      ...line('ab', 82, 700),
    ])
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => [i.str, i.dir])).toEqual([
      ['של', 'rtl'],
      [' ', 'rtl'],
      ['ab', 'ltr'],
    ])
    const space = content.items[1]!
    expect(space.rect).toEqual({ x: 94, y: 697, width: 6, height: 12 })
    expect(space.advances).toEqual([1, 0])
  })

  it('drops a generated space before a line break', () => {
    const page = chars([
      ...line('ab', 72, 700),
      { c: ' ', x: 84, y: 700, flags: GENERATED },
      ...lineBreak(84, 700),
      ...line('cd', 72, 686),
    ])
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => i.str)).toEqual(['ab', 'cd'])
  })

  it('ends the run at a generated line break and marks it the end of its line', () => {
    const page = chars([
      ...line('ab', 72, 700),
      ...lineBreak(84, 700),
      ...line('cd', 72, 686),
    ])
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => [i.str, i.hasEOL])).toEqual([
      ['ab', true],
      ['cd', true],
    ])
  })

  it('ends the run at a generated line break even when the next character stays on its baseline', () => {
    // Nothing but the break separates the two: same font, size, baseline, and no gap.
    const page = chars([
      ...line('ab', 72, 700),
      ...lineBreak(84, 700),
      ...line('cd', 84, 700),
    ])
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => [i.str, i.hasEOL])).toEqual([
      ['ab', true],
      ['cd', true],
    ])
  })

  it('starts a new item across a gap of two font sizes with no generated space', () => {
    const page = chars([...line('ab', 72, 700), ...line('cd', 84 + 24, 700)])
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => i.str)).toEqual(['ab', 'cd'])
  })

  it('starts a new item where text jumps back on its baseline', () => {
    const page = chars([...line('ab', 72, 700), { c: 'c', x: 74, y: 700, w: 6 }])
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => i.str)).toEqual(['ab', 'c'])
  })

  it('keeps a kerned pair, whose second origin falls inside the first box, in one item', () => {
    const page = chars([
      { c: 'T', x: 72, y: 700, w: 8 },
      { c: 'o', x: 78.5, y: 700, w: 7 },
    ])
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => i.str)).toEqual(['To'])
    nonDecreasing(content.items[0]!.advances!)
  })

  it('starts a new item off the baseline', () => {
    const page = chars([...line('ab', 72, 700), ...line('cd', 84, 704)])
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => i.str)).toEqual(['ab', 'cd'])
  })

  it('starts a new item where the text turns', () => {
    const turned = [
      Math.cos(0.05),
      Math.sin(0.05),
      -Math.sin(0.05),
      Math.cos(0.05),
    ] as const
    const page = chars([...line('ab', 72, 700), ...line('cd', 84, 700, { m: turned })])
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => i.str)).toEqual(['ab', 'cd'])
  })

  it('lays the quad of text turned 90 degrees up the page', () => {
    const up = [0, 1, -1, 0] as const
    const page = chars(
      [...'abc'].map((c, i) => ({ c, x: 300, y: 100 + i * 6, w: 6, m: up }))
    )
    const { content } = runsFromChars(0, page)
    expect(content.items).toHaveLength(1)
    const { quad, rect, str } = content.items[0]!
    expect(str).toBe('abc')
    close(quad.p4.x - quad.p3.x, 0)
    close(quad.p4.y - quad.p3.y, 18)
    // Glyph-up points left of the baseline, so the descent sits to its right.
    close(quad.p3.x, 303)
    close(quad.p1.x, 291)
    close(rect.x, 291)
    close(rect.y, 100)
  })

  describe('a generated space on a turned baseline', () => {
    /**
     * `a bcd` along the matrix's baseline from (300, 100), each glyph 6 along. With `space`, the
     * space sits where the engine puts one whatever the text's direction: the previous origin
     * plus the advance along page x, at the same page y, with an empty box there.
     */
    function laid(m: readonly [number, number, number, number], space: boolean) {
      const at = (t: number) => ({ x: 300 + m[0] * t, y: 100 + m[1] * t })
      const specs: Spec[] = [{ c: 'a', ...at(0), w: 6, m }]
      if (space) specs.push({ c: ' ', x: 300 + 6, y: 100, m, flags: GENERATED })
      for (const [c, t] of [
        ['b', 8.4],
        ['c', 14.4],
        ['d', 20.4],
      ] as const)
        specs.push({ c, ...at(t), w: 6, m })
      const { items } = runsFromChars(0, chars(specs)).content
      expect(items).toHaveLength(1)
      return items[0]!
    }

    it.each([
      ['90', [0, 1, -1, 0]],
      ['180', [-1, 0, 0, -1]],
    ] as const)(
      'at %s degrees takes no part in the quad, and lies between its neighbours',
      (_, m) => {
        const spaced = laid(m, true)
        const plain = laid(m, false)
        expect([spaced.str, plain.str]).toEqual(['a bcd', 'abcd'])
        for (const corner of ['p1', 'p2', 'p3', 'p4'] as const) {
          close(spaced.quad[corner].x, plain.quad[corner].x)
          close(spaced.quad[corner].y, plain.quad[corner].y)
        }
        const height = (q: Quad) => Math.hypot(q.p1.x - q.p3.x, q.p1.y - q.p3.y)
        close(height(spaced.quad), height(plain.quad))
        close(height(spaced.quad), 12)
        const { advances, glyphEnds } = spaced
        expect(advances).toHaveLength(6)
        expect(glyphEnds).toHaveLength(5)
        nonDecreasing(advances!)
        // From the end of `a` to the start of `b`: 6 to 8.4 of 26.4 along the baseline.
        close(advances![1]!, glyphEnds![0]!)
        close(glyphEnds![1]!, advances![2]!)
        close(advances![1]!, 6 / 26.4)
        close(glyphEnds![1]!, 8.4 / 26.4)
      }
    )

    /**
     * Each turn with where `b`, drawn from 6 to 12 along, ends along the baseline, and how far
     * below the baseline the run's box reaches. At 90 and 180 degrees `b` ends with its cell, 12
     * along. At 30 degrees the loose boxes are the bounds of the turned cells, which reach 3 tan
     * 30 further along. The box reaches the font's descent below at every turn: a quarter of the
     * size for a font the engine has no figures for.
     */
    const turns = [
      ['90', [0, 1, -1, 0], 12, -3],
      ['180', [-1, 0, 0, -1], 12, -3],
      [
        '30',
        [
          Math.cos(Math.PI / 6),
          Math.sin(Math.PI / 6),
          -Math.sin(Math.PI / 6),
          Math.cos(Math.PI / 6),
        ],
        12 + 3 * Math.tan(Math.PI / 6),
        -3,
      ],
    ] as const

    it.each(turns)(
      'at %s degrees, between two runs, lies on the first run’s baseline from its end to the next start',
      (_, m, end, below) => {
        // `ab`, a gap of half the size, then `cd`: the gap ends the run.
        const at = (t: number) => ({ x: 300 + m[0] * t, y: 100 + m[1] * t })
        const page = chars([
          { c: 'a', ...at(0), w: 6, m },
          { c: 'b', ...at(6), w: 6, m },
          { c: ' ', x: at(6).x + 6, y: at(6).y, m, flags: GENERATED },
          { c: 'c', ...at(18), w: 6, m },
          { c: 'd', ...at(24), w: 6, m },
        ])
        const { content } = runsFromChars(0, page)
        expect(content.items.map((i) => [i.str, i.dir])).toEqual([
          ['ab', 'ltr'],
          [' ', 'ltr'],
          ['cd', 'ltr'],
        ])
        const [ab, space, cd] = content.items as [TextItem, TextItem, TextItem]
        // Measured from the first origin along the baseline and up the glyphs.
        const across = (p: { x: number; y: number }) =>
          (p.x - 300) * m[2] + (p.y - 100) * m[3]
        const along = (p: { x: number; y: number }) =>
          (p.x - 300) * m[0] + (p.y - 100) * m[1]
        // Parallel to the baseline at the height of `ab`, from the end of `b` to where `c`
        // starts, 18 along.
        close(along(space.quad.p3), end)
        close(along(space.quad.p4), 18)
        close(across(space.quad.p3), below)
        close(across(space.quad.p4), below)
        // It meets the runs on either side, at their height.
        close(space.quad.p3.x, ab.quad.p4.x)
        close(space.quad.p3.y, ab.quad.p4.y)
        close(space.quad.p2.x, cd.quad.p1.x)
        close(space.quad.p2.y, cd.quad.p1.y)
        close(space.quad.p1.x, ab.quad.p2.x)
        close(space.quad.p1.y, ab.quad.p2.y)
        expect(space.advances).toEqual([0, 1])
        expect(searchableText(content).raw).toBe('ab cd ')
      }
    )

    it('at 90 degrees, between two right-to-left runs, lies on the first run’s baseline', () => {
      // Up the page, so read down it: של from 20 down to 0 along the baseline, a gap of half the
      // size, then ום from -6 down to -26. The engine puts the space one advance along page x
      // from ל's origin, off the baseline.
      const m = [0, 1, -1, 0] as const
      const at = (t: number) => ({ x: 300, y: 100 + t })
      const page = chars([
        { c: 'ש', ...at(10), w: 10, m },
        { c: 'ל', ...at(0), w: 10, m },
        { c: ' ', x: 310, y: 100, m, flags: GENERATED },
        { c: 'ו', ...at(-16), w: 10, m },
        { c: 'ם', ...at(-26), w: 10, m },
      ])
      const { content } = runsFromChars(0, page)
      expect(content.items.map((i) => [i.str, i.dir])).toEqual([
        ['של', 'rtl'],
        [' ', 'rtl'],
        ['ום', 'rtl'],
      ])
      const space = content.items[1]!
      // Along the baseline from -6 to 0, a quarter of the size below it: right of x 300.
      for (const [corner, x, y] of [
        ['p3', 303, 94],
        ['p4', 303, 100],
        ['p1', 291, 94],
        ['p2', 291, 100],
      ] as const) {
        close(space.quad[corner].x, x)
        close(space.quad[corner].y, y)
      }
      expect(space.advances).toEqual([1, 0])
    })

    it.each(turns)(
      'at %s degrees, before a run on the next line, has no width at the first run’s end',
      (_, m) => {
        // `ab`, then `cd` from the start of a line 14 further down the glyphs, with no line break.
        const at = (t: number, line = 0) => ({
          x: 300 + m[0] * t - m[2] * 14 * line,
          y: 100 + m[1] * t - m[3] * 14 * line,
        })
        const page = chars([
          { c: 'a', ...at(0), w: 6, m },
          { c: 'b', ...at(6), w: 6, m },
          { c: ' ', x: at(6).x + 6, y: at(6).y, m, flags: GENERATED },
          { c: 'c', ...at(0, 1), w: 6, m },
          { c: 'd', ...at(6, 1), w: 6, m },
        ])
        const { content } = runsFromChars(0, page)
        expect(content.items.map((i) => i.str)).toEqual(['ab', ' ', 'cd'])
        const [ab, space] = content.items as [TextItem, TextItem]
        for (const [corner, edge] of [
          ['p3', 'p4'],
          ['p4', 'p4'],
          ['p1', 'p2'],
          ['p2', 'p2'],
        ] as const) {
          close(space.quad[corner].x, ab.quad[edge].x)
          close(space.quad[corner].y, ab.quad[edge].y)
        }
      }
    )
  })

  describe('right-to-left text', () => {
    // שלום in reading order, each glyph drawn rightwards from its origin, the first one rightmost.
    const hebrew = [...'שלום'].map((c, i) => ({
      c,
      x: 200 - (i + 1) * 10,
      y: 700,
      w: 10,
    }))

    it('makes one rtl item with its string in reading order', () => {
      const { content } = runsFromChars(0, chars(hebrew))
      expect(content.items).toHaveLength(1)
      const item = content.items[0]!
      expect(item.str).toBe('שלום')
      expect(item.dir).toBe('rtl')
      // The quad runs along the baseline, as a PDF.js item's does: left to right.
      close(item.quad.p3.x, 160)
      close(item.quad.p4.x, 200)
      // Boundaries are measured along the quad, so the first character's sits at its right end.
      expect(item.advances).toEqual([1, 0.75, 0.5, 0.25, 0])
      expect(item.glyphEnds).toEqual([0.75, 0.5, 0.25, 0])
    })

    it('puts a search hit over the glyphs it matched', () => {
      const { content } = runsFromChars(0, chars(hebrew))
      // ום is the last two letters read, so the leftmost two drawn.
      const [hit] = matchPage(searchableText(content), 'ום', {
        matchCase: false,
        wholeWord: false,
      })
      const xs = [hit!.quads[0]!.p3.x, hit!.quads[0]!.p4.x].sort((a, b) => a - b)
      close(xs[0]!, 160)
      close(xs[1]!, 180)
    })

    it('shares a run with no width out from 1 to 0', () => {
      const page = chars(
        [...'של'].map((c) => ({ c, x: 100, y: 700, box: [100, 700, 100, 700] as const }))
      )
      const item = runsFromChars(0, page).content.items[0]!
      expect(item.dir).toBe('rtl')
      expect(item.advances).toEqual([1, 0.5, 0])
      expect(item.glyphEnds).toEqual([0.5, 0])
    })

    it('starts a new item where the direction changes in one font', () => {
      const page = chars([...line('ab', 72, 700), { c: 'ש', x: 84, y: 700, w: 10 }])
      const { content } = runsFromChars(0, page)
      expect(content.items.map((i) => [i.str, i.dir])).toEqual([
        ['ab', 'ltr'],
        ['ש', 'rtl'],
      ])
    })
  })

  it('reads a vertical font top to bottom', () => {
    const vertical: Font = {
      name: 'Ahem',
      fixedPitch: false,
      serif: false,
      vertical: true,
    }
    // Square cells one size wide, each one size below the last, origins at their left edge.
    const page = chars(
      [...'日本語'].map((c, i) => {
        const top = 760 - i * 28
        return {
          c,
          x: 386,
          y: top - 24,
          size: 28,
          box: [386, top - 28, 414, top] as const,
        }
      }),
      [vertical]
    )
    const { content } = runsFromChars(0, page)
    expect(content.items).toHaveLength(1)
    const item = content.items[0]!
    expect(item.str).toBe('日本語')
    expect(item.dir).toBe('ttb')
    expect(item.rect).toEqual({ x: 386, y: 676, width: 28, height: 84 })
    expect(item.advances).toHaveLength(4)
    nonDecreasing(item.advances!)
    close(item.advances![1]!, 1 / 3)
  })

  it('leaves a character with no Unicode mapping out of the string', () => {
    const page = chars([
      ...line('a', 72, 700),
      { c: '?', x: 78, y: 700, w: 6, flags: UNMAPPED },
      ...line('b', 84, 700),
    ])
    const { content } = runsFromChars(0, page)
    const item = content.items[0]!
    expect(item.str).toBe('ab')
    expect(item.advances).toHaveLength(item.str.length + 1)
    expect(item.glyphEnds).toHaveLength(item.str.length)
    nonDecreasing(item.advances!)
  })

  it('splits a ligature reported as two characters with one box', () => {
    const fi = [72, 696, 84, 709] as const
    const page = chars([
      { c: 'f', x: 72, y: 700, box: fi },
      { c: 'i', x: 72, y: 700, box: fi },
      ...line('x', 84, 700),
    ])
    const { content } = runsFromChars(0, page)
    const item = content.items[0]!
    expect(item.str).toBe('fix')
    expect(item.advances).toHaveLength(4)
    expect(item.glyphEnds).toHaveLength(3)
    nonDecreasing(item.advances!)
    close(item.advances![1]!, 1 / 3)
  })

  it('gives a code point above U+FFFF two entries, as advancesOf counts them', () => {
    const page = chars([{ c: '𝐀', x: 72, y: 700, w: 12 }, ...line('b', 84, 700)])
    const { content } = runsFromChars(0, page)
    const item = content.items[0]!
    expect(item.str).toBe('𝐀b')
    expect(item.str).toHaveLength(3)
    expect(item.advances).toHaveLength(4)
    expect(item.glyphEnds).toHaveLength(3)
    expect(item.advances![0]).toBe(0)
    expect(item.advances![1]).toBe(item.glyphEnds![0])
    expect(item.glyphEnds![1]).toBe(item.glyphEnds![0])
    nonDecreasing(item.advances!)
  })

  it('writes a hyphen the engine reports by its flag as a hyphen-minus', () => {
    const page = chars([
      ...line('docu', 72, 700),
      { c: '\u0002', x: 96, y: 700, w: 4, flags: HYPHEN },
      ...lineBreak(100, 700),
      ...line('ment', 72, 686),
    ])
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => i.str)).toEqual(['docu-', 'ment'])
    expect(searchableText(content).norm).toBe('document ')
  })

  it('ends the line at a hyphen the engine marks, which it gives no line break after', () => {
    // As text-search's "docu-": the hyphen is code 2 with flag 2, and the next line's first
    // character follows it directly, with no generated \r\n between.
    const page = chars([
      ...line('A docu', 72, 676, { w: 7 }),
      { c: '\u0002', x: 114, y: 676, w: 4.67, flags: HYPHEN },
      ...line('ment', 72, 660, { w: 7 }),
    ])
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => [i.str, i.hasEOL])).toEqual([
      ['A docu-', true],
      ['ment', true],
    ])
    expect(searchableText(content).norm).toBe('A document ')
  })

  it('gives no items for a page with no characters', () => {
    const empty: PageChars = {
      count: 0,
      codes: new Uint32Array(0),
      geometry: new Float32Array(0),
      flags: new Uint8Array(0),
      fonts: new Uint16Array(0),
      fontTable: [],
    }
    expect(runsFromChars(1, empty)).toEqual({
      content: { page: 1, items: [] },
      families: [],
      baselines: [],
    })
  })

  it('names each item by its font and gives its generic family', () => {
    const table: Font[] = [
      { name: 'Courier', fixedPitch: true, serif: true, vertical: false },
      { name: 'Times-Roman', fixedPitch: false, serif: true, vertical: false },
      HELVETICA,
    ]
    const page = chars(
      [
        ...line('ab', 72, 700),
        ...line('cd', 84, 700, { font: 1 }),
        ...line('ef', 96, 700, { font: 2 }),
      ],
      table
    )
    const { content, families } = runsFromChars(0, page)
    expect(content.items.map((i) => i.fontName)).toEqual([
      'Courier',
      'Times-Roman',
      'Helvetica',
    ])
    expect(families).toEqual(['monospace', 'serif', 'sans-serif'])
  })

  it('gives finite boxes for a zero font size and a degenerate matrix', () => {
    const page = chars([
      { c: 'a', x: 72, y: 700, size: 0, w: 0, m: [0, 0, 0, 0], box: [72, 700, 72, 700] },
      { c: 'b', x: 72, y: 700, size: 0, w: 0, m: [0, 0, 0, 0], box: [72, 700, 72, 700] },
    ])
    const { content } = runsFromChars(0, page)
    for (const item of content.items) {
      allFinite(item.quad)
      expect(item.advances!.every(Number.isFinite)).toBe(true)
      expect(item.glyphEnds!.every(Number.isFinite)).toBe(true)
    }
    expect(content.items.map((i) => i.str).join('')).toBe('ab')
  })

  // Work that grows with the square of the characters, 10^10 steps here, would run far past the
  // test timeout; the results show every character was read once.
  it('reads a page of 100,000 characters', () => {
    const specs: Spec[] = []
    for (let row = 0; specs.length < 100_000; row++) {
      specs.push(
        ...line('The quick brown fox jumps over the lazy dog.', 72, 9000 - row * 14)
      )
      specs.push(...lineBreak(336, 9000 - row * 14))
    }
    const page = runsFromChars(0, chars(specs.slice(0, 100_000)))
    // 46 characters a line: the 44 drawn, then a line break of two, \r and \n.
    expect(page.content.items).toHaveLength(Math.ceil(100_000 / 46))
    expect(page.content.items[0]!.str).toBe(
      'The quick brown fox jumps over the lazy dog.'
    )
  })

  it('reads one run of 100,000 characters', () => {
    const { content } = runsFromChars(
      0,
      chars(line('x'.repeat(100_000), 72, 700, { w: 0.1 }))
    )
    expect(content.items).toHaveLength(1)
    expect(content.items[0]!.str).toHaveLength(100_000)
    expect(content.items[0]!.advances).toHaveLength(100_001)
  })

  it('reads no further than the arrays go when count says more', () => {
    const page = { ...chars(line('ab', 72, 700)), count: 10 }
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => i.str)).toEqual(['ab'])
  })

  it('reads no further than the shortest array when their lengths disagree', () => {
    const full = chars(line('abcd', 72, 700))
    for (const page of [
      { ...full, codes: full.codes.slice(0, 3) },
      { ...full, flags: full.flags.slice(0, 3) },
      { ...full, fonts: full.fonts.slice(0, 3) },
      { ...full, geometry: full.geometry.slice(0, 3 * 15 + 7) },
    ]) {
      expect(runsFromChars(0, page).content.items.map((i) => i.str)).toEqual(['abc'])
    }
  })

  it('gives finite numbers for geometry that is not a number', () => {
    const page = chars(line('abc', 72, 700))
    page.geometry.fill(Number.NaN, 15, 30)
    const { content } = runsFromChars(0, page)
    expect(content.items.map((i) => i.str).join('')).toBe('abc')
    for (const item of content.items) {
      allFinite(item.quad)
      expect(Object.values(item.rect).every(Number.isFinite)).toBe(true)
      expect(item.advances!.every(Number.isFinite)).toBe(true)
      expect(item.glyphEnds!.every(Number.isFinite)).toBe(true)
    }
  })

  describe("a run's height", () => {
    /** How far `p` stands from the baseline through (x0, y0) along `up`. */
    const across = (
      p: { x: number; y: number },
      x0: number,
      y0: number,
      up: [number, number]
    ) => (p.x - x0) * up[0] + (p.y - y0) * up[1]
    const heights = (item: TextItem, x0: number, y0: number, up: [number, number]) => [
      across(item.quad.p3, x0, y0, up),
      across(item.quad.p1, x0, y0, up),
    ]
    /** `ab` at 12 pt in `font`, with loose boxes 3 below and 9 above the baseline. */
    const run = (f: Partial<Font>, m?: readonly [number, number, number, number]) =>
      runsFromChars(
        0,
        chars(line('ab', 72, 700, m ? { m } : {}), [{ ...HELVETICA, ...f }])
      ).content.items[0]!

    it("stands on PDF.js's figures for a standard font, not on its loose boxes", () => {
      const item = run({ ascent: 0.945, descent: -0.224, standard: 'Helvetica' })
      const [below, above] = heights(item, 72, 700, [0, 1])
      close(below!, -0.207 * 12)
      close(above!, 0.718 * 12)
    })

    it("stands on the descriptor's figures, then the face's", () => {
      const descriptor = run({
        ascent: 0.9,
        descent: -0.25,
        descriptorAscent: 0.8,
        descriptorDescent: -0.2,
      })
      expect(heights(descriptor, 72, 700, [0, 1]).map((h) => +h.toFixed(4))).toEqual([
        -2.4, 9.6,
      ])
      const face = run({ ascent: 0.9, descent: -0.25 })
      expect(heights(face, 72, 700, [0, 1]).map((h) => +h.toFixed(4))).toEqual([-3, 10.8])
    })

    it('falls back to the loose boxes when the figures are absurd, and is never empty', () => {
      // An ascent of five ems and a descent deeper than an em: the cells, 3 below and 9 above.
      for (const f of [
        { ascent: 5, descent: -0.2 },
        { ascent: 0.8, descent: -1.3 },
      ]) {
        const [below, above] = heights(run(f), 72, 700, [0, 1])
        close(below!, -3)
        close(above!, 9)
      }
      // Loose boxes with no height, with figures that fail: PDF.js's 0.75 and 0.25.
      const flat = runsFromChars(
        0,
        chars(
          [...'ab'].map((c, i) => ({
            c,
            x: 72 + i * 6,
            y: 700,
            w: 6,
            box: [72 + i * 6, 700, 78 + i * 6, 700] as const,
          })),
          [{ ...HELVETICA, ascent: 0, descent: 0.4 }]
        )
      ).content.items[0]!
      const [below, above] = heights(flat, 72, 700, [0, 1])
      close(below!, -3)
      close(above!, 9)
      expect(above! > below!).toBe(true)
    })

    it('at 30 degrees, is the font size across the baseline, not the bounds of turned cells', () => {
      const c = Math.cos(Math.PI / 6)
      const sn = Math.sin(Math.PI / 6)
      const item = run({ standard: 'Helvetica' }, [c, sn, -sn, c])
      const [below, above] = heights(item, 72, 700, [-sn, c])
      close(below!, -0.207 * 12)
      close(above!, 0.718 * 12)
      // Its sides stand at a right angle to the baseline.
      close(
        (item.quad.p1.x - item.quad.p3.x) * c + (item.quad.p1.y - item.quad.p3.y) * sn,
        0
      )
    })

    it("scales with the text matrix: the font size is the size set times the matrix's (c, d)", () => {
      // Size 1 in a matrix that scales by 8, as `/F1 1 Tf 8 0 0 8 x y Tm` writes it.
      const page = chars(
        [...'ab'].map((ch, i) => ({
          c: ch,
          x: 72 + i * 4,
          y: 700,
          w: 4,
          size: 1,
          m: [8, 0, 0, 8] as const,
        })),
        [{ ...HELVETICA, standard: 'Times-Roman' }]
      )
      const item = runsFromChars(0, page).content.items[0]!
      expect(item.fontSize).toBe(8)
      const [below, above] = heights(item, 72, 700, [0, 1])
      close(below!, -0.217 * 8)
      close(above!, 0.683 * 8)
    })

    it('on a turned baseline, with figures that fail, takes the bounds of the turned cells', () => {
      // The loose path: at 30 degrees each cell's upright bounds reach 3 sin 60 further below.
      const c = Math.cos(Math.PI / 6)
      const sn = Math.sin(Math.PI / 6)
      const m = [c, sn, -sn, c] as const
      const page = chars(
        [0, 6].map((t, i) => ({ c: 'ab'[i]!, x: 72 + c * t, y: 700 + sn * t, w: 6, m })),
        [{ ...HELVETICA, ascent: 5, descent: -0.2 }]
      )
      const item = runsFromChars(0, page).content.items[0]!
      expect(item.str).toBe('ab')
      const [below, above] = heights(item, 72, 700, [-sn, c])
      close(below!, -3 - 3 * Math.sin(Math.PI / 3))
      expect(above! - below!).toBeGreaterThan(12)
    })

    it('scales its thresholds down with the text matrix: a 5 pt gap at 12 pt ends the run', () => {
      // Size 24 in a matrix that halves it: 12 pt in user space, so a run ends past 3.6 pt.
      const half = [0.5, 0, 0, 0.5] as const
      const page = chars([
        { c: 'a', x: 72, y: 700, w: 6, size: 24, m: half },
        { c: 'b', x: 83, y: 700, w: 6, size: 24, m: half },
      ])
      const { items } = runsFromChars(0, page).content
      expect(items.map((i) => [i.str, i.fontSize])).toEqual([
        ['a', 12],
        ['b', 12],
      ])
    })

    it('reads a gap between two items as a space by the size in user space', () => {
      // 2.5 pt between two fonts at 12 pt in user space: past 0.15 of 12, short of 0.15 of 24.
      const half = [0.5, 0, 0, 0.5] as const
      const page = chars(
        [
          ...line('ab', 72, 700, { size: 24, m: half }),
          ...line('cd', 86.5, 700, { size: 24, m: half, font: 1 }),
        ],
        [HELVETICA, BOLD]
      )
      const { content } = runsFromChars(0, page)
      expect(content.items.map((i) => i.str)).toEqual(['ab', 'cd'])
      expect(searchableText(content).raw).toBe('ab cd ')
    })

    it("stands along the matrix's (c, d) when the matrix skews the text, as PDF.js does", () => {
      // The baseline along x, the glyphs leaning 45 degrees: (c, d) = (1, 1).
      const item = run({}, [1, 0, 1, 1])
      const lean = Math.SQRT1_2
      const { p1, p3 } = item.quad
      close((p1.x - p3.x) / Math.hypot(p1.x - p3.x, p1.y - p3.y), lean)
      // One em along (c, d), whose length makes the size 12 times sqrt 2.
      close(item.fontSize, 12 * Math.SQRT2)
      close(Math.hypot(p1.x - p3.x, p1.y - p3.y), item.fontSize)
      close(p3.x, 72 - 0.25 * item.fontSize * lean)
    })

    it('gives how far each baseline stands above its box, none for vertical text', () => {
      const page = chars(
        [
          ...line('ab', 72, 700),
          { c: ' ', x: 84, y: 700, flags: GENERATED },
          ...line('cd', 120, 700),
          { c: 'e', x: 72, y: 600, font: 1 },
        ],
        [
          { ...HELVETICA, standard: 'Helvetica' },
          { ...HELVETICA, vertical: true },
        ]
      )
      const { content, baselines } = runsFromChars(0, page)
      expect(content.items.map((i) => i.str)).toEqual(['ab', ' ', 'cd', 'e'])
      expect(baselines.slice(0, 3).map((b) => +b.toFixed(4))).toEqual([
        2.484, 2.484, 2.484,
      ])
      expect(baselines[3]).toBeNaN()
    })

    it('gives a space between two runs the size of the run before it', () => {
      const page = chars(
        [
          { c: 'a', x: 72, y: 700, w: 4, size: 1, m: [8, 0, 0, 8] },
          { c: ' ', x: 76, y: 700, size: 1, flags: GENERATED },
          { c: 'b', x: 100, y: 700, w: 4, size: 1, m: [8, 0, 0, 8] },
        ],
        [{ ...HELVETICA, standard: 'Helvetica' }]
      )
      const { items } = runsFromChars(0, page).content
      expect(items.map((i) => [i.str, i.fontSize])).toEqual([
        ['a', 8],
        [' ', 8],
        ['b', 8],
      ])
    })
  })
})
