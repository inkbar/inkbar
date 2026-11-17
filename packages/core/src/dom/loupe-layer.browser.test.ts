import { afterEach, describe, expect, it } from 'vitest'

import { createLoupeLayer } from './loupe-layer'
import { openFixtureInBrowser } from './test-utils'
import { createPageTransform } from './transform'

import type { Rect } from '../model/geometry'

const cleanup: (() => void)[] = []
afterEach(() => {
  while (cleanup.length) cleanup.pop()!()
})

/** The numbers of a `clip-path: circle(<r>px at <x>px <y>px)`. */
const clip = (canvas: HTMLCanvasElement): { r: number; x: number; y: number } => {
  const [r, x, y] = (canvas.style.clipPath.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
  return { r: r!, x: x!, y: y! }
}

/** The lens canvas of a loupe on `rect`, and the element box it sits in, CSS px. */
async function lensOf(rect: Rect, view: 0 | 90, zoom: number, pageRotate: 0 | 90) {
  const doc = await openFixtureInBrowser('text-simple')
  const layer = createLoupeLayer({ document: doc, devicePixelRatio: 1 })
  cleanup.push(() => {
    layer.destroy()
    void doc.destroy()
  })
  const t = createPageTransform({ ...doc.pages[0]!, rotate: pageRotate }, zoom, view)
  const a = doc.annotations.add({ type: 'loupe', page: 0, rect })
  const el = document.createElement('div')
  if (a.type !== 'loupe') throw new Error('not a loupe')
  layer.attach(el, a, t)
  return {
    canvas: el.querySelector<HTMLCanvasElement>('canvas')!,
    box: t.toCssRect(rect),
  }
}

describe('the loupe layer clips the lens to the drawing', () => {
  for (const view of [0, 90] as const) {
    for (const pageRotate of [0, 90] as const) {
      it(`a square loupe is clipped to a circle of half its side, at view rotation ${view} and page /Rotate ${pageRotate}`, async () => {
        const { canvas, box } = await lensOf(
          { x: 100, y: 500, width: 120, height: 120 },
          view,
          2,
          pageRotate
        )
        // The radius `clip-path: circle(50%)` resolves to: 50% of sqrt(w² + h²) / sqrt(2), at the centre.
        const circleHalf = 0.5 * (Math.hypot(box.width, box.height) / Math.SQRT2)
        const { r, x, y } = clip(canvas)
        expect(box.width).toBeCloseTo(box.height)
        expect(r).toBeCloseTo(circleHalf)
        expect(x).toBeCloseTo(box.width / 2)
        expect(y).toBeCloseTo(box.height / 2)
        expect(canvas.style.cssText).toMatch(
          /left: 0px; top: 0px; width: 100%; height: 100%/
        )
      })
    }
  }

  for (const view of [0, 90] as const) {
    for (const zoom of [1, 2] as const) {
      it(`a 200 x 100 loupe clips to a circle of half its shorter side, centred, at view rotation ${view} and zoom ${zoom}`, async () => {
        const { canvas, box } = await lensOf(
          { x: 100, y: 500, width: 200, height: 100 },
          view,
          zoom,
          0
        )
        const { r, x, y } = clip(canvas)
        expect(r).toBeCloseTo(50 * zoom)
        expect(x).toBeCloseTo(box.width / 2)
        expect(y).toBeCloseTo(box.height / 2)
        // Not `circle(50%)`, which is 50% of sqrt(w² + h²) / sqrt(2): about 79 points here.
        expect(r).toBeLessThan(0.5 * (Math.hypot(box.width, box.height) / Math.SQRT2))
      })
    }
  }
})
