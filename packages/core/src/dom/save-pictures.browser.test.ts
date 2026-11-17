import { describe, expect, it } from 'vitest'

import { standardMeasure } from '../model/annotations/drawing/text/measure'

import {
  canvasTextPicture,
  canvasToPng,
  PICTURE_SCALE,
  savePictures,
} from './save-pictures'
import { checkTextFonts } from './text-font-check'

import type { TextFont } from '../model/annotations/drawing/types'

const helvetica: TextFont = { family: 'Helvetica', bold: false, italic: false }

/** The PNG's pixels on a canvas, with its size. */
async function decode(png: Uint8Array): Promise<ImageData> {
  const bitmap = await createImageBitmap(
    new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' })
  )
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

const inked = (image: ImageData): number => {
  let n = 0
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i]! > 0) n++
  return n
}

/** The column span of the pixels with any ink, or undefined for none. */
function inkColumns(image: ImageData): { from: number; to: number } | undefined {
  let from = Infinity
  let to = -Infinity
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++)
      if (image.data[(y * image.width + x) * 4 + 3]! > 0) {
        from = Math.min(from, x)
        to = Math.max(to, x)
      }
  return from <= to ? { from, to } : undefined
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

describe('canvasTextPicture', () => {
  const fonts = checkTextFonts(['日本語'])
  const hasHan = !fonts.differing.has('han')

  it('pictures 日本語 at four pixels a point, on a transparent ground', async () => {
    const picture = canvasTextPicture(document)
    const { png, width, ascent, descent } = await picture({
      text: '日本語',
      font: helvetica,
      size: 12,
      color: '#000000',
    })
    expect([...png.subarray(0, 4)]).toEqual(PNG_MAGIC)
    expect(PICTURE_SCALE).toBe(4)
    expect(width).toBeGreaterThan(0)
    expect(ascent).toBeGreaterThan(0)
    expect(descent).toBeGreaterThan(0)
    const image = await decode(png)
    expect([image.width, image.height]).toEqual([
      Math.ceil(width * 4),
      Math.ceil((ascent + descent) * 4),
    ])
    expect(image.data[3]).toBe(0)
    // Where no font draws them (see `checkTextFonts`), only the size is checked.
    if (hasHan) {
      // Three ideographs of about an em each.
      expect(width).toBeGreaterThan(30)
      expect(width).toBeLessThan(42)
      expect(inked(image)).toBeGreaterThan(200)
    }
  })

  it('reaches no further than the family’s line box above and below for Latin text', async () => {
    const { ascent, descent } = await canvasTextPicture(document)({
      text: 'Hxg',
      font: helvetica,
      size: 10,
      color: '#ff0000',
    })
    const v = standardMeasure.vertical(helvetica)
    expect(ascent).toBeCloseTo(v.ascent * 10, 1)
    expect(descent).toBeCloseTo(v.descent * 10, 1)
  })

  it('draws in the colour asked for', async () => {
    const { png } = await canvasTextPicture(document)({
      text: 'Ж',
      font: helvetica,
      size: 20,
      color: '#ff0000',
    })
    const image = await decode(png)
    let reddest = 0
    for (let i = 0; i < image.data.length; i += 4)
      if (image.data[i + 3] === 255 && image.data[i + 1] === 0 && image.data[i + 2] === 0)
        reddest = Math.max(reddest, image.data[i]!)
    expect(reddest).toBe(255)
  })

  it('adds the word spacing to each U+0020 and none to U+00A0, and counts it in the width', async () => {
    const picture = canvasTextPicture(document)
    const request = { font: helvetica, size: 10, color: '#000000' }
    const plain = await picture({ ...request, text: 'Ж Ж Ж' })
    const spaced = await picture({ ...request, text: 'Ж Ж Ж', wordSpacing: 5 })
    expect(spaced.width).toBeCloseTo(plain.width + 5, 2)
    const a = inkColumns(await decode(plain.png))!
    const b = inkColumns(await decode(spaced.png))!
    // The last letter moved by the one space's spacing, at four pixels a point.
    expect(b.to - a.to).toBeGreaterThanOrEqual(19)
    expect(b.to - a.to).toBeLessThanOrEqual(21)
  })

  it('is the same size whatever the device pixel ratio', async () => {
    const request = { text: 'Ж', font: helvetica, size: 10, color: '#000000' }
    const before = await decode((await canvasTextPicture(document)(request)).png)
    const ratio = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio')
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true })
    try {
      const after = await decode((await canvasTextPicture(document)(request)).png)
      expect([after.width, after.height]).toEqual([before.width, before.height])
    } finally {
      if (ratio) Object.defineProperty(window, 'devicePixelRatio', ratio)
      else delete (window as { devicePixelRatio?: number }).devicePixelRatio
    }
  })
})

describe('canvasToPng', () => {
  it('turns an SVG data URL into a PNG of the size asked', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#00f"/></svg>'
    const png = await canvasToPng(document)(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      37,
      21
    )
    expect([...png.subarray(0, 4)]).toEqual(PNG_MAGIC)
    const image = await decode(png)
    expect([image.width, image.height]).toEqual([37, 21])
    // Stretched over the whole picture: the far corner is blue too.
    const last = image.data.length - 4
    expect([...image.data.subarray(last, last + 4)]).toEqual([0, 0, 255, 255])
  })

  it('turns a WebP data URL into a PNG', async () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 8
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#00ff00'
    ctx.fillRect(0, 0, 8, 8)
    const webp = canvas.toDataURL('image/webp')
    expect(webp.startsWith('data:image/webp')).toBe(true)
    const image = await decode(await canvasToPng(document)(webp, 16, 4))
    expect([image.width, image.height]).toEqual([16, 4])
    expect(image.data[1]).toBeGreaterThan(240)
  })

  it('rejects an image that does not load', async () => {
    await expect(
      canvasToPng(document)('data:image/gif;base64,AAAA', 4, 4)
    ).rejects.toThrow()
  })
})

describe('savePictures', () => {
  it('gives both helpers', () => {
    const pictures = savePictures(document)
    expect(typeof pictures.textPicture).toBe('function')
    expect(typeof pictures.toPng).toBe('function')
  })
})
