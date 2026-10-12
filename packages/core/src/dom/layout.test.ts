import { describe, expect, it } from 'vitest'

import {
  computeCssLayout,
  fitZoomCss,
  mostVisiblePageCss,
  visibleRangeCss,
} from './layout'

import type { PageInfo } from '../model/pages'

const letter = (index: number): PageInfo => ({
  index,
  box: { x: 0, y: 0, width: 612, height: 792 },
  rotate: 0,
  userUnit: 1,
  width: 612,
  height: 792,
})
const pages = [letter(0), letter(1), letter(2)]

describe('computeCssLayout', () => {
  it('stacks pages vertically with gaps and centres them', () => {
    const l = computeCssLayout({
      pages,
      zoom: 1,
      rotation: 0,
      gap: 16,
      mode: 'continuous',
      current: 0,
      containerWidth: 1000,
    })
    expect(l.width).toBe(1000)
    expect(l.height).toBe(16 + 3 * (792 + 16))
    expect(l.boxes[0]).toEqual({
      index: 0,
      left: (1000 - 612) / 2,
      top: 16,
      width: 612,
      height: 792,
    })
    expect(l.boxes[1]!.top).toBe(16 + 792 + 16)
  })

  it('single mode lays out only the current page', () => {
    const l = computeCssLayout({
      pages,
      zoom: 2,
      rotation: 0,
      gap: 16,
      mode: 'single',
      current: 2,
      containerWidth: 1300,
    })
    expect(l.boxes).toHaveLength(1)
    expect(l.boxes[0]).toMatchObject({ index: 2, width: 1224, height: 1584 })
  })

  it('rotation swaps box dimensions and width grows past the container when zoomed', () => {
    const l = computeCssLayout({
      pages,
      zoom: 1,
      rotation: 90,
      gap: 0,
      mode: 'continuous',
      current: 0,
      containerWidth: 500,
    })
    expect(l.boxes[0]).toMatchObject({ width: 792, height: 612, left: 0 })
    expect(l.width).toBe(792)
  })

  it('handles a very large document without spreading page widths into Math.max', () => {
    const many = Array.from({ length: 200_000 }, (_, i) => letter(i))
    many[123_456] = {
      ...letter(123_456),
      box: { x: 0, y: 0, width: 1000, height: 792 },
      width: 1000,
    }
    const l = computeCssLayout({
      pages: many,
      zoom: 1,
      rotation: 0,
      gap: 0,
      mode: 'continuous',
      current: 0,
      containerWidth: 800,
    })
    expect(l.boxes).toHaveLength(200_000)
    expect(l.width).toBe(1000)
    expect(l.height).toBe(200_000 * 792)
  })

  it('combines the page /Rotate with the view rotation', () => {
    const rotated: PageInfo = { ...letter(0), rotate: 90 }
    const l = computeCssLayout({
      pages: [rotated],
      zoom: 1,
      rotation: 90,
      gap: 0,
      mode: 'continuous',
      current: 0,
      containerWidth: 500,
    })
    expect(l.boxes[0]).toMatchObject({ width: 612, height: 792 })
  })
})

describe('fitZoomCss', () => {
  it('fits width and page with padding', () => {
    const container = { width: 1000, height: 800 }
    expect(fitZoomCss(letter(0), 0, container, 'fit-width', 20)).toBeCloseTo(960 / 612)
    expect(fitZoomCss(letter(0), 0, container, 'fit-page', 20)).toBeCloseTo(760 / 792)
    expect(fitZoomCss(letter(0), 90, container, 'fit-width', 0)).toBeCloseTo(1000 / 792)
  })
})

describe('visibleRangeCss / mostVisiblePageCss', () => {
  const l = computeCssLayout({
    pages: Array.from({ length: 50 }, (_, i) => letter(i)),
    zoom: 1,
    rotation: 0,
    gap: 10,
    mode: 'continuous',
    current: 0,
    containerWidth: 800,
  })
  it('mounts the visible pages plus the buffer', () => {
    expect(visibleRangeCss(l, 0, 900, 1)).toEqual([0, 1, 2])
    expect(visibleRangeCss(l, 802 * 10 + 5, 900, 2)).toEqual([8, 9, 10, 11, 12, 13])
    expect(visibleRangeCss(l, 1e9, 900, 1)).toEqual([48, 49])
  })
  it('reports the page covering most of the viewport', () => {
    expect(mostVisiblePageCss(l, 0, 900)).toBe(0)
    expect(mostVisiblePageCss(l, 802 + 500, 900)).toBe(2)
  })
})
