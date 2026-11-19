import { describe, expect, it } from 'vitest'

import { compare, differenceImage, MAX_BLOCK, MAX_SHARE } from './compare'

/** Node has no `ImageData`: `compare` reads only these three fields. */
function image(
  width: number,
  height: number,
  rgb: [number, number, number] = [255, 255, 255]
) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0]
    data[i + 1] = rgb[1]
    data[i + 2] = rgb[2]
    data[i + 3] = 255
  }
  return { width, height, data, colorSpace: 'srgb' } as ImageData
}

function fill(
  img: ImageData,
  x: number,
  y: number,
  w: number,
  h: number,
  rgb: [number, number, number]
) {
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      const i = (row * img.width + col) * 4
      img.data[i] = rgb[0]
      img.data[i + 1] = rgb[1]
      img.data[i + 2] = rgb[2]
    }
  }
}

const copy = (img: ImageData) =>
  ({ ...img, data: new Uint8ClampedArray(img.data) }) as ImageData

const BLACK: [number, number, number] = [0, 0, 0]

/** Lines of glyph-like strokes: 2 px wide, 24 px tall, on a white 600 × 400 page. */
function textPage(): ImageData {
  const img = image(600, 400)
  for (let line = 0; line < 8; line++) {
    for (let glyph = 0; glyph < 60; glyph++) {
      fill(img, 40 + glyph * 9, 30 + line * 44, 2, 24, BLACK)
      fill(img, 40 + glyph * 9, 30 + line * 44, 6, 2, BLACK)
    }
  }
  return img
}

/**
 * `img` with every stroke's edge drawn as antialiasing half a pixel over would: the white pixel
 * left of each stroke and the black pixel at its right edge each move 40 grey levels.
 */
function shiftedHalfPixel(img: ImageData): ImageData {
  const out = copy(img)
  const at = (x: number, y: number) => img.data[(y * img.width + x) * 4]!
  for (let y = 0; y < img.height; y++) {
    for (let x = 1; x < img.width - 1; x++) {
      const i = (y * img.width + x) * 4
      let v: number | undefined
      if (at(x, y) === 255 && at(x + 1, y) === 0) v = 255 - 40
      else if (at(x, y) === 0 && at(x + 1, y) === 255) v = 40
      if (v !== undefined) out.data[i] = out.data[i + 1] = out.data[i + 2] = v
    }
  }
  return out
}

describe('compare', () => {
  it('finds identical images the same', () => {
    const a = textPage()
    const result = compare(a, copy(a))
    expect(result).toEqual({ share: 0, worstBlock: 0, same: true })
  })

  it('finds text whose antialiasing moved by half a pixel the same', () => {
    const a = textPage()
    const result = compare(a, shiftedHalfPixel(a))
    expect(result.same).toBe(true)
  })

  it('finds one missing 20 × 20 glyph box', () => {
    const a = image(400, 400)
    fill(a, 100, 100, 20, 20, BLACK)
    const result = compare(a, image(400, 400))
    expect(result.worstBlock).toBeGreaterThan(MAX_BLOCK)
    expect(result.worstBlock).toBeGreaterThan(0.5)
    expect(result.same).toBe(false)
  })

  it('finds one missing letter of 12 pt text at 2 px per point', () => {
    // An H 17 px tall with 2 px stems, as Helvetica's cap height and stem are at that size, set
    // across the corner of four 16 × 16 blocks as a glyph falls anywhere on a page.
    const a = image(600, 400)
    fill(a, 314, 376, 2, 17, BLACK)
    fill(a, 323, 376, 2, 17, BLACK)
    fill(a, 314, 384, 11, 2, BLACK)
    const b = image(600, 400)
    expect(compare(a, b).same).toBe(false)
  })

  it('finds a missing 1 pt rule, 2 px wide at 2 px per point', () => {
    const a = image(400, 400)
    fill(a, 20, 200, 360, 2, BLACK)
    expect(compare(a, image(400, 400)).same).toBe(false)
  })

  it('finds a missing 200 × 100 image area', () => {
    const a = textPage()
    const b = copy(a)
    for (let y = 150; y < 250; y++) {
      for (let x = 200; x < 400; x++) {
        const v = (x * 7 + y * 3) % 256
        fill(a, x, y, 1, 1, [v, 255 - v, (v * 2) % 256])
      }
    }
    const result = compare(a, b)
    expect(result.share).toBeGreaterThan(MAX_SHARE)
    expect(result.same).toBe(false)
  })

  it('finds a fill colour changed over a tenth of the page', () => {
    const a = image(400, 400)
    const b = image(400, 400)
    fill(a, 0, 0, 400, 40, [0x33, 0x66, 0x99])
    fill(b, 0, 0, 400, 40, [0x99, 0x66, 0x33])
    const result = compare(a, b)
    expect(result.share).toBeGreaterThan(0.09)
    expect(result.same).toBe(false)
  })

  it('finds a page filled with one flat colour against a white page', () => {
    // As a shading painted over the whole page would be: no edge anywhere, every pixel apart.
    for (const rgb of [
      [128, 128, 128],
      [0x33, 0x66, 0x99],
      [255, 255, 200],
    ] as [number, number, number][]) {
      const result = compare(image(300, 400, rgb), image(300, 400))
      expect(result.share).toBe(1)
      expect(result.same).toBe(false)
    }
  })

  it('throws on images of different sizes', () => {
    expect(() => compare(image(10, 10), image(10, 11))).toThrow(/size/)
  })

  it('measures each 16 × 16 block, a part block at the edge by its own size', () => {
    // A 20 × 20 image: the block at x 16 to 20 is 4 px wide. Changing it all fills that block.
    const a = image(20, 20)
    const b = image(20, 20)
    fill(b, 16, 0, 4, 16, BLACK)
    const result = compare(a, b)
    expect(result.worstBlock).toBeGreaterThanOrEqual(0.99)
  })
})

describe('differenceImage', () => {
  it('marks differing pixels red over a grey copy of the first image', () => {
    const a = image(40, 40)
    const b = copy(a)
    fill(b, 10, 10, 10, 10, BLACK)
    const diff = differenceImage(a, b)
    expect([diff.width, diff.height]).toEqual([40, 40])
    const px = (x: number, y: number) => [
      ...diff.data.slice((y * 40 + x) * 4, (y * 40 + x) * 4 + 4),
    ]
    expect(px(15, 15)).toEqual([255, 0, 0, 255])
    const [r, g, bl] = px(35, 35)
    expect(r).toBe(g)
    expect(g).toBe(bl)
  })
})
