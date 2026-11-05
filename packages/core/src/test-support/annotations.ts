// Test support only, never production code. No build entry reaches this directory, and the
// package publishes only `dist`.
import type { AnnotationInput } from '../model/annotations/types'

/**
 * One annotation of each type Inkbar draws and edits, on page 0 of a Letter page, apart from
 * each other. Annotations a PDF embeds open locked, so a test that edits "the annotations in a
 * file" loads these, as a host loads a saved Gloss file. The signature is a stamp, as the
 * signature tool places an image template.
 */
export function oneOfEach(): AnnotationInput[] {
  return [
    {
      type: 'highlight',
      page: 0,
      quads: [
        {
          p1: { x: 72, y: 715 },
          p2: { x: 300, y: 715 },
          p3: { x: 72, y: 695 },
          p4: { x: 300, y: 695 },
        },
      ],
    },
    {
      type: 'underline',
      page: 0,
      quads: [
        {
          p1: { x: 72, y: 690 },
          p2: { x: 300, y: 690 },
          p3: { x: 72, y: 672 },
          p4: { x: 300, y: 672 },
        },
      ],
    },
    {
      type: 'text',
      page: 0,
      rect: { x: 500, y: 700, width: 20, height: 20 },
      contents: 'Hi',
    },
    { type: 'square', page: 0, rect: { x: 72, y: 500, width: 100, height: 80 } },
    { type: 'circle', page: 0, rect: { x: 250, y: 500, width: 100, height: 80 } },
    {
      type: 'line',
      page: 0,
      start: { x: 72, y: 420 },
      end: { x: 300, y: 460 },
      width: 1,
    },
    {
      type: 'polygon',
      page: 0,
      vertices: [
        { x: 350, y: 400 },
        { x: 450, y: 400 },
        { x: 400, y: 470 },
      ],
    },
    {
      type: 'ink',
      page: 0,
      inklist: [
        [
          { x: 72, y: 300 },
          { x: 120, y: 360 },
          { x: 170, y: 300 },
        ],
      ],
    },
    {
      type: 'freetext',
      page: 0,
      rect: { x: 250, y: 300, width: 144, height: 20 },
      contents: 'Box',
    },
    {
      type: 'stamp',
      page: 0,
      subject: 'Signature',
      rect: { x: 72, y: 150, width: 120, height: 40 },
      imagedata:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    },
  ]
}
