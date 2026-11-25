import { expect, test } from 'vitest'

import { parseDocumentFacts, parseForm } from './form.ts'

const widget = (extra: object = {}) => ({
  page: 0,
  annotIndex: 3,
  objectNumber: 10,
  generation: 0,
  rect: [0, 0, 10, 10],
  rectOk: true,
  flags: 4,
  hasAppearance: true,
  appearance: 'stream',
  scripts: {},
  ...extra,
})

const field = (extra: object = {}) => ({
  name: 'f',
  objectNumber: 9,
  generation: 0,
  origin: 'acroform',
  kind: 'text',
  flags: 0,
  valueKind: 'none',
  defaultValueKind: 'none',
  widgets: [widget()],
  ...extra,
})

const form = (fields: object[], extra: object = {}) =>
  JSON.stringify({
    kind: 'acroform',
    needAppearances: false,
    fields,
    calculationOrder: [],
    calculationOrderRefs: [],
    fieldTreeDepth: 1,
    fieldTreeRevisits: false,
    tooLarge: false,
    truncated: false,
    ...extra,
  })

test('every key the fork writes is read, in its public name', () => {
  const result = parseForm(
    form(
      [
        field({
          kind: 'checkbox',
          valueKind: 'name',
          value: 'Yes',
          defaultValueKind: 'array',
          defaultValue: ['a', { bytes: 'ff' }, null],
          tooltip: 'Tip',
          truncated: true,
          widgets: [
            widget({
              page: -1,
              annotIndex: -1,
              objectNumber: undefined,
              generation: undefined,
              appearance: 'states',
              states: ['Off', 'Yes'],
              as: 'Off',
              onState: 'Yes',
              exportValue: 'Yes',
              borderStyle: { width: 1, style: null },
              borderColor: [0, 0, 0],
              backgroundColor: [1],
              rotation: 90,
              caption: 'Go',
              q: null,
              tooltip: { bytes: '00' },
              da: '/Helv 0 Tf',
              pmd: true,
              scripts: { K: ['a()'], A: ['b()', 'c()'] },
              action: { s: 'URI', uriHex: '6869' },
              truncated: true,
            }),
          ],
        }),
        field({
          name: 'list',
          kind: 'list',
          options: [{ exportValue: 'a', displayValue: 'A' }],
          maxLength: 4,
          topIndex: 2,
          widgets: [
            widget({
              action: { s: 'ResetForm', fields: ['f'], refs: [[9, 0]], flags: 1 },
            }),
          ],
        }),
      ],
      {
        da: '/Helv 12 Tf',
        q: 2,
        calculationOrder: [1, -1],
        calculationOrderRefs: [[9, 0], null],
        fieldTreeRevisits: true,
        truncated: true,
      }
    )
  )
  expect(result).toEqual({
    kind: 'acroform',
    needAppearances: false,
    defaultAppearance: '/Helv 12 Tf',
    alignment: 2,
    calculationOrder: [1, -1],
    calculationOrderRefs: [{ objectNumber: 9, generation: 0 }, null],
    fieldTreeDepth: 1,
    fieldTreeRevisits: true,
    tooLarge: false,
    truncated: true,
    fields: [
      {
        name: 'f',
        objectNumber: 9,
        generation: 0,
        origin: 'acroform',
        kind: 'checkbox',
        flags: 0,
        valueKind: 'name',
        value: 'Yes',
        defaultValueKind: 'array',
        defaultValue: ['a', { bytes: new Uint8Array([0xff]) }, null],
        tooltip: 'Tip',
        truncated: true,
        widgets: [
          {
            page: -1,
            index: -1,
            rect: [0, 0, 10, 10],
            rectOk: true,
            flags: 4,
            hasAppearance: true,
            appearance: 'states',
            appearanceStates: ['Off', 'Yes'],
            appearanceState: 'Off',
            onState: 'Yes',
            exportValue: 'Yes',
            borderStyle: { width: 1, style: null },
            borderColor: [0, 0, 0],
            backgroundColor: [1],
            rotation: 90,
            caption: 'Go',
            alignment: null,
            tooltip: { bytes: new Uint8Array([0]) },
            defaultAppearance: '/Helv 0 Tf',
            paperMetadata: true,
            scripts: { K: ['a()'], A: ['b()', 'c()'] },
            action: { kind: 'URI', uri: new TextEncoder().encode('hi') },
            truncated: true,
          },
        ],
      },
      {
        name: 'list',
        objectNumber: 9,
        generation: 0,
        origin: 'acroform',
        kind: 'list',
        flags: 0,
        valueKind: 'none',
        defaultValueKind: 'none',
        options: [{ exportValue: 'a', displayValue: 'A' }],
        maxLength: 4,
        topIndex: 2,
        widgets: [
          {
            page: 0,
            index: 3,
            objectNumber: 10,
            generation: 0,
            rect: [0, 0, 10, 10],
            rectOk: true,
            flags: 4,
            hasAppearance: true,
            appearance: 'stream',
            appearanceStates: [],
            scripts: {},
            action: {
              kind: 'ResetForm',
              reset: {
                fields: ['f'],
                refs: [{ objectNumber: 9, generation: 0 }],
                flags: 1,
              },
            },
          },
        ],
      },
    ],
  })
})

test('a script key named __proto__ keeps its sources as an own key', () => {
  const text = form([field({ widgets: [widget({ scripts: { K: ['k()'] } })] })]).replace(
    '"scripts":{"K":["k()"]}',
    '"scripts":{"__proto__":["hidden()"],"K":["k()"]}'
  )
  const scripts = parseForm(text).fields[0]?.widgets[0]?.scripts ?? {}
  expect(Object.keys(scripts)).toEqual(['__proto__', 'K'])
  expect(Object.getOwnPropertyDescriptor(scripts, '__proto__')?.value).toEqual([
    'hidden()',
  ])
  expect(Object.getPrototypeOf(scripts)).toBe(Object.prototype)
})

test('a cut action keeps what the fork wrote and leaves out a cut name', () => {
  const cut = (action: object) =>
    parseForm(form([field({ widgets: [widget({ action, truncated: true })] })])).fields[0]
      ?.widgets[0]?.action
  expect(cut({ s: null, fields: ['a'], refs: [[9, 0]], flags: 1 })).toEqual({
    kind: '',
    reset: { fields: ['a'], refs: [{ objectNumber: 9, generation: 0 }], flags: 1 },
  })
  expect(cut({ s: 'Named', name: null })).toEqual({ kind: 'Named' })
  expect(cut({ s: 'Named', name: '' })).toEqual({ kind: 'Named', name: '' })
})

test('a Named action gives its name', () => {
  const result = parseForm(
    form([field({ widgets: [widget({ action: { s: 'Named', name: 'Print' } })] })])
  )
  expect(result.fields[0]?.widgets[0]?.action).toEqual({ kind: 'Named', name: 'Print' })
})

test.each([
  ['an unknown kind', form([], { kind: 'pdf' }), 'kind:'],
  ['tooLarge missing', form([], { tooLarge: undefined }), 'tooLarge:'],
  ['fields beside tooLarge', form([field()], { tooLarge: true }), 'fields:'],
  [
    'a calculation index past the fields',
    form([], { calculationOrder: [0], calculationOrderRefs: [null] }),
    'calculationOrder:',
  ],
  [
    'calculation refs of another length',
    form([], { calculationOrder: [-1] }),
    'calculationOrderRefs:',
  ],
  ['an unknown origin', form([field({ origin: 'sweep' })]), 'origin:'],
  ['an unknown field kind', form([field({ kind: 'richtext' })]), 'kind:'],
  ['a value beside none', form([field({ value: 'x' })]), 'value:'],
  [
    'a string value that is a number',
    form([field({ valueKind: 'string', value: 1 })]),
    'value:',
  ],
  ['a page of -2', form([field({ widgets: [widget({ page: -2 })] })]), 'page:'],
  [
    'a place without a page',
    form([field({ widgets: [widget({ page: -1 })] })]),
    'annotIndex:',
  ],
  [
    'scripts missing',
    form([field({ widgets: [widget({ scripts: undefined })] })]),
    'scripts:',
  ],
  [
    'a script that is not text',
    form([field({ widgets: [widget({ scripts: { K: [1] } })] })]),
    'scripts:',
  ],
  [
    'an action kind cut in a widget not cut',
    form([field({ widgets: [widget({ action: { s: null } })] })]),
    's:',
  ],
  [
    'an action name cut in a widget not cut',
    form([field({ widgets: [widget({ action: { s: 'Named', name: null } })] })]),
    'name:',
  ],
  [
    'a reset without refs',
    form([
      field({ widgets: [widget({ action: { s: 'ResetForm', fields: [], flags: 0 } })] }),
    ]),
    'refs:',
  ],
])('%s comes from another module and throws an EngineError', (_, text, key) => {
  expect(() => parseForm(text)).toThrow(
    expect.objectContaining({
      code: 'engine-failure',
      message: 'The form could not be read.',
      cause: expect.objectContaining({
        message: expect.stringContaining(key) as unknown,
      }) as unknown,
    }) as Error
  )
})

test("the document's facts are read as the fork writes them", () => {
  expect(
    parseDocumentFacts(
      JSON.stringify({
        title: { bytes: '7f' },
        author: 'A',
        encrypted: true,
        openedAs: 'user',
      })
    )
  ).toEqual({
    title: { bytes: new Uint8Array([0x7f]) },
    author: 'A',
    encrypted: true,
    openedAs: 'user',
  })
})

test.each([
  [
    'openedAs owner without encryption',
    { encrypted: false, openedAs: 'owner' },
    'openedAs:',
  ],
  ['openedAs none with encryption', { encrypted: true, openedAs: 'none' }, 'openedAs:'],
  ['encrypted missing', { openedAs: 'none' }, 'encrypted:'],
  [
    'truncated false',
    { encrypted: false, openedAs: 'none', truncated: false },
    'truncated:',
  ],
])('facts with %s throw an EngineError', (_, facts, key) => {
  expect(() => parseDocumentFacts(JSON.stringify(facts))).toThrow(
    expect.objectContaining({
      code: 'engine-failure',
      message: "The document's facts could not be read.",
      cause: expect.objectContaining({
        message: expect.stringContaining(key) as unknown,
      }) as unknown,
    }) as Error
  )
})
