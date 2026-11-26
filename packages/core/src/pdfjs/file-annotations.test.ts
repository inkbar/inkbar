import { describe, expect, it } from 'vitest'

import { fileAnnotationFromPdfjs } from './file-annotations'

import type { PdfjsAnnotationData } from './types'
import type { FileAnnotation } from '../reader/file'

const data = (extra: Partial<PdfjsAnnotationData> = {}): PdfjsAnnotationData => ({
  id: '12R',
  subtype: 'Square',
  annotationType: 5,
  rect: [200, 300, 50, 100],
  ...extra,
})

const bare: FileAnnotation = {
  id: '12R',
  subtype: 'Square',
  rect: [200, 300, 50, 100],
  hasAppearance: false,
}

describe('fileAnnotationFromPdfjs', () => {
  it('gives the id, subtype, rect as written and no appearance, and nothing else', () => {
    expect(fileAnnotationFromPdfjs(data())).toStrictEqual(bare)
  })

  it.each([
    ['hasAppearance', { hasAppearance: true }, { hasAppearance: true }],
    [
      'quads',
      { quadPoints: new Float32Array([72, 715, 400, 715, 72, 695, 400, 695]) },
      { quads: [72, 715, 400, 715, 72, 695, 400, 695] },
    ],
    ['color', { color: new Uint8ClampedArray([255, 0, 0]) }, { color: [255, 0, 0] }],
    [
      'interiorColor',
      { interiorColor: new Uint8ClampedArray([0, 128, 255]) },
      { interiorColor: [0, 128, 255] },
    ],
    ['opacity', { opacity: 0.5 }, { opacity: 0.5 }],
    ['contents', { contentsObj: { str: 'hello', dir: 'ltr' } }, { contents: 'hello' }],
    ['author', { titleObj: { str: 'Ed', dir: 'ltr' } }, { author: 'Ed' }],
    ['created', { creationDate: 'D:20261012120000Z' }, { created: 'D:20261012120000Z' }],
    [
      'modified',
      { modificationDate: 'D:20261012120000Z' },
      { modified: 'D:20261012120000Z' },
    ],
    ['icon', { name: 'Comment' }, { icon: 'Comment' }],
    ['inReplyTo', { inReplyTo: '7R' }, { inReplyTo: '7R' }],
    ['intent', { it: 'FreeTextCallout' }, { intent: 'FreeTextCallout' }],
    ['line', { lineCoordinates: [1, 2, 3, 4] }, { line: [1, 2, 3, 4] }],
    [
      'lineEndings',
      { lineEndings: ['OpenArrow', 'None'] },
      { lineEndings: ['OpenArrow', 'None'] },
    ],
    [
      'vertices',
      { vertices: new Float32Array([0, 0, 10, 0, 5, 10]) },
      { vertices: [0, 0, 10, 0, 5, 10] },
    ],
    [
      'inkLists',
      { inkLists: [new Float32Array([0, 0, 10, 10]), [5, 5]] },
      {
        inkLists: [
          [0, 0, 10, 10],
          [5, 5],
        ],
      },
    ],
    ['border', { borderStyle: { width: 3, style: 2 } }, { border: { width: 3 } }],
    [
      'defaultAppearance',
      {
        defaultAppearanceData: {
          fontSize: 12,
          fontName: 'Helv',
          fontColor: new Uint8ClampedArray([0, 0, 255]),
        },
      },
      { defaultAppearance: { fontSize: 12, fontName: 'Helv', color: [0, 0, 255] } },
    ],
  ] satisfies [string, Partial<PdfjsAnnotationData>, Partial<FileAnnotation>][])(
    'gives %s',
    (_, extra, expected) => {
      expect(fileAnnotationFromPdfjs(data(extra))).toStrictEqual({ ...bare, ...expected })
    }
  )

  it('leaves out what PDF.js gives as null', () => {
    expect(
      fileAnnotationFromPdfjs(
        data({
          quadPoints: null,
          color: null,
          interiorColor: null,
          creationDate: null,
          modificationDate: null,
          borderStyle: null,
          // Typed as a number; a null is left out all the same.
          opacity: null as unknown as number,
        })
      )
    ).toStrictEqual(bare)
  })

  it('leaves out a colour with fewer than three components', () => {
    expect(
      fileAnnotationFromPdfjs(
        data({
          color: new Uint8ClampedArray([255]),
          interiorColor: new Uint8ClampedArray([]),
          defaultAppearanceData: { fontSize: 0, fontColor: [0, 0] },
        })
      )
    ).toStrictEqual({ ...bare, defaultAppearance: { fontSize: 0 } })
  })

  it('leaves out line endings that are not a pair', () => {
    expect(fileAnnotationFromPdfjs(data({ lineEndings: ['OpenArrow'] }))).toStrictEqual(
      bare
    )
  })

  it('keeps empty text as given', () => {
    expect(
      fileAnnotationFromPdfjs(
        data({
          contentsObj: { str: '', dir: 'ltr' },
          titleObj: { str: '', dir: 'ltr' },
        })
      )
    ).toStrictEqual({ ...bare, contents: '', author: '' })
  })
})
