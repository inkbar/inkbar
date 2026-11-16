import { describe, expect, test } from 'vitest'

import { describeStamp } from './stamp'

import type { StampAnnotation } from '../types'

const stamp: StampAnnotation = {
  id: 'a',
  page: 0,
  type: 'stamp',
  color: '#000000',
  opacity: 1,
  createdAt: '2026-10-19T12:00:00.000Z',
  modifiedAt: '2026-10-19T12:00:00.000Z',
  source: 'session',
  rect: { x: 100, y: 600, width: 80, height: 40 },
  imagedata: 'data:image/png;base64,AAAA',
}

describe('describeStamp', () => {
  test('an image in a group, turned by the stamp rotation', () => {
    expect(describeStamp({ ...stamp, rotation: 90, opacity: 0.5 })).toEqual({
      layer: 'annotation',
      bounds: stamp.rect,
      items: [
        {
          kind: 'group',
          opacity: 0.5,
          items: [
            {
              kind: 'image',
              role: 'stamp',
              data: stamp.imagedata,
              rect: stamp.rect,
              angle: 90,
            },
          ],
        },
      ],
    })
  })

  test('a stamp without a rotation is not turned', () => {
    const item = describeStamp(stamp).items[0]
    expect(item).toMatchObject({ items: [{ angle: 0 }] })
  })
})
