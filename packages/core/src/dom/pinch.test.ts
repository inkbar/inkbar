import { describe, expect, it } from 'vitest'

import { pinchFrame, wheelFactor } from './pinch'

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

describe('wheelFactor', () => {
  it('a small pixel delta zooms smoothly: in on negative deltaY, out on positive', () => {
    expect(wheelFactor({ deltaY: -20, deltaMode: 0 })).toBeCloseTo(Math.exp(0.2), 10)
    expect(wheelFactor({ deltaY: 49, deltaMode: 0 })).toBeCloseTo(Math.exp(-0.49), 10)
  })

  it('a pixel delta of 50 or more is one 1.1 step', () => {
    expect(wheelFactor({ deltaY: -50, deltaMode: 0 })).toBeCloseTo(1.1, 10)
    expect(wheelFactor({ deltaY: -120, deltaMode: 0 })).toBeCloseTo(1.1, 10)
    expect(wheelFactor({ deltaY: 100, deltaMode: 0 })).toBeCloseTo(1 / 1.1, 10)
  })

  it('line and page modes are one 1.1 step, whatever the delta', () => {
    expect(wheelFactor({ deltaY: -1, deltaMode: 1 })).toBeCloseTo(1.1, 10)
    expect(wheelFactor({ deltaY: 3, deltaMode: 1 })).toBeCloseTo(1 / 1.1, 10)
    expect(wheelFactor({ deltaY: 1, deltaMode: 2 })).toBeCloseTo(1 / 1.1, 10)
  })

  it('no delta is no zoom', () => {
    expect(wheelFactor({ deltaY: 0, deltaMode: 1 })).toBe(1)
  })
})
