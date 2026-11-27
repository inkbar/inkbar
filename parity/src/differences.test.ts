import { describe, expect, it } from 'vitest'

import {
  dataDifferences,
  describePixels,
  differenceImage,
  pixelDifference,
} from './differences'

/** Node has no `ImageData`: the functions read only these three fields. */
function image(width: number, height: number, grey = 255) {
  const data = new Uint8ClampedArray(width * height * 4).fill(grey)
  return { width, height, data, colorSpace: 'srgb' } as ImageData
}

const copy = (img: ImageData) =>
  ({ ...img, data: new Uint8ClampedArray(img.data) }) as ImageData

describe('dataDifferences', () => {
  it('finds equal data the same', () => {
    expect(dataDifferences({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] })).toEqual([])
  })

  it('names each value that differs by its path', () => {
    expect(
      dataDifferences(
        [{ page: 1, links: [{ rect: { x: 72, y: 10 } }] }],
        [{ page: 1, links: [{ rect: { x: 73, y: 10 } }] }]
      )
    ).toEqual(['[0].links[0].rect.x: was 72, now 73'])
  })

  it('names a key that is new or gone', () => {
    expect(dataDifferences({ a: 1 }, { b: 2 })).toEqual([
      'a: was 1, now none',
      'b: was none, now 2',
    ])
  })

  it('names what a list gained or lost', () => {
    expect(dataDifferences({ l: [1, 2] }, { l: [1, 2, 3] })).toEqual([
      'l: 2 entries, now 3: now also 3',
    ])
    expect(dataDifferences({ l: [1, 2] }, { l: [1] })).toEqual([
      'l: 2 entries, now 1: no longer 2',
    ])
  })

  it('shows a long string from where it first differs', () => {
    const was = 'a'.repeat(100) + 'b'
    const now = 'a'.repeat(100) + 'c'
    expect(dataDifferences({ text: was }, { text: now })).toEqual([
      'text from character 100: was "b", now "c"',
    ])
  })

  it('names at most twenty differences, then how many more', () => {
    const lines = dataDifferences(
      [...Array(30).keys()],
      [...Array(30).keys()].map((n) => n + 1)
    )
    expect(lines).toHaveLength(21)
    expect(lines.at(-1)).toBe('and 10 more')
  })
})

describe('pixelDifference', () => {
  it('finds identical images the same', () => {
    expect(pixelDifference(image(8, 8), image(8, 8))).toEqual({ count: 0 })
  })

  it('finds one channel of one pixel one level apart', () => {
    const b = image(8, 8)
    b.data[(3 * 8 + 5) * 4 + 2] = 254
    expect(pixelDifference(image(8, 8), b)).toEqual({
      count: 1,
      box: { x: 5, y: 3, width: 1, height: 1 },
    })
  })

  it('boxes every differing pixel', () => {
    const b = image(8, 8)
    b.data[(1 * 8 + 1) * 4] = 0
    b.data[(6 * 8 + 4) * 4 + 3] = 0
    const d = pixelDifference(image(8, 8), b)
    expect(d).toEqual({ count: 2, box: { x: 1, y: 1, width: 4, height: 6 } })
    expect(describePixels(d)).toBe('2 pixels differ, within 4 × 6 px at (1, 1)')
  })

  it('throws on images of different sizes', () => {
    expect(() => pixelDifference(image(8, 8), image(8, 9))).toThrow('differ in size')
  })
})

describe('differenceImage', () => {
  it('marks differing pixels red over a faded copy of the first image', () => {
    const a = image(2, 1, 0)
    const b = copy(a)
    b.data[4] = 9
    expect([...differenceImage(a, b).data]).toEqual([191, 191, 191, 255, 255, 0, 0, 255])
  })
})
