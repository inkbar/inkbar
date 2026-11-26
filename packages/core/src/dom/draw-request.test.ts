import { describe, expect, it } from 'vitest'

import { hiddenFromIds, pageCanvasSize } from './draw-request'

describe('hiddenFromIds', () => {
  it('names an annotation by object number, or by place in /Annots on the page drawn', () => {
    expect(hiddenFromIds(['12R', '7R2', 'p3i4', 'p0i4', 'annot_p3_1'], 3)).toEqual([
      { id: '12R', objectNumber: 12 },
      { id: '7R2', objectNumber: 7 },
      { id: 'p3i4', index: 4 },
      // Another page's place names nothing on this one.
      { id: 'p0i4' },
      // PDF.js's id for a direct object tells no place.
      { id: 'annot_p3_1' },
    ])
  })
})

describe('pageCanvasSize', () => {
  it('rounds the page’s CSS size at the pixel ratio', () => {
    expect(pageCanvasSize({ cssWidth: 1450.44, cssHeight: 1877.04 }, 2)).toEqual({
      width: 2901,
      height: 3754,
    })
  })
})
