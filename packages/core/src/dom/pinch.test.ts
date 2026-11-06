import { describe, expect, it } from 'vitest'

import { pinchFrame } from './pinch'

describe('pinchFrame', () => {
  it('pinchFrame doubles zoom when fingers spread to twice the distance', () => {
    const frame = pinchFrame(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: -50, y: 0 },
        { x: 150, y: 0 },
      ],
      1,
      0.1,
      8
    )
    expect(frame.zoom).toBe(2)
    expect(frame.factor).toBe(2)
    expect(frame.anchor).toEqual({ x: 50, y: 0 })
    expect(frame.pan).toEqual({ x: 0, y: 0 })
  })

  it('pinchFrame clamps to maxZoom', () => {
    const frame = pinchFrame(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: -50, y: 0 },
        { x: 150, y: 0 },
      ],
      6,
      0.1,
      8
    )
    expect(frame.zoom).toBe(8)
    expect(frame.factor).toBeCloseTo(8 / 6, 10)
  })

  it('pinchFrame clamps to minZoom', () => {
    const frame = pinchFrame(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: 25, y: 0 },
        { x: 75, y: 0 },
      ],
      0.2,
      0.1,
      8
    )
    expect(frame.zoom).toBe(0.1)
    expect(frame.factor).toBeCloseTo(0.5, 10)
  })

  it('pinchFrame pans with the midpoint', () => {
    const frame = pinchFrame(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: 30, y: 20 },
        { x: 130, y: 20 },
      ],
      1,
      0.1,
      8
    )
    expect(frame.factor).toBe(1)
    expect(frame.anchor).toEqual({ x: 50, y: 0 })
    expect(frame.pan).toEqual({ x: 30, y: 20 })
  })

  it('pinchFrame ignores a zero start distance', () => {
    const frame = pinchFrame(
      [
        { x: 10, y: 10 },
        { x: 10, y: 10 },
      ],
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      1.5,
      0.1,
      8
    )
    expect(frame.factor).toBe(1)
    expect(frame.zoom).toBe(1.5)
  })
})
