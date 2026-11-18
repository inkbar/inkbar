// Test support: not imported by the package itself.
import {
  manifest,
  type FixtureName,
  type RedactionRegion as FixtureRegion,
} from '@inkbar/fixtures'

import type { Rect, RedactionRegion, WriteAnnotation } from '../types.ts'
import type { Annotation as GlossAnnotation, Quad } from 'gloss-format'

export const ascii = (text: string) => new TextEncoder().encode(text)

/** The bounding box of a quad's eight numbers. */
export function boundsOf(quad: readonly number[]): Rect {
  const xs = quad.filter((_, i) => i % 2 === 0)
  const ys = quad.filter((_, i) => i % 2 === 1)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** A fixture region's eight numbers as a Gloss quad. */
export function quadOf(quad: readonly number[]): Quad {
  const [x1, y1, x2, y2, x3, y3, x4, y4] = quad as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  return {
    p1: { x: x1, y: y1 },
    p2: { x: x2, y: y2 },
    p3: { x: x3, y: y3 },
    p4: { x: x4, y: y4 },
  }
}

/**
 * A redaction mark over `region`, with its Gloss quad. Its appearance fills a box 3 points wider
 * on every side, as an outline's padding would make it, so a mark applied by its appearance
 * bounds would remove more than the region.
 */
export function mark(id: string, region: FixtureRegion): WriteAnnotation {
  const rect = boundsOf(region.quad)
  const bounds = {
    x: rect.x - 3,
    y: rect.y - 3,
    width: rect.width + 6,
    height: rect.height + 6,
  }
  return {
    page: region.page,
    annotation: {
      id,
      type: 'redact',
      page: region.page,
      rect: { ...rect },
      quads: [quadOf(region.quad)],
      interiorColor: '#000000',
      opacity: 1,
    } satisfies GlossAnnotation,
    appearance: {
      bounds,
      content: ascii(`0 g ${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height} re f`),
    },
    data: `{"id":"${id}"}`,
  }
}

/** The fixture's regions as marks. */
export const marksOf = (fixture: FixtureName) =>
  (manifest[fixture].regions ?? []).map((region, i) => mark(`mark-${i + 1}`, region))

/** The fixture's regions as the check takes them. */
export const regionsOf = (fixture: FixtureName): RedactionRegion[] =>
  (manifest[fixture].regions ?? []).map(({ page, quad }) => ({
    page,
    quads: [quadOf(quad)],
  }))
