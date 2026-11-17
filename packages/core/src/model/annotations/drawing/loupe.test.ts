import { describe, expect, test } from 'vitest'

import { describeLoupe, loupeRegion } from './loupe'

import type { LoupeAnnotation } from '../types'

const loupe: LoupeAnnotation = {
  id: 'a',
  page: 0,
  type: 'loupe',
  color: '#C0392B',
  opacity: 1,
  createdAt: '2026-10-19T12:00:00.000Z',
  modifiedAt: '2026-10-19T12:00:00.000Z',
  source: 'session',
  rect: { x: 100, y: 400, width: 200, height: 200 },
  magnification: 2,
  width: 2,
}

describe('describeLoupe', () => {
  test('a loupe shows the region its magnification implies', () => {
    const d = describeLoupe(loupe)
    expect(d.layer).toBe('annotation')
    expect(d.bounds).toEqual(loupe.rect)
    expect(d.items[0]).toEqual({
      kind: 'page',
      source: { x: 150, y: 450, width: 100, height: 100 },
      target: loupe.rect,
      clip: { center: { x: 200, y: 500 }, radius: 100 },
    })
    expect(loupeRegion(loupe)).toEqual({ x: 150, y: 450, width: 100, height: 100 })
  })

  test('a loupe that is not square clips to a circle of half its shorter side', () => {
    const d = describeLoupe({
      ...loupe,
      rect: { x: 100, y: 400, width: 200, height: 100 },
    })
    expect(d.items[0]).toMatchObject({
      kind: 'page',
      clip: { center: { x: 200, y: 450 }, radius: 50 },
    })
  })

  test('the rim is inset by half its stroke and carries the opacity', () => {
    const d = describeLoupe({ ...loupe, opacity: 0.5, width: 4 })
    expect(d.items[1]).toEqual({
      kind: 'group',
      opacity: 0.5,
      items: [
        {
          kind: 'ellipse',
          role: 'loupe-rim',
          rect: { x: 102, y: 402, width: 196, height: 196 },
          paint: { stroke: { color: '#C0392B', width: 4 } },
        },
      ],
    })
  })

  test('a loupe with no border has no rim', () => {
    const d = describeLoupe({ ...loupe, width: 0 })
    expect(d.items.map((i) => i.kind)).toEqual(['page'])
  })
})
