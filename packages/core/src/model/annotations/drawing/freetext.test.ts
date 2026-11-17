import { describe, expect, test } from 'vitest'

import { describeAnnotation } from './describe'
import { describeFreeText, freeTextFrame, freeTextTextHeight } from './freetext'
import { layoutText } from './text/layout'
import { resolveFont, standardMeasure } from './text/measure'

import type { FreeTextAnnotation } from '../types'
import type { DrawContext, DrawItem, Drawing } from './types'

const base = {
  id: 'a',
  page: 0,
  opacity: 1,
  createdAt: '2026-10-19T12:00:00.000Z',
  modifiedAt: '2026-10-19T12:00:00.000Z',
  source: 'session',
  type: 'freetext',
  rect: { x: 100, y: 600, width: 144, height: 40 },
  width: 0,
  contents: 'Hello',
  defaultStyle: {
    fontFamily: 'Helvetica',
    fontSize: 12,
    textAlign: 'left',
    color: '#151820',
  },
} as const

const box: FreeTextAnnotation = { ...base }

const context = (
  rotate: 0 | 90 | 180 | 270 = 0,
  pageBox = { x: 0, y: 0, width: 612, height: 792 }
): DrawContext => ({
  page: { box: pageBox, rotate, userUnit: 1 },
  measure: standardMeasure,
})

/** The items of the one group a text box is drawn in. */
function inner(d: Drawing): readonly DrawItem[] {
  const [group] = d.items
  if (group?.kind !== 'group') throw new Error('expected one group')
  return group.items
}

const roles = (d: Drawing): (string | undefined)[] => inner(d).map((i) => i.role)

function text(d: Drawing): Extract<DrawItem, { kind: 'text' }> {
  const item = inner(d).find((i) => i.kind === 'text')
  if (item?.kind !== 'text') throw new Error('expected a text item')
  return item
}

describe('describeFreeText', () => {
  test('a plain box is a rect and its text, in one group', () => {
    const d = describeFreeText({ ...box, color: '#FFFF00', opacity: 0.5 }, context())
    expect(d.layer).toBe('annotation')
    expect(d.bounds).toEqual(box.rect)
    expect(d.items).toHaveLength(1)
    expect(d.items[0]).toMatchObject({ kind: 'group', opacity: 0.5 })
    expect(roles(d)).toEqual(['box', 'text'])
    expect(inner(d)[0]).toMatchObject({
      kind: 'rect',
      rect: box.rect,
      paint: { fill: { color: '#FFFF00' } },
    })
    // No border: nothing is stroked.
    expect(JSON.stringify(inner(d)[0])).not.toContain('stroke')
  })

  test('a box with no fill has none', () => {
    expect(JSON.stringify(inner(describeFreeText(box, context()))[0])).not.toContain(
      'fill'
    )
  })

  test('the border is its own rule, drawn inside the box over a fill that covers the whole box', () => {
    const d = describeFreeText(
      { ...box, width: 4, borderColor: '#FF0000', cornerRadius: 6, color: '#FFFF00' },
      context()
    )
    expect(roles(d)).toEqual(['box', 'border', 'text'])
    expect(inner(d)[0]).toEqual({
      kind: 'rect',
      role: 'box',
      rect: box.rect,
      radius: 6,
      paint: { fill: { color: '#FFFF00' } },
    })
    expect(inner(d)[1]).toEqual({
      kind: 'rect',
      role: 'border',
      rect: { x: 102, y: 602, width: 140, height: 36 },
      radius: 4,
      paint: { stroke: { color: '#FF0000', width: 4 } },
    })
  })

  test('a border with no colour of its own takes the text colour', () => {
    const d = describeFreeText({ ...box, width: 1 }, context())
    expect(inner(d)[1]).toMatchObject({
      role: 'border',
      paint: { stroke: { color: '#151820', width: 1 } },
    })
  })

  test('a dashed border carries the annotation dashes and the fill stays whole under it', () => {
    const d = describeFreeText(
      { ...box, width: 2, dashes: [4, 2], color: '#FFFF00' },
      context()
    )
    expect(inner(d)[1]).toMatchObject({ paint: { stroke: { dashes: [4, 2] } } })
    expect(inner(d)[0]).toMatchObject({ rect: box.rect })
    expect(JSON.stringify(inner(d)[0])).not.toContain('dashes')
    expect(JSON.stringify(inner(d)[1])).not.toContain('fill')
  })

  test('the text is clipped to the inside of the border, with the box radius less the border', () => {
    const d = describeFreeText({ ...box, width: 2, cornerRadius: 6 }, context())
    expect(text(d).clip).toEqual({
      rect: { x: 102, y: 602, width: 140, height: 36 },
      radius: 4,
    })
  })

  test('the text starts inside the border and lines run from the first baseline', () => {
    const d = describeFreeText({ ...box, width: 2 }, context())
    const laid = layoutText(
      {
        text: 'Hello',
        font: { family: 'Helvetica', bold: false, italic: false },
        size: 12,
        width: 140,
        align: 'left',
      },
      standardMeasure
    ).lines[0]!
    expect(text(d).lines).toEqual([
      {
        text: 'Hello',
        origin: { x: 102, y: 638 - laid.baseline },
        width: laid.width,
        outside: false,
      },
    ])
  })

  test('Times and Courier boxes use those families', () => {
    for (const family of ['Times', 'Courier'] as const) {
      const d = describeFreeText(
        {
          ...box,
          defaultStyle: { ...box.defaultStyle, fontFamily: family, fontWeight: 'bold' },
        },
        context()
      )
      expect(text(d).font).toEqual({ family, bold: true, italic: false })
    }
  })

  test('an unknown family keeps its name on the annotation and maps in the drawing', () => {
    const a: FreeTextAnnotation = {
      ...box,
      defaultStyle: { ...box.defaultStyle, fontFamily: 'Georgia', fontStyle: 'italic' },
    }
    expect(text(describeFreeText(a, context())).font).toEqual({
      family: 'Times',
      bold: false,
      italic: true,
    })
    expect(a.defaultStyle.fontFamily).toBe('Georgia')
    expect(resolveFont('Consolas', false, false).family).toBe('Courier')
  })

  test('an underline is a rule on each line: 0.1 of the size below the baseline, 0.05 thick, as long as the line', () => {
    const d = describeFreeText(
      {
        ...box,
        contents: 'Hello world',
        defaultStyle: { ...box.defaultStyle, textDecoration: 'underline' },
      },
      context()
    )
    const [line] = text(d).lines
    const { from, to, thickness } = line!.underline!
    expect(thickness).toBeCloseTo(0.6)
    expect(from.x).toBeCloseTo(line!.origin.x)
    expect(to.x - from.x).toBeCloseTo(line!.width)
    expect(from.y).toBeCloseTo(line!.origin.y - 1.2)
    expect(to.y).toBe(from.y)
    expect(text(describeFreeText(box, context())).lines[0]!.underline).toBeUndefined()
  })

  test('an underline on a page turned 90 runs along the text, up the page', () => {
    const d = describeFreeText(
      {
        ...box,
        defaultStyle: { ...box.defaultStyle, textDecoration: 'underline' },
      },
      context(90)
    )
    const { from, to } = text(d).lines[0]!.underline!
    expect(to.x).toBeCloseTo(from.x)
    expect(to.y).toBeGreaterThan(from.y)
    // Below the baseline is further along x on a page turned 90.
    expect(from.x - text(d).lines[0]!.origin.x).toBeCloseTo(1.2)
  })

  test('a line carries whether it has a character outside the standard fonts', () => {
    const d = describeFreeText({ ...box, contents: 'Hello\nمرحبا\nA 你' }, context())
    expect(text(d).lines.map((l) => l.outside)).toEqual([false, true, true])
  })

  test('a line with a tab is not flagged for the tab', () => {
    const d = describeFreeText({ ...box, contents: 'a\tb' }, context())
    expect(text(d).lines[0]!.outside).toBe(false)
  })

  test("text on a page rotated 90 is laid out across the rect's height and turned upright", () => {
    const rect = { x: 100, y: 500, width: 144, height: 60 }
    const a: FreeTextAnnotation = {
      ...box,
      rect,
      contents: 'one two three four five six seven eight nine ten',
    }
    const upright = text(describeFreeText(a, context(0)))
    const turned = text(describeFreeText(a, context(90)))
    expect(turned.angle).toBe(90)
    expect(upright.angle).toBe(0)
    // Narrower, so more lines; each fits the 60 points across the displayed box.
    expect(turned.lines.length).toBeGreaterThan(upright.lines.length)
    for (const line of turned.lines) expect(line.width).toBeLessThanOrEqual(60 + 0.02)
    // The text runs up the page and the next line is further along x; every line starts at
    // the same y, the bottom edge of the rect.
    const [first, second] = turned.lines
    expect(first!.origin.y).toBeCloseTo(rect.y)
    expect(second!.origin.y).toBeCloseTo(rect.y)
    expect(second!.origin.x - first!.origin.x).toBeCloseTo(14.4)
    expect(first!.origin.x).toBeGreaterThan(rect.x)
    expect(first!.origin.x).toBeLessThan(rect.x + 12)
  })

  test('the four page rotations put the text frame on the box', () => {
    const rect = { x: 100, y: 600, width: 144, height: 40 }
    const at = (r: 0 | 90 | 180 | 270) => freeTextFrame({ ...box, rect }, r)
    expect(at(0)).toMatchObject({
      topLeft: { x: 100, y: 640 },
      width: 144,
      height: 40,
    })
    expect(at(90)).toMatchObject({ topLeft: { x: 100, y: 600 }, width: 40, height: 144 })
    expect(at(180)).toMatchObject({ topLeft: { x: 244, y: 600 }, width: 144, height: 40 })
    expect(at(270)).toMatchObject({ topLeft: { x: 244, y: 640 }, width: 40, height: 144 })
  })

  test('a box on a page whose box starts at (20, 30) keeps its user-space position', () => {
    const d = describeFreeText(
      { ...box, rect: { x: 220, y: 630, width: 144, height: 40 } },
      context(0, { x: 20, y: 30, width: 612, height: 792 })
    )
    expect(d.bounds).toEqual({ x: 220, y: 630, width: 144, height: 40 })
    expect(inner(d)[0]).toMatchObject({ rect: { x: 220, y: 630 } })
    expect(text(d).lines[0]!.origin.x).toBe(220)
    expect(text(d).lines[0]!.origin.y).toBeLessThan(670)
    expect(text(d).lines[0]!.origin.y).toBeGreaterThan(630)
  })

  test('the fringe insets the box, and the box is what the text is laid out in', () => {
    const d = describeFreeText(
      {
        ...box,
        rect: { x: 60, y: 560, width: 200, height: 70 },
        fringe: { left: 40, top: 5, right: 10, bottom: 45 },
        color: '#FFFFFF',
      },
      context()
    )
    expect(inner(d)[0]).toMatchObject({
      rect: { x: 100, y: 605, width: 150, height: 20 },
    })
    expect(text(d).lines[0]!.origin.x).toBe(100)
  })

  test('text outside the standard fonts is flagged', () => {
    expect(text(describeFreeText(box, context())).outsideStandardFonts).toBe(false)
    const cjk = describeFreeText({ ...box, contents: 'Hello 你好' }, context())
    expect(text(cjk).outsideStandardFonts).toBe(true)
  })

  test('justify gives each wrapped line its word spacing, the last line none', () => {
    const d = describeFreeText(
      {
        ...box,
        contents: 'one two three four five six seven eight nine ten eleven twelve',
        defaultStyle: { ...box.defaultStyle, textAlign: 'justify' },
      },
      context()
    )
    const lines = text(d).lines
    expect(lines.length).toBeGreaterThan(1)
    expect(lines[0]!.wordSpacing).toBeGreaterThan(0)
    expect(lines[lines.length - 1]!.wordSpacing).toBeUndefined()
  })

  test('a line with a tab carries its pieces at their own points', () => {
    const d = describeFreeText({ ...box, contents: 'a\tb' }, context())
    const [line] = text(d).lines
    expect(line!.segments).toHaveLength(2)
    expect(line!.segments![0]!.origin.x).toBe(100)
    expect(line!.segments![1]!.origin.x).toBeGreaterThan(100 + 12)
    expect(line!.segments![1]!.origin.y).toBe(line!.origin.y)
    expect(line!.segments!.map((s) => s.width)).toEqual([
      expect.closeTo(12 * 0.556, 6),
      expect.closeTo(12 * 0.556, 6),
    ])
    expect(line!.segments!.map((s) => s.outside)).toEqual([false, false])
  })

  test('blank lines have no line of their own but keep their room', () => {
    const lines = text(describeFreeText({ ...box, contents: 'a\n\nb' }, context())).lines
    expect(lines.map((l) => l.text)).toEqual(['a', 'b'])
    expect(lines[0]!.origin.y - lines[1]!.origin.y).toBeCloseTo(28.8)
  })

  test('an empty box draws its rect and no lines', () => {
    const d = describeFreeText({ ...box, contents: '', color: '#FFFFFF' }, context())
    expect(roles(d)).toEqual(['box', 'text'])
    expect(text(d).lines).toEqual([])
  })

  test('describeAnnotation describes free text', () => {
    expect(describeAnnotation(box, context())).toEqual(describeFreeText(box, context()))
  })
})

describe('a callout', () => {
  const callout: FreeTextAnnotation = {
    ...box,
    rect: { x: 60, y: 560, width: 200, height: 70 },
    fringe: { left: 40, top: 5, right: 10, bottom: 45 },
    intent: 'FreeTextCallout',
    callout: [
      { x: 70, y: 565 },
      { x: 90, y: 600 },
      { x: 100, y: 612 },
    ],
    head: 'OpenArrow',
    width: 1,
    dashes: [3, 1],
  }

  test('the bounds hold a head that sticks out of the rect', () => {
    const sideways: FreeTextAnnotation = {
      ...callout,
      rect: { x: 100, y: 600, width: 100, height: 40 },
      fringe: undefined,
      // A vertical leader left of the box, pointing up: only the head's wings reach further left.
      callout: [
        { x: 50, y: 610 },
        { x: 50, y: 560 },
      ],
      width: 2,
      dashes: undefined,
    }
    const without = describeFreeText({ ...sideways, head: undefined }, context()).bounds
    const out = describeFreeText({ ...sideways, head: 'OpenArrow' }, context()).bounds
    // The leader's stroke is 2 pt wide on x = 50, so it reaches x = 49. The head's wings are 3
    // either side of the line, and half the stroke (1) beyond that.
    expect(without.x).toBeCloseTo(49, 6)
    expect(out.x).toBeCloseTo(46, 6)
    expect(out.x + out.width).toBeCloseTo(without.x + without.width, 6)
  })

  test('adds its leader and head, below the box', () => {
    const d = describeFreeText(callout, context())
    expect(roles(d)).toEqual(['callout-line', 'ending-head', 'box', 'border', 'text'])
    expect(inner(d)[0]).toEqual({
      kind: 'polyline',
      role: 'callout-line',
      points: callout.callout,
      paint: {
        stroke: {
          color: '#151820',
          width: 1,
          dashes: [3, 1],
          join: 'round',
          cap: 'butt',
        },
      },
    })
    const head = inner(d)[1]!
    expect(head).toMatchObject({ kind: 'path', role: 'ending-head' })
  })

  test('the leader is 1 pt when the box has no border, and has no head when none is set', () => {
    const d = describeFreeText({ ...callout, width: 0, head: undefined }, context())
    expect(roles(d)).toEqual(['callout-line', 'box', 'text'])
    expect(inner(d)[0]).toMatchObject({ paint: { stroke: { width: 1 } } })
  })

  test('a callout with no intent stays a plain box', () => {
    expect(roles(describeFreeText({ ...callout, intent: undefined }, context()))).toEqual(
      ['box', 'border', 'text']
    )
  })
})

describe('a speech bubble', () => {
  const bubble: FreeTextAnnotation = {
    ...box,
    rect: { x: 100, y: 300, width: 120, height: 60 },
    intent: 'FreeTextCallout',
    cornerRadius: 8,
    width: 1,
    callout: [
      { x: 106, y: 276 },
      { x: 130, y: 300 },
    ],
  }

  const path = (d: Drawing) => {
    const item = inner(d)[0]
    if (item?.kind !== 'path') throw new Error('expected a path')
    return item
  }

  test('the outline is centred on the box edge, so the bounds hold half of it outside', () => {
    const d = describeFreeText(
      {
        ...bubble,
        width: 4,
        callout: [
          { x: 140, y: 310 },
          { x: 130, y: 300 },
        ],
      },
      context()
    )
    expect(d.bounds).toEqual({ x: 98, y: 298, width: 124, height: 64 })
  })

  test('is one path with rounded corners and a tail to the tip, then the text', () => {
    const d = describeFreeText(bubble, context())
    expect(roles(d)).toEqual(['bubble', 'text'])
    const commands = path(d).commands
    expect(commands.filter((c) => c.op === 'A')).toHaveLength(4)
    expect(commands.some((c) => c.op === 'L' && c.to.x === 106 && c.to.y === 276)).toBe(
      true
    )
    expect(commands[commands.length - 1]).toEqual({ op: 'Z' })
    expect(path(d).paint).toEqual({
      stroke: { color: '#151820', width: 1, join: 'round' },
    })
  })

  test('the wedge leaves the bottom edge at the last point, 8 points either side', () => {
    const d = describeFreeText(bubble, context())
    const lines = path(d).commands.filter((c) => c.op === 'L')
    // The bottom edge is y 300 in user space. The last point is x 130, so the wedge is 122..138.
    const onEdge = lines.filter((c) => c.op === 'L' && c.to.y === 300)
    expect(onEdge.map((c) => c.op === 'L' && c.to.x)).toEqual([138, 122, 108])
  })

  test('the wedge is kept clear of the corner', () => {
    const near = describeFreeText(
      {
        ...bubble,
        callout: [
          { x: 90, y: 276 },
          { x: 101, y: 300 },
        ],
      },
      context()
    )
    const onEdge = path(near).commands.filter((c) => c.op === 'L' && c.to.y === 300)
    // Radius 8 plus half the wedge 8: the wedge's near side starts 16 points in.
    expect(onEdge.map((c) => c.op === 'L' && c.to.x)).toEqual([124, 108, 108])
  })

  test('the tip on a side edge leaves from that edge', () => {
    const left = describeFreeText(
      {
        ...bubble,
        callout: [
          { x: 80, y: 330 },
          { x: 100, y: 330 },
        ],
      },
      context()
    )
    const edge = path(left).commands.filter((c) => c.op === 'L' && c.to.x === 100)
    expect(edge.length).toBeGreaterThanOrEqual(2)
  })

  test('a corner radius of 0 draws no arcs', () => {
    const d = describeFreeText({ ...bubble, cornerRadius: 0 }, context())
    expect(path(d).commands.filter((c) => c.op === 'A')).toHaveLength(0)
  })

  test('fill and a dashed border apply to the path; no border strokes nothing', () => {
    const d = describeFreeText(
      { ...bubble, color: '#FFFF00', borderColor: '#FF0000', width: 2, dashes: [3, 3] },
      context()
    )
    expect(path(d).paint).toEqual({
      fill: { color: '#FFFF00' },
      stroke: { color: '#FF0000', width: 2, dashes: [3, 3], join: 'round' },
    })
    expect(path(describeFreeText({ ...bubble, width: 0 }, context())).paint).toEqual({})
  })

  test('the text has padding of 0.4 by 0.6 of its size and is clipped to the whole box', () => {
    const d = describeFreeText({ ...bubble, contents: 'Hi' }, context())
    const t = text(d)
    expect(t.clip).toEqual({ rect: { x: 100, y: 300, width: 120, height: 60 } })
    // Left padding 0.6 * 12 = 7.2 points.
    expect(t.lines[0]!.origin.x).toBeCloseTo(107.2)
    const laid = layoutText(
      {
        text: 'Hi',
        font: t.font,
        size: 12,
        width: 120 - 14.4,
        align: 'left',
      },
      standardMeasure
    ).lines[0]!
    // Top padding 0.4 * 12 = 4.8 points, then the first baseline.
    expect(t.lines[0]!.origin.y).toBeCloseTo(360 - 4.8 - laid.baseline)
  })

  test('a bubble on a page turned 90 keeps its outline in user space', () => {
    const upright = path(describeFreeText(bubble, context(0))).commands
    const turned = path(describeFreeText(bubble, context(90))).commands
    expect(turned).toEqual(upright)
  })
})

describe('freeTextTextHeight', () => {
  test("is the stack of the drawing's lines, 1.2 times the size each", () => {
    const long = { ...box, contents: 'one two three four five six seven eight nine ten' }
    const n = text(describeFreeText(long, context())).lines.length
    expect(n).toBeGreaterThan(1)
    expect(freeTextTextHeight(long, context())).toBeCloseTo(n * 1.2 * 12, 9)
  })

  test("takes the contents it is given in place of the annotation's", () => {
    expect(freeTextTextHeight(box, context(), 'a\nb\nc')).toBeCloseTo(3 * 14.4, 9)
  })
})
