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

describe('mergeLineRects ordering and columns', () => {
  it('orders overlapping lines by vertical centre, not by lower edge', () => {
    // The tall upper line reaches lower than the short line below it.
    const tall = { x: 0, y: 90, width: 50, height: 40 } // centre 110, bottom 90
    const short = { x: 0, y: 95, width: 50, height: 6 } // centre 98, bottom 95
    const quads = mergeLineRects([short, tall])
    expect(quads.map((q) => q.p3.y)).toEqual([90, 95])
  })

  it('keeps two columns on one line apart', () => {
    const quads = mergeLineRects([
      { x: 72, y: 700, width: 100, height: 12 },
      { x: 175, y: 700, width: 80, height: 12 }, // a word gap: same run
      { x: 320, y: 700, width: 120, height: 12 }, // across a 65pt gutter: new run
    ])
    expect(quads).toHaveLength(2)
    expect([quads[0]!.p1.x, quads[0]!.p2.x]).toEqual([72, 255])
    expect([quads[1]!.p1.x, quads[1]!.p2.x]).toEqual([320, 440])
  })

  it('honours an explicit gap', () => {
    const rects = [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 30, y: 0, width: 10, height: 10 },
    ]
    expect(mergeLineRects(rects)).toHaveLength(2)
    expect(mergeLineRects(rects, 2, 25)).toHaveLength(1)
  })
})
