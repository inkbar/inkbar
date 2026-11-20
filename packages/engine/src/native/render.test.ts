import { describe, expect, test } from 'vitest'

import { hiddenObjects, renderGeometry } from './render.ts'

import type { PageInfo } from '../types.ts'

const letter = (rotation: PageInfo['rotation'] = 0, x = 0, y = 0): PageInfo => ({
  width: 612,
  height: 792,
  rotation,
  box: { x, y, width: 612, height: 792 },
  userUnit: 1,
})
const page = letter()

test('the brief examples', () => {
  expect(renderGeometry(page, {})).toMatchObject({
    width: 612,
    height: 792,
    startX: 0,
    startY: 0,
    sizeX: 612,
    sizeY: 792,
    rotate: 0,
  })
  expect(renderGeometry(page, { rotation: 90, scale: 2 })).toMatchObject({
    width: 1584,
    height: 1224,
    rotate: 1,
  })
  expect(
    renderGeometry(page, { region: { x: 100, y: 692, width: 50, height: 50 }, scale: 4 })
  ).toMatchObject({
    width: 200,
    height: 200,
    startX: -400,
    startY: -200,
    sizeX: 2448,
    sizeY: 3168,
  })
  expect(renderGeometry(page, { size: { width: 1837, height: 2377 } })).toMatchObject({
    width: 1837,
    height: 2377,
    sizeX: 1837,
    sizeY: 2377,
  })
})

// The region 100..150 by 692..742 at scale 4, by total quarter turns. Its distances from the
// page box: 100 from the left, 462 from the right, 692 from the bottom, 50 from the top.
const BY_TURNS = [
  { startX: -400, startY: -200, sizeX: 2448, sizeY: 3168 },
  { startX: -2768, startY: -400, sizeX: 3168, sizeY: 2448 },
  { startX: -1848, startY: -2768, sizeX: 2448, sizeY: 3168 },
  { startX: -200, startY: -1848, sizeX: 3168, sizeY: 2448 },
]
const ROTATIONS = [0, 90, 180, 270] as const

describe.each(ROTATIONS.flatMap((r) => ROTATIONS.map((e) => [r, e] as const)))(
  'a region on a page with /Rotate %i turned %i more',
  (pageRotation, rotation) => {
    const expected = {
      width: 200,
      height: 200,
      rotate: rotation / 90,
      ...BY_TURNS[((pageRotation + rotation) / 90) % 4],
    }

    test('with the box at the origin', () => {
      const region = { x: 100, y: 692, width: 50, height: 50 }
      expect(
        renderGeometry(letter(pageRotation), { region, scale: 4, rotation })
      ).toEqual(expected)
    })

    test('with a crop box at (20, 30)', () => {
      const region = { x: 120, y: 722, width: 50, height: 50 }
      expect(
        renderGeometry(letter(pageRotation, 20, 30), { region, scale: 4, rotation })
      ).toEqual(expected)
    })
  }
)

test('a region that is not square swaps its sides on a quarter turn', () => {
  const region = { x: 100, y: 600, width: 100, height: 50 }
  expect(renderGeometry(page, { region })).toMatchObject({ width: 100, height: 50 })
  expect(renderGeometry(page, { region, rotation: 90 })).toMatchObject({
    width: 50,
    height: 100,
  })
  expect(renderGeometry(letter(270), { region })).toMatchObject({
    width: 50,
    height: 100,
  })
})

test('a size stretches the region to fill it, each way on its own', () => {
  const region = { x: 100, y: 692, width: 50, height: 50 }
  expect(renderGeometry(page, { region, size: { width: 100, height: 300 } })).toEqual({
    width: 100,
    height: 300,
    startX: -200,
    startY: -300,
    sizeX: 1224,
    sizeY: 4752,
    rotate: 0,
  })
})

test('with neither scale nor size the scale is 1', () => {
  const region = { x: 10, y: 20, width: 30, height: 40 }
  expect(renderGeometry(page, { region })).toEqual(
    renderGeometry(page, { region, scale: 1 })
  )
})

test('a scale rounds the bitmap up and places the page as a whole-page render does', () => {
  const odd = {
    ...page,
    width: 100.5,
    height: 200.25,
    box: { x: 0, y: 0, width: 100.5, height: 200.25 },
  }
  const whole = renderGeometry(odd, { scale: 1 })
  expect(whole).toMatchObject({ width: 101, height: 201, sizeX: 101, sizeY: 201 })
  const region = { x: 10, y: 0.25, width: 20, height: 20 }
  expect(renderGeometry(odd, { region })).toMatchObject({
    width: 20,
    height: 20,
    startX: -10,
    startY: -180,
    sizeX: 101,
    sizeY: 201,
  })
})

test('a region may lie partly off the page', () => {
  expect(
    renderGeometry(page, { region: { x: -50, y: 742, width: 100, height: 100 } })
  ).toMatchObject({ width: 100, height: 100, startX: 50, startY: 50 })
})

const size = { width: 10, height: 10 }
test.each([
  ['scale and size together', { scale: 2, size }],
  ['a region of no width', { region: { x: 0, y: 0, width: 0, height: 10 } }],
  ['a region of negative height', { region: { x: 0, y: 0, width: 10, height: -1 } }],
  ['a region not finite', { region: { x: NaN, y: 0, width: 10, height: 10 } }],
  ['an endless region', { region: { x: 0, y: 0, width: Infinity, height: 10 } }],
  ['a size that is not whole', { size: { width: 0.5, height: 1 } }],
  ['a size of 0', { size: { width: 0, height: 10 } }],
  ['a size over the pixel limit', { size: { width: 20000, height: 20000 } }],
  ['a scale over the pixel limit', { scale: 1000 }],
  ['a scale of 0', { scale: 0 }],
  ['a scale not finite', { scale: NaN }],
  ['a rotation off the quarter turns', { rotation: 45 }],
  ['a rotation that is not a number', { rotation: 'toString' }],
  ['a region of null', { region: null }],
  ['a size of null', { size: null }],
  ['a region far off', { region: { x: 1e308, y: 0, width: 1e308, height: 10 } }],
  [
    'a region too small for its size',
    {
      region: { x: 0, y: 0, width: 1e-6, height: 1e-6 },
      size: { width: 100, height: 100 },
    },
  ],
])('%s is a RangeError', (_, options) => {
  expect(() => renderGeometry(page, options as never)).toThrow(RangeError)
})

test('a size of one pixel is allowed', () => {
  expect(renderGeometry(page, { size: { width: 1, height: 1 } })).toMatchObject({
    width: 1,
    height: 1,
    sizeX: 1,
    sizeY: 1,
  })
})

test('hide takes whole object numbers from 1', () => {
  expect(hiddenObjects(undefined)).toEqual([])
  expect(hiddenObjects([1, 4_294_967_295])).toEqual([1, 4_294_967_295])
  for (const bad of [[0], [1.5], [-1], [2 ** 32], ['3'], 3, null])
    expect(() => hiddenObjects(bad)).toThrow(RangeError)
})
