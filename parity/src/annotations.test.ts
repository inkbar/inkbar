import { describe, expect, it } from 'vitest'

import { annotationDifferences, tabOrderDifferences } from './annotations'

import type { FileAnnotation } from './data'

const annotation = (id: string, extra: Partial<FileAnnotation> = {}): FileAnnotation => ({
  id,
  subtype: 'Square',
  rect: [10, 20, 110, 32],
  hasAppearance: true,
  color: [255, 0, 0],
  ...extra,
})

describe('annotationDifferences', () => {
  it('finds equal annotations the same', () => {
    const page = () => [
      annotation('1R'),
      annotation('2R', { subtype: 'Ink', inkLists: [[1, 2, 3, 4]] }),
    ]
    expect(annotationDifferences(page(), page())).toEqual([])
  })

  it('names the order when the annotations come in a different order', () => {
    expect(
      annotationDifferences(
        [annotation('1R'), annotation('2R')],
        [annotation('2R'), annotation('1R')]
      )
    ).toEqual(['annotations in a different order: PDF.js 1R, 2R; engine 2R, 1R'])
  })

  it('names the annotation and the field that differs', () => {
    expect(
      annotationDifferences(
        [annotation('1R')],
        [annotation('1R', { rect: [10, 20, 110, 32.02] })]
      )
    ).toEqual(['annotation 1R: rect: PDF.js [10,20,110,32], engine [10,20,110,32.02]'])
    expect(
      annotationDifferences(
        [annotation('1R', { defaultAppearance: { fontSize: 10, color: [0, 0, 0] } })],
        [annotation('1R', { defaultAppearance: { fontSize: 12, color: [0, 0, 0] } })]
      )
    ).toEqual(['annotation 1R: defaultAppearance.fontSize: PDF.js 10, engine 12'])
  })

  it('tells a number that is not finite from null', () => {
    expect(
      annotationDifferences(
        [annotation('1R', { opacity: NaN })],
        [annotation('1R', { opacity: NaN })]
      )
    ).toEqual([])
    expect(
      annotationDifferences(
        [annotation('1R', { quads: [1, 2, 3, NaN] })],
        [annotation('1R', { quads: [1, 2, 3, null as unknown as number] })]
      )
    ).toEqual(['annotation 1R: quads: PDF.js [1,2,3,"NaN"], engine [1,2,3,null]'])
  })

  it('names an annotation one reader leaves out, and one whose id differs', () => {
    expect(
      annotationDifferences([annotation('1R'), annotation('2R')], [annotation('1R')])
    ).toEqual(['annotation 2R: only PDF.js gives it'])
    expect(
      annotationDifferences([annotation('annot_p0_1')], [annotation('p0i0')])
    ).toEqual(['annotation 1: id: PDF.js annot_p0_1, engine p0i0'])
  })
})

describe('tabOrderDifferences', () => {
  it('finds the same order the same and names one that differs', () => {
    expect(tabOrderDifferences(['1R', '2R'], ['1R', '2R'])).toEqual([])
    expect(tabOrderDifferences(['1R', '2R'], ['2R', '1R'])).toEqual([
      'tab order: PDF.js 1R, 2R; engine 2R, 1R',
    ])
    expect(tabOrderDifferences(['1R'], [])).toEqual(['tab order: PDF.js 1R; engine none'])
  })
})
