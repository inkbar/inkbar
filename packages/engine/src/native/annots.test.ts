import { expect, test } from 'vitest'

import { parsePageAnnotations } from './annots.ts'

/** One annotation entry as the fork writes it. */
const annot = (extra: object = {}) => ({
  index: 0,
  subtype: 'Square',
  objectNumber: 12,
  generation: 0,
  rect: [0, 0, 10, 10],
  rectOk: true,
  flags: 4,
  hasAppearance: false,
  appearance: null,
  ...extra,
})

const report = (annots: object[], extra: object = {}) =>
  JSON.stringify({ tabs: null, annots, truncated: false, ...extra })

test('every key the fork writes is read, in its public name', () => {
  const page = parsePageAnnotations(
    report(
      [
        annot({
          appearance: 'states',
          hasAppearance: true,
          states: ['Off', 'Yes'],
          as: 'Yes',
          quads: [1, 2, null],
          color: [1, 0, 0, 0, 0],
          interiorColor: [],
          opacity: null,
          contents: { bytes: '417f' },
          author: 'Ann',
          created: 'D:2026',
          modified: 'D:2027',
          icon: 'Comment',
          inReplyTo: [12, 0],
          intent: 'FreeTextCallout',
          line: [1, 2, 3, 4],
          lineEndings: ['None', null],
          vertices: [5, 6],
          inkLists: [[1, 2], null],
          borderStyle: { width: null, style: 'D' },
          border: [0, 0, 1],
          da: '/Helv 12 Tf',
          q: 1,
          pmd: true,
          parent: [9, 0],
          truncated: true,
        }),
        annot({ index: 2, objectNumber: undefined, generation: undefined }),
      ],
      { tabs: 'S', truncated: true }
    )
  )
  expect(page).toEqual({
    tabs: 'S',
    truncated: true,
    annotations: [
      {
        index: 0,
        subtype: 'Square',
        objectNumber: 12,
        generation: 0,
        rect: [0, 0, 10, 10],
        rectOk: true,
        flags: 4,
        hasAppearance: true,
        appearance: 'states',
        appearanceStates: ['Off', 'Yes'],
        appearanceState: 'Yes',
        quads: [1, 2, null],
        color: [1, 0, 0, 0, 0],
        interiorColor: [],
        opacity: null,
        contents: { bytes: new Uint8Array([0x41, 0x7f]) },
        author: 'Ann',
        created: 'D:2026',
        modified: 'D:2027',
        icon: 'Comment',
        inReplyTo: { objectNumber: 12, generation: 0 },
        intent: 'FreeTextCallout',
        line: [1, 2, 3, 4],
        lineEndings: ['None', null],
        vertices: [5, 6],
        inkLists: [[1, 2], null],
        borderStyle: { width: null, style: 'D' },
        border: [0, 0, 1],
        defaultAppearance: '/Helv 12 Tf',
        alignment: 1,
        paperMetadata: true,
        parent: { objectNumber: 9, generation: 0 },
        truncated: true,
      },
      {
        index: 2,
        subtype: 'Square',
        rect: [0, 0, 10, 10],
        rectOk: true,
        flags: 4,
        hasAppearance: false,
        appearanceStates: [],
      },
    ],
  })
})

test('a name the budget cut is null only in a cut entry', () => {
  const page = parsePageAnnotations(report([annot({ subtype: null, truncated: true })]))
  expect(page.annotations[0]?.subtype).toBe('')
})

test.each([
  ['tabs missing', JSON.stringify({ annots: [], truncated: false }), 'tabs:'],
  ['truncated missing', JSON.stringify({ tabs: null, annots: [] }), 'truncated:'],
  ['a subtype null in an entry not cut', report([annot({ subtype: null })]), 'subtype:'],
  ['an object number of 0', report([annot({ objectNumber: 0 })]), 'objectNumber:'],
  [
    'a generation without a number',
    report([annot({ objectNumber: undefined })]),
    'objectNumber:',
  ],
  ['rect of five', report([annot({ rect: [1, 2, 3, 4, 5] })]), 'rect:'],
  ['rect a string', report([annot({ rect: 'x' })]), 'rect:'],
  ['appearance missing', report([annot({ appearance: undefined })]), 'appearance:'],
  ['an unknown appearance', report([annot({ appearance: 'dict' })]), 'appearance:'],
  [
    'states beside a stream',
    report([annot({ appearance: 'stream', states: [] })]),
    'states:',
  ],
  [
    'a state past one byte',
    report([annot({ appearance: 'states', states: ['Ā'] })]),
    'states:',
  ],
  ['contents a number', report([annot({ contents: 1 })]), 'contents:'],
  ['contents with odd hex', report([annot({ contents: { bytes: 'abc' } })]), 'contents:'],
  [
    'contents with another key',
    report([annot({ contents: { bytes: '', x: 1 } })]),
    'contents:',
  ],
  ['inReplyTo of one number', report([annot({ inReplyTo: [3] })]), 'inReplyTo:'],
  ['pmd false', report([annot({ pmd: false })]), 'pmd:'],
  ['an ink path of strings', report([annot({ inkLists: [['1']] })]), 'inkLists:'],
])('%s comes from another module and throws an EngineError', (_, text, key) => {
  expect(() => parsePageAnnotations(text)).toThrow(
    expect.objectContaining({
      code: 'engine-failure',
      message: "A page's annotations could not be read.",
      cause: expect.objectContaining({
        message: expect.stringContaining(key) as unknown,
      }) as unknown,
    }) as Error
  )
})

test('text that is not JSON throws an EngineError', () => {
  expect(() => parsePageAnnotations('{')).toThrow(
    expect.objectContaining({ code: 'engine-failure' }) as Error
  )
})
