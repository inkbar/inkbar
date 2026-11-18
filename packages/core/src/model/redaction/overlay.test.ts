import { describe, expect, test } from 'vitest'

import { staticDefaults } from '../annotations/defaults'
import { standardMeasure } from '../annotations/drawing/text/measure'
import { quadFromRect } from '../geometry'

import { redactionOverlay } from './overlay'

import type { Drawing } from '../annotations/drawing/types'
import type { Annotation } from '../annotations/types'
import type { Rect } from '../geometry'

const redact = (
  rect: Rect,
  extra: { interiorColor?: string; overlayText?: string } = {}
): Annotation => ({
  id: 'm',
  page: 0,
  type: 'redact',
  color: '#C0392B',
  opacity: 1,
  createdAt: '2026-11-18T12:00:00.000Z',
  modifiedAt: '2026-11-18T12:00:00.000Z',
  source: 'session',
  rect,
  interiorColor: '#000000',
  ...extra,
})

const textOf = (d: Drawing) => {
  const item = d.items.find((i) => i.kind === 'text')
  if (item?.kind !== 'text') throw new Error('no text')
  return item
}

describe('redactionOverlay', () => {
  test("fills with the mark's colour, opaque, with no outline", () => {
    const d = redactionOverlay(
      redact({ x: 10, y: 20, width: 100, height: 20 }, { interiorColor: '#336699' })
    )
    expect(d.items).toEqual([
      {
        kind: 'rect',
        rect: { x: 10, y: 20, width: 100, height: 20 },
        paint: { fill: { color: '#336699', opacity: 1 } },
      },
    ])
    expect(d.bounds).toEqual({ x: 10, y: 20, width: 100, height: 20 })
  })

  test('draws white text on a dark fill and black on a light one', () => {
    const rect = { x: 0, y: 0, width: 200, height: 30 }
    const dark = redactionOverlay(
      redact(rect, { interiorColor: '#000000', overlayText: 'REDACTED' })
    )
    const light = redactionOverlay(
      redact(rect, { interiorColor: '#FFFF00', overlayText: 'REDACTED' })
    )
    expect(textOf(dark).color).toBe('#FFFFFF')
    expect(textOf(light).color).toBe('#000000')
    expect(textOf(dark).font.family).toBe('Helvetica')
  })

  test('fits the text in the box', () => {
    const font = { family: 'Helvetica', bold: false, italic: false } as const
    const wide = { x: 100, y: 100, width: 120, height: 40 }
    const text = 'CONFIDENTIAL INFORMATION'
    const t = textOf(redactionOverlay(redact(wide, { overlayText: text })))
    const fitted = standardMeasure.width(text, font, t.size).width
    expect(t.size).toBeGreaterThanOrEqual(4)
    expect(t.size).toBeLessThanOrEqual(24)
    expect(fitted).toBeLessThanOrEqual(wide.width)
    expect(standardMeasure.width(text, font, t.size + 1).width).toBeGreaterThan(
      wide.width
    )
    // Centred across the box.
    const line = t.lines[0]!
    expect(line.origin.x + line.width / 2).toBeCloseTo(160)

    // A short word in a big box stops at 24; a tall word in a thin box is limited by height.
    const big = textOf(
      redactionOverlay(
        redact({ x: 0, y: 0, width: 400, height: 100 }, { overlayText: 'Hi' })
      )
    )
    expect(big.size).toBe(24)
    const thin = textOf(
      redactionOverlay(
        redact({ x: 0, y: 0, width: 400, height: 10 }, { overlayText: 'Hi' })
      )
    )
    expect(thin.size).toBe(8)
    const tiny = textOf(
      redactionOverlay(
        redact({ x: 0, y: 0, width: 10, height: 10 }, { overlayText: 'Long text' })
      )
    )
    expect(tiny.size).toBe(4)
  })

  test('fills each quad of a text mark and centres the text in its box', () => {
    const top = quadFromRect({ x: 10, y: 30, width: 80, height: 10 })
    const bottom = quadFromRect({ x: 10, y: 10, width: 50, height: 10 })
    const d = redactionOverlay({
      ...redact({ x: 10, y: 10, width: 80, height: 30 }, { overlayText: 'Hi' }),
      quads: [top, bottom],
    } as Annotation)
    const [a, b] = d.items
    expect(a).toMatchObject({
      kind: 'polygon',
      points: [top.p1, top.p2, top.p4, top.p3],
      paint: { fill: { color: '#000000', opacity: 1 } },
    })
    expect(b).toMatchObject({
      kind: 'polygon',
      points: [bottom.p1, bottom.p2, bottom.p4, bottom.p3],
    })
    expect(d.bounds).toEqual({ x: 10, y: 10, width: 80, height: 30 })
    const line = textOf(d).lines[0]!
    expect(line.origin.x + line.width / 2).toBeCloseTo(50)
  })

  test('falls back to the default fill when the colour is empty', () => {
    const d = redactionOverlay(
      redact({ x: 0, y: 0, width: 10, height: 10 }, { interiorColor: '' })
    )
    expect(d.items[0]).toMatchObject({
      paint: { fill: { color: staticDefaults.fill(), opacity: 1 } },
    })
  })

  test('throws on an annotation that is not a redaction', () => {
    const h = {
      ...redact({ x: 0, y: 0, width: 10, height: 10 }),
      type: 'square',
    } as unknown as Annotation
    expect(() => redactionOverlay(h)).toThrow(TypeError)
  })
})
