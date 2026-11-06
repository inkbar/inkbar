import { describe, expect, it } from 'vitest'

import { THUMBNAIL_WIDTH, thumbnailSize } from './thumbnail'

import type { PageInfo } from '../../model/pages'

const a4 = (rotate: PageInfo['rotate'] = 0, userUnit = 1): PageInfo => ({
  index: 0,
  box: { x: 0, y: 0, width: 595, height: 842 },
  rotate,
  userUnit,
  width: 595,
  height: 842,
})

describe('thumbnailSize', () => {
  it('thumbnailSize fits width', () => {
    const size = thumbnailSize(a4(), { width: 120 })
    expect(size.width).toBe(120)
    expect(size.height).toBeCloseTo(169.8, 1)
    expect(size.zoom).toBeCloseTo(0.2017, 4)
  })

  it('thumbnailSize swaps for /Rotate 90', () => {
    const size = thumbnailSize(a4(90), { width: 120 })
    expect(size.width).toBe(120)
    expect(size.height).toBeCloseTo(84.8, 1)
    expect(size.zoom).toBeCloseTo(120 / 842, 6)
  })

  it('height fits when width is absent', () => {
    const size = thumbnailSize(a4(), { height: 100 })
    expect(size.height).toBe(100)
    expect(size.width).toBeCloseTo(70.67, 2)
    expect(size.zoom).toBeCloseTo(100 / 842, 6)
  })

  it('width wins when both are given', () => {
    const size = thumbnailSize(a4(), { width: 120, height: 10 })
    expect(size.width).toBe(120)
    expect(size.height).toBeCloseTo(169.8, 1)
  })

  it('takes the default width when neither is given', () => {
    expect(thumbnailSize(a4(), {}).width).toBe(THUMBNAIL_WIDTH)
  })

  it('counts /UserUnit in the zoom', () => {
    const size = thumbnailSize(a4(0, 2), { width: 120 })
    expect(size.height).toBeCloseTo(169.8, 1)
    expect(size.zoom).toBeCloseTo(120 / 1190, 6)
  })
})
