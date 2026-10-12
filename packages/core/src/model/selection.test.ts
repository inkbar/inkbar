import { describe, expect, it } from 'vitest'

import { mergeLineRects } from './selection'

describe('mergeLineRects', () => {
  it('merges boxes on one line and keeps separate lines apart', () => {
    const quads = mergeLineRects([
      { x: 72, y: 695, width: 50, height: 20 },
      { x: 122, y: 695.5, width: 60, height: 19 },
      { x: 72, y: 671, width: 100, height: 20 },
    ])
    expect(quads).toHaveLength(2)
    expect(quads[0]).toEqual({
      p1: { x: 72, y: 715 },
      p2: { x: 182, y: 715 },
      p3: { x: 72, y: 695 },
      p4: { x: 182, y: 695 },
    })
    expect(quads[1]!.p3).toEqual({ x: 72, y: 671 })
  })

  it('drops empty boxes', () => {
    expect(mergeLineRects([{ x: 0, y: 0, width: 0, height: 10 }])).toEqual([])
  })

  it('orders lines top to bottom regardless of input order', () => {
    const quads = mergeLineRects([
      { x: 72, y: 600, width: 10, height: 10 },
      { x: 72, y: 700, width: 10, height: 10 },
    ])
    expect(quads.map((q) => q.p3.y)).toEqual([700, 600])
  })

  it('honours the tolerance', () => {
    const rects = [
      { x: 0, y: 100, width: 10, height: 10 },
      { x: 10, y: 103, width: 10, height: 10 },
    ]
    expect(mergeLineRects(rects)).toHaveLength(2)
    expect(mergeLineRects(rects, 4)).toHaveLength(1)
  })
})
