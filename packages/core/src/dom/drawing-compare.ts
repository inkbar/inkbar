import { page as browserPage } from 'vitest/browser'

import { staticDefaults } from '../model/annotations/defaults'
import { createAnnotationStore } from '../model/annotations/store'

import { drawingFor } from './drawing-context'
import { paintDrawing } from './drawing-svg'
import { annotationBox } from './overlay-render'
import { renderReferenceContent } from './reference-render'
import { createPageTransform } from './transform'

import type { AnnotationInput } from '../model/annotations/types'
import type { Rect } from '../model/geometry'
import type { PageInfo } from '../model/pages'

export interface CompareCase {
  name: string
  annotation: AnnotationInput
  rotate?: 0 | 90
  zoom?: 1 | 2 | 0.5 | 4
  box?: Rect
  userUnit?: number
}

/** A channel difference above this counts as a different pixel. */
const TOLERANCE = 16

/**
 * Paints the case with the reference renderer and with the new painter, screenshots both, and
 * returns the share of pixels that differ by more than 16 in any channel. A type with no
 * drawing yet is painted by the reference renderer on both sides.
 */
export async function comparePaint(
  c: CompareCase
): Promise<{ differing: number; referenceBox: DOMRect; paintedBox: DOMRect }> {
  const { default: themeCss } = await import('@inkbar/theme/theme.css?inline')
  const box = c.box ?? { x: 0, y: 0, width: 612, height: 792 }
  const info: PageInfo = {
    index: 0,
    box,
    rotate: 0,
    userUnit: c.userUnit ?? 1,
    width: box.width,
    height: box.height,
  }
  const t = createPageTransform(info, c.zoom ?? 1, c.rotate ?? 0)
  const store = createAnnotationStore({
    mode: { mode: 'uncontrolled' },
    defaults: staticDefaults,
  })
  const a = store.add(c.annotation)
  const d = drawingFor(a, t)

  const style = document.createElement('style')
  style.textContent = themeCss
  const stage = document.createElement('div')
  stage.style.cssText = 'position:absolute;left:0;top:0;display:flex;background:#fff;'
  const mount = (): HTMLElement => {
    const holder = document.createElement('div')
    holder.style.cssText = `position:relative;flex:none;background:#fff;width:${t.cssWidth}px;height:${t.cssHeight}px;`
    const layer = document.createElement('div')
    layer.className = 'ink-annotation'
    const at = annotationBox(a, t)
    layer.style.cssText = `position:absolute;left:${at.left}px;top:${at.top}px;width:${at.width}px;height:${at.height}px;`
    holder.append(layer)
    stage.append(holder)
    return layer
  }
  document.head.append(style)
  document.body.append(stage)
  try {
    const referenceEl = mount()
    const paintedEl = mount()
    renderReferenceContent(referenceEl, a, t)
    if (d) paintDrawing(paintedEl, d, t, annotationBox(a, t))
    else renderReferenceContent(paintedEl, a, t)
    const [reference, painted] = [
      referenceEl.parentElement as HTMLElement,
      paintedEl.parentElement as HTMLElement,
    ]
    const referenceBox = reference.getBoundingClientRect()
    const paintedBox = painted.getBoundingClientRect()
    const [one, two] = [await shoot(reference), await shoot(painted)]
    return { differing: differing(one, two), referenceBox, paintedBox }
  } finally {
    stage.remove()
    style.remove()
  }
}

/** The element's pixels. `save: false` keeps the PNG out of the file system. */
async function shoot(element: HTMLElement): Promise<ImageData> {
  const base64 = await browserPage.screenshot({ element, save: false })
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

function differing(a: ImageData, b: ImageData): number {
  if (a.width !== b.width || a.height !== b.height) return 1
  let n = 0
  for (let i = 0; i < a.data.length; i += 4) {
    for (let k = 0; k < 4; k++) {
      if (Math.abs(a.data[i + k]! - b.data[i + k]!) > TOLERANCE) {
        n++
        break
      }
    }
  }
  return n / (a.width * a.height)
}
