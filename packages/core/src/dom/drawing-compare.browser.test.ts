import { describe, expect, it } from 'vitest'

import { comparePaint, type CompareCase } from './drawing-compare'
import { renderReferenceContent } from './reference-render'

const quads = [
  {
    p1: { x: 72, y: 715 },
    p2: { x: 300, y: 715 },
    p3: { x: 72, y: 695 },
    p4: { x: 300, y: 695 },
  },
]
const highlight: CompareCase = {
  name: 'highlight',
  annotation: {
    type: 'highlight',
    page: 0,
    rect: { x: 72, y: 695, width: 228, height: 20 },
    quads,
  },
}

describe('comparePaint', () => {
  it('reports no difference for a type both sides still draw with the reference renderer', async () => {
    const r = await comparePaint(highlight)
    expect(r.referenceInk).toBeGreaterThan(0)
    expect(r.differingPixels).toBe(0)
    expect(r.differing).toBe(0)
    expect(r.referenceBox.width).toBe(612)
    expect(r.paintedBox.width).toBe(612)
    expect(r.paintedBox.height).toBe(r.referenceBox.height)
  })

  it('sees the same highlight in a different colour', async () => {
    const r = await comparePaint(
      { ...highlight, annotation: { ...highlight.annotation, color: '#ff0000' } },
      (el, a, t) => renderReferenceContent(el, { ...a, color: '#0000ff' }, t)
    )
    expect(r.differing).toBeGreaterThan(0.5)
  })

  it('sees a highlight against an empty layer', async () => {
    const r = await comparePaint(highlight, (el) => el.replaceChildren())
    expect(r.differing).toBe(1)
    expect(r.differingPixels).toBe(r.referenceInk)
  })

  it('captures the whole page at zoom 2 and 4, beyond the test viewport', async () => {
    for (const zoom of [2, 4] as const) {
      const r = await comparePaint({ ...highlight, zoom })
      expect(r.referenceBox.width).toBe(612 * zoom)
      expect(r.differing).toBe(0)
    }
  })

  it('refuses a reference image with nothing in it', async () => {
    await expect(
      comparePaint(highlight, undefined, (el) => el.replaceChildren())
    ).rejects.toThrow(/blank/)
  })

  it('reports no difference for a stamp, whose image loads late', async () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 20
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#c00'
    ctx.fillRect(0, 0, 20, 20)
    const r = await comparePaint({
      name: 'stamp',
      annotation: {
        type: 'stamp',
        page: 0,
        rect: { x: 100, y: 600, width: 80, height: 40 },
        imagedata: canvas.toDataURL('image/png'),
      },
    })
    expect(r.referenceInk).toBeGreaterThan(0)
    expect(r.differing).toBe(0)
  })
})
