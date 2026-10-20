import { describe, expect, it } from 'vitest'

import { freeTextBox, withCalloutBounds } from './callout'
import { staticDefaults } from './defaults'
import {
  hasCallout,
  hasRectGeometry,
  keepsAspect,
  movedEndpoint,
  movedTip,
  resizedBox,
  resizedRect,
  scaled,
  translated,
  withBox,
} from './edit'
import { createAnnotationStore } from './store'

import type { Annotation, LineAnnotation } from './types'

const store = () =>
  createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })

describe('scaled', () => {
  it("maps a square's rect from one box to another", () => {
    const sq = store().add({
      type: 'square',
      page: 0,
      rect: { x: 0, y: 0, width: 10, height: 10 },
    })
    const patch = scaled(
      sq,
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 0, y: 0, width: 20, height: 20 }
    )
    expect(patch.rect).toEqual({ x: 0, y: 0, width: 20, height: 20 })
  })

  it("scales a free text's fringe with its rect", () => {
    const ft = store().add({
      type: 'freetext',
      page: 0,
      contents: 'Hi',
      rect: { x: 0, y: 0, width: 100, height: 50 },
      fringe: { left: 10, top: 5, right: 20, bottom: 15 },
    })
    const patch = scaled(ft, ft.rect, { x: 0, y: 0, width: 200, height: 25 })
    expect(patch).toMatchObject({
      rect: { x: 0, y: 0, width: 200, height: 25 },
      fringe: { left: 20, top: 2.5, right: 40, bottom: 7.5 },
    })
  })

  it('doubles every ink point', () => {
    const ink = store().add({
      type: 'ink',
      page: 0,
      inklist: [
        [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
        [{ x: 5, y: 6 }],
      ],
    })
    const patch = scaled(
      ink,
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 0, y: 0, width: 20, height: 20 }
    ) as { inklist: unknown }
    expect(patch.inklist).toEqual([
      [
        { x: 2, y: 4 },
        { x: 6, y: 8 },
      ],
      [{ x: 10, y: 12 }],
    ])
  })
})

describe('callout edits', () => {
  const freeText = (a: Annotation) => {
    if (a.type !== 'freetext') throw new Error('not free text')
    return a
  }
  const callout = () => {
    const a = freeText(
      store().add({
        type: 'freetext',
        page: 0,
        contents: 'Hi',
        intent: 'FreeTextCallout',
        width: 1,
        rect: { x: 55.5, y: 515.5, width: 145, height: 145 },
        fringe: { left: 44.5, top: 0.5, right: 0.5, bottom: 84.5 },
        callout: [
          { x: 56, y: 516 },
          { x: 80, y: 560 },
          { x: 100, y: 620 },
        ],
        head: 'None',
      })
    )
    if (!hasCallout(a)) throw new Error('not a callout')
    return a
  }

  it('hasCallout is true for a standard callout and a bubble, not a plain box', () => {
    const a = callout()
    expect(hasCallout(a)).toBe(true)
    expect(hasCallout({ ...a, cornerRadius: 8 })).toBe(true)
    expect(hasCallout({ ...a, intent: undefined })).toBe(false)
    expect(hasCallout({ ...a, callout: undefined })).toBe(false)
  })

  it('moving shifts rect and every callout point and leaves fringe alone', () => {
    const a = callout()
    expect(translated(a, 10, -5)).toEqual({
      rect: { x: 65.5, y: 510.5, width: 145, height: 145 },
      callout: [
        { x: 66, y: 511 },
        { x: 90, y: 555 },
        { x: 110, y: 615 },
      ],
    })
  })

  it('scaling scales fringe by the same factors as rect', () => {
    const a = callout()
    const to = { x: 55.5, y: 515.5, width: 290, height: 72.5 }
    const patch = scaled(a, a.rect, to)
    expect(patch).toMatchObject({
      rect: to,
      fringe: { left: 89, top: 0.25, right: 1, bottom: 42.25 },
    })
  })

  it('moving the tip keeps the text box and refits rect and fringe', () => {
    const a = callout()
    const patch = movedTip(a, { x: 300, y: 700 })
    expect(patch.callout).toEqual([
      { x: 300, y: 700 },
      { x: 80, y: 560 },
      { x: 100, y: 620 },
    ])
    expect(freeTextBox({ ...a, ...patch })).toEqual(freeTextBox(a))
    expect(patch).toMatchObject(
      withCalloutBounds(freeTextBox(a), patch.callout!, 1, 'None')
    )
  })

  it('resizing the box carries the last point along its edge and keeps tip and bend', () => {
    const a = callout()
    // Box {100,600,100,60}: the last point is on its left edge, a third of the way up.
    const to = { x: 120, y: 570, width: 50, height: 150 }
    const patch = resizedBox(a, to)
    expect(patch.callout).toEqual([
      { x: 56, y: 516 },
      { x: 80, y: 560 },
      { x: 120, y: 620 },
    ])
    const box = freeTextBox({ ...a, ...patch })
    expect(box.x).toBeCloseTo(to.x)
    expect(box.y).toBeCloseTo(to.y)
    expect(box.width).toBeCloseTo(to.width)
    expect(box.height).toBeCloseTo(to.height)
  })

  it('a box without a callout keeps its fringe, or is the rect without one', () => {
    const plain = freeText(
      store().add({
        type: 'freetext',
        page: 0,
        contents: 'Hi',
        rect: { x: 0, y: 0, width: 100, height: 50 },
      })
    )
    const to = { x: 10, y: 10, width: 20, height: 20 }
    expect(withBox(plain, to)).toEqual({ rect: to })
    const fringed = { ...plain, fringe: { left: 1, top: 2, right: 3, bottom: 4 } }
    expect(withBox(fringed, to)).toEqual({
      rect: { x: 9, y: 6, width: 24, height: 26 },
    })
  })
})

describe('movedEndpoint', () => {
  it('moves end and recomputes rect as the bounds plus half the width', () => {
    const line = store().add({
      type: 'line',
      page: 0,
      start: { x: 10, y: 10 },
      end: { x: 20, y: 20 },
      width: 4,
    }) as LineAnnotation
    const patch = movedEndpoint(line, 'end', { x: 50, y: 30 })
    expect(patch.start).toBeUndefined()
    expect(patch.end).toEqual({ x: 50, y: 30 })
    expect(patch.rect).toEqual({ x: 8, y: 8, width: 44, height: 24 })
  })
})

describe('keepsAspect', () => {
  it('is false for a square', () => {
    const sq = store().add({
      type: 'square',
      page: 0,
      rect: { x: 0, y: 0, width: 10, height: 10 },
    })
    expect(keepsAspect(sq)).toBe(false)
  })

  it('is true for a stamp and for ink signed as a signature, not for other ink', () => {
    const s = store()
    const stamp = s.add({
      type: 'stamp',
      page: 0,
      rect: { x: 0, y: 0, width: 30, height: 10 },
      imagedata: 'data:image/png;base64,AA==',
    })
    const inklist = [
      [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ],
    ]
    const signature = s.add({ type: 'ink', page: 0, inklist, subject: 'Signature' })
    const ink = s.add({ type: 'ink', page: 0, inklist })
    expect(keepsAspect(stamp)).toBe(true)
    expect(hasRectGeometry(stamp)).toBe(true)
    expect(keepsAspect(signature)).toBe(true)
    expect(keepsAspect(ink)).toBe(false)
  })
})

describe('loupe geometry', () => {
  it('resizes by its rect and keeps its aspect', () => {
    const loupe = store().add({
      type: 'loupe',
      page: 0,
      rect: { x: 0, y: 0, width: 72, height: 72 },
    })
    expect(hasRectGeometry(loupe)).toBe(true)
    expect(keepsAspect(loupe)).toBe(true)
  })
})

describe('resizedRect', () => {
  const r = { x: 10, y: 20, width: 30, height: 10 }

  it('keeps the top-left corner and changes one side', () => {
    expect(resizedRect(r, 3, 0)).toEqual({ x: 10, y: 20, width: 33, height: 10 })
  })

  it('with keepAspect, the other side follows in proportion', () => {
    expect(resizedRect(r, 3, 0, true)).toEqual({ x: 10, y: 19, width: 33, height: 11 })
    expect(resizedRect(r, 0, -1, true)).toEqual({ x: 10, y: 21, width: 27, height: 9 })
    const tiny = resizedRect({ x: 0, y: 0, width: 3, height: 1 }, -5, 0, true)
    expect(tiny.height).toBe(1)
    expect(tiny.width).toBe(3)
  })
})
