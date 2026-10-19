import { describe, expect, it } from 'vitest'

import { staticDefaults } from './defaults'
import { keepsAspect, movedEndpoint, scaled } from './edit'
import { createAnnotationStore } from './store'

import type { LineAnnotation } from './types'

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
})
