import { expect, it } from 'vitest'

import { comparePaint } from './drawing-compare'

const quads = [
  {
    p1: { x: 72, y: 715 },
    p2: { x: 300, y: 715 },
    p3: { x: 72, y: 695 },
    p4: { x: 300, y: 695 },
  },
]

it('reports no difference for a type both sides still draw with the reference renderer', async () => {
  const r = await comparePaint({
    name: 'highlight',
    annotation: {
      type: 'highlight',
      page: 0,
      rect: { x: 72, y: 695, width: 228, height: 20 },
      quads,
    },
  })
  expect(r.differing).toBe(0)
  expect(r.referenceBox.width).toBe(612)
  expect(r.paintedBox.width).toBe(612)
  expect(r.paintedBox.height).toBe(r.referenceBox.height)
})
