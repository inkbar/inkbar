// The pictures the PDF painter asks for when it writes a drawing into a file in a browser: a run
// of text no standard font can set, drawn as the overlay draws it, and an image the file cannot
// hold as it is, as PNG. Both draw on a canvas of their own, whose size depends only on what is
// drawn: never on the device pixel ratio or the page's zoom.
import { standardMeasure } from '../model/annotations/drawing/text/measure'

import { browserMeasure } from './drawing-context'
import { cssFont } from './text-fonts'

import type { TextPicture, ToPng } from '../model/annotations/drawing/pdf/paint'
import type { TextMeasure } from '../model/annotations/drawing/types'

/** Pixels per point in a picture. */
export const PICTURE_SCALE = 4

/** The canvas as PNG bytes. */
function pngOf(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('The canvas gave no PNG'))
        return
      }
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject)
    }, 'image/png')
  })
}

/**
 * Pictures a run of text in the overlay's font stack for its family, at `PICTURE_SCALE` pixels
 * a point, on a transparent ground: the same glyphs the screen draws, from the run's origin on
 * its baseline. A run with word spacing is set word by word, each U+0020 widened by it, as the
 * screen widens it; a U+00A0 is not. The picture reaches the family's line box above and below
 * the baseline, further where a glyph does (a fallback font's ideograph, an emoji).
 */
export function canvasTextPicture(doc: Document): TextPicture {
  return async ({ text, font, size, color, wordSpacing = 0 }) => {
    const canvas = doc.createElement('canvas')
    const setUp = (ctx: CanvasRenderingContext2D): void => {
      ctx.font = cssFont(font, size * PICTURE_SCALE)
      ctx.fontKerning = 'none'
      ctx.textBaseline = 'alphabetic'
      ctx.textAlign = 'left'
      ctx.direction = 'ltr'
    }
    let ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2D canvas to picture text on')
    setUp(ctx)
    const words = wordSpacing !== 0 ? text.split(' ') : [text]
    const space = ctx.measureText(' ').width + wordSpacing * PICTURE_SCALE
    const widths = words.map((w) => ctx!.measureText(w).width)
    const advance = widths.reduce((sum, w) => sum + w, 0) + (words.length - 1) * space
    const ink = ctx.measureText(text)
    const line = standardMeasure.vertical(font)
    const ascent = Math.max(
      line.ascent * size,
      ink.actualBoundingBoxAscent / PICTURE_SCALE
    )
    const descent = Math.max(
      line.descent * size,
      ink.actualBoundingBoxDescent / PICTURE_SCALE
    )
    const width = advance / PICTURE_SCALE
    canvas.width = Math.max(1, Math.ceil(width * PICTURE_SCALE))
    canvas.height = Math.max(1, Math.ceil((ascent + descent) * PICTURE_SCALE))
    // Sizing the canvas resets its state.
    ctx = canvas.getContext('2d')!
    setUp(ctx)
    ctx.fillStyle = color
    let x = 0
    words.forEach((word, i) => {
      ctx.fillText(word, x, ascent * PICTURE_SCALE)
      x += widths[i]! + space
    })
    const png = await pngOf(canvas)
    canvas.width = canvas.height = 0
    return { png, width, ascent, descent }
  }
}

/**
 * Draws a data URL the file cannot hold (WebP, GIF, SVG) stretched over a `width` by `height`
 * pixel canvas, as the screen stretches it over its rect, and gives it as PNG. A GIF gives its
 * first frame. Rejects when the image does not load.
 */
export function canvasToPng(doc: Document): ToPng {
  return async (dataUrl, width, height) => {
    const img = doc.createElement('img')
    img.src = dataUrl
    await img.decode()
    const canvas = doc.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2D canvas to convert the image on')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const png = await pngOf(canvas)
    canvas.width = canvas.height = 0
    return png
  }
}

/**
 * @internal What `openDocument` takes as `_pictures`, for every document opened in a browser:
 * the pictures its `save()` needs for text outside the standard fonts and images other than PNG
 * and JPEG, and the measure the screen lays text out with, so the file breaks and places lines
 * where the screen does.
 */
export function savePictures(doc: Document): {
  textPicture: TextPicture
  toPng: ToPng
  measure: TextMeasure
} {
  return {
    textPicture: canvasTextPicture(doc),
    toPng: canvasToPng(doc),
    measure: browserMeasure,
  }
}
