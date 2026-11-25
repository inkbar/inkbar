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
    groups: [],
    fieldsRoot: [],
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
    groups: [],
    fieldsRoot: [],
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
  expect(cut({ s: null, fileKind: 'string', fileHex: '' })).toEqual({
    kind: '',
    fileKind: 'string',
    file: new Uint8Array(),
  })
})

test('a Named action gives its name', () => {
  const result = parseForm(
    form([field({ widgets: [widget({ action: { s: 'Named', name: 'Print' } })] })])
  )
  expect(result.fields[0]?.widgets[0]?.action).toEqual({ kind: 'Named', name: 'Print' })
})

test('names in a value list, null values and /I are read', () => {
  const [list, empty] = parseForm(
    form([
      field({
        kind: 'list',
        valueKind: 'array',
        value: [{ name: 'Nm' }, 'str', null, { bytes: 'ff' }],
        defaultValueKind: 'array',
        defaultValue: [{ name: 'D#1\u00e9' }],
        selectedIndices: [1, null, 2.5, -1],
        selectedIndicesOwn: true,
      }),
      field({
        valueKind: 'none',
        valueNull: true,
        defaultValueKind: 'none',
        defaultValueNull: true,
        selectedIndices: null,
        selectedIndicesOwn: false,
      }),
    ])
  ).fields
  expect(list).toMatchObject({
    value: [{ name: 'Nm' }, 'str', null, { bytes: new Uint8Array([0xff]) }],
    defaultValue: [{ name: 'D#1é' }],
    selectedIndices: [1, null, 2.5, -1],
    selectedIndicesOwn: true,
  })
  expect(list).not.toHaveProperty('valueNull')
  expect(empty).toMatchObject({
    valueKind: 'none',
    valueNull: true,
    defaultValueNull: true,
    selectedIndices: null,
    selectedIndicesOwn: false,
  })
  expect(empty).not.toHaveProperty('value')
  const plain = parseForm(form([field()])).fields[0]!
  for (const key of [
    'valueNull',
    'defaultValueNull',
    'selectedIndices',
    'selectedIndicesOwn',
  ])
    expect(plain).not.toHaveProperty(key)
})

test("a Launch or GoToR action's file is read as bytes", () => {
  const actionOf = (action: object) =>
    parseForm(form([field({ kind: 'button', widgets: [widget({ action })] })])).fields[0]
      ?.widgets[0]?.action
  expect(
    actionOf({ s: 'Launch', fileKind: 'string', fileHex: '6170702e657865' })
  ).toEqual({
    kind: 'Launch',
    fileKind: 'string',
    file: new TextEncoder().encode('app.exe'),
  })
  expect(
    actionOf({
      s: 'GoToR',
      fileKind: 'spec',
      fileSpecFHex: '6f746865722e706466',
      fileSpecUFHex: 'feff00e9',
    })
  ).toEqual({
    kind: 'GoToR',
    fileKind: 'spec',
    specFile: new TextEncoder().encode('other.pdf'),
    specUnicodeFile: new Uint8Array([0xfe, 0xff, 0x00, 0xe9]),
  })
  expect(actionOf({ s: 'GoToR', fileKind: 'spec' })).toEqual({
    kind: 'GoToR',
    fileKind: 'spec',
  })
  expect(actionOf({ s: 'Launch', fileKind: 'other' })).toEqual({
    kind: 'Launch',
    fileKind: 'other',
  })
  expect(actionOf({ s: 'Launch' })).toEqual({ kind: 'Launch' })
})

/** A `/Kids` or `/Fields` entry as the fork writes it. */
const kid = (extra: object = {}) => ({
  ref: [10, 0],
  dictionary: true,
  hasT: false,
  hasKids: false,
  ...extra,
})

/** A group as the fork writes it. */
const groupOf = (extra: object = {}) => ({
  name: 'g',
  objectNumber: 8,
  generation: 0,
  walkIndex: 0,
  kids: [kid()],
  scripts: {},
  ...extra,
})

test('the field tree, its walk, toggle /Opt and own /I and /Rotate are read', () => {
  const result = parseForm(
    form(
      [
        field({
          name: 'g.r',
          kind: 'radio',
          objectNumber: 11,
          walkIndex: 1,
          t: 'r',
          opt: ['Alpha', { bytes: 'ff' }, { name: 'Nm' }, null],
          selectedIndices: [1],
          selectedIndicesOwn: false,
          widgets: [
            widget({ rotate: 90, opt: ['W'] }),
            widget({ rotate: null, opt: null }),
          ],
        }),
        field({
          name: 'orphan',
          objectNumber: 13,
          walkIndex: 3,
          t: null,
          parentIsWalkParent: false,
          widgets: [
            widget({ selectedIndices: [2, null] }),
            widget({ selectedIndices: null }),
          ],
        }),
      ],
      {
        groups: [
          groupOf({
            walkIndex: 0,
            t: { bytes: 'ff' },
            subtype: 'Widget',
            kids: [
              kid({ ref: [11, 0], hasT: true, t: 'r', hasKids: true }),
              { ref: null, dictionary: false },
              kid({ ref: [12, 3], hasT: true, t: null, parentIsWalkParent: false }),
            ],
            borderColor: [1, 0, null],
            backgroundColor: [],
            rotation: 90,
            caption: 'C',
            rotate: null,
            page: -1,
            scripts: { K: ['k()'] },
            truncated: true,
          }),
          groupOf({ name: 'g.r', objectNumber: 11, walkIndex: 1, field: 0, t: '' }),
        ],
        fieldsRoot: [
          kid({ ref: [8, 0], hasKids: true }),
          kid({ parentIsWalkParent: false }),
        ],
      }
    )
  )
  expect(result.groups).toEqual([
    {
      name: 'g',
      objectNumber: 8,
      generation: 0,
      walkIndex: 0,
      partialName: { bytes: new Uint8Array([0xff]) },
      subtype: 'Widget',
      kids: [
        {
          ref: { objectNumber: 11, generation: 0 },
          dictionary: true,
          hasKids: true,
          partialName: 'r',
        },
        { ref: null, dictionary: false },
        {
          ref: { objectNumber: 12, generation: 3 },
          dictionary: true,
          hasKids: false,
          partialName: null,
          otherParent: true,
        },
      ],
      borderColor: [1, 0, null],
      backgroundColor: [],
      rotation: 90,
      caption: 'C',
      rotate: null,
      page: -1,
      scripts: { K: ['k()'] },
      truncated: true,
    },
    {
      name: 'g.r',
      objectNumber: 11,
      generation: 0,
      walkIndex: 1,
      field: 0,
      partialName: '',
      kids: [
        { ref: { objectNumber: 10, generation: 0 }, dictionary: true, hasKids: false },
      ],
      scripts: {},
    },
  ])
  expect(result.fieldsRoot).toEqual([
    { ref: { objectNumber: 8, generation: 0 }, dictionary: true, hasKids: true },
    {
      ref: { objectNumber: 10, generation: 0 },
      dictionary: true,
      hasKids: false,
      otherParent: true,
    },
  ])
  const [radio, orphan] = result.fields
  expect(radio).toMatchObject({
    walkIndex: 1,
    partialName: 'r',
    toggleOptions: ['Alpha', { bytes: new Uint8Array([0xff]) }, { name: 'Nm' }, null],
    selectedIndices: [1],
    selectedIndicesOwn: false,
  })
  expect(radio).not.toHaveProperty('otherParent')
  expect(radio?.widgets[0]).toMatchObject({ rotate: 90, toggleOptions: ['W'] })
  expect(radio?.widgets[1]).toMatchObject({ rotate: null, toggleOptions: null })
  expect(orphan).toMatchObject({ walkIndex: 3, partialName: null, otherParent: true })
  expect(orphan?.widgets.map((w) => w.selectedIndices)).toEqual([[2, null], null])
  // A field the walk did not reach, and a widget with none of the new keys.
  const plain = parseForm(form([field()])).fields[0]!
  for (const key of ['walkIndex', 'partialName', 'otherParent', 'toggleOptions'])
    expect(plain).not.toHaveProperty(key)
  for (const key of ['rotate', 'toggleOptions', 'selectedIndices'])
    expect(plain.widgets[0]).not.toHaveProperty(key)
})

test.each([
  ['groups missing', form([], { groups: undefined }), 'groups:'],
  ['a group that is no object', form([], { groups: [1] }), 'groups:'],
  [
    'a group without a place',
    form([], { groups: [groupOf({ walkIndex: -1 })] }),
    'walkIndex:',
  ],
  ['a group without kids', form([], { groups: [groupOf({ kids: undefined })] }), 'kids:'],
  [
    'a group without scripts',
    form([], { groups: [groupOf({ scripts: null })] }),
    'scripts:',
  ],
  ['a group name that is no text', form([], { groups: [groupOf({ name: 1 })] }), 'name:'],
  ['a /T that is a number', form([], { groups: [groupOf({ t: 1 })] }), 't:'],
  [
    'parentIsWalkParent true',
    form([], { groups: [groupOf({ parentIsWalkParent: true })] }),
    'parentIsWalkParent:',
  ],
  [
    'a subtype past one byte',
    form([], { groups: [groupOf({ subtype: 'Ā' })] }),
    'subtype:',
  ],
  [
    'a subtype cut in a group not cut',
    form([], { groups: [groupOf({ subtype: null })] }),
    'subtype:',
  ],
  ['a page of -2', form([], { groups: [groupOf({ page: -2 })] }), 'page:'],
  ['a rotate that is text', form([], { groups: [groupOf({ rotate: '90' })] }), 'rotate:'],
  [
    'a colour that is no list',
    form([], { groups: [groupOf({ borderColor: 1 })] }),
    'borderColor:',
  ],
  [
    'a group field past the fields',
    form([], { groups: [groupOf({ field: 0 })] }),
    'field:',
  ],
  [
    "a group field at another field's place",
    form([field({ walkIndex: 2 })], { groups: [groupOf({ walkIndex: 1, field: 0 })] }),
    'field:',
  ],
  [
    'two dictionaries at one place',
    form([field({ walkIndex: 0 })], { groups: [groupOf({ walkIndex: 0 })] }),
    'walkIndex:',
  ],
  [
    'groups beside tooLarge',
    form([], { tooLarge: true, groups: [groupOf()] }),
    'groups:',
  ],
  ['fieldsRoot missing', form([], { fieldsRoot: undefined }), 'fieldsRoot:'],
  ['a kid ref of one number', form([], { fieldsRoot: [kid({ ref: [1] })] }), 'ref:'],
  [
    'a kid with no dictionary fact',
    form([], { fieldsRoot: [kid({ dictionary: 1 })] }),
    'dictionary:',
  ],
  [
    'facts of a kid that is no dictionary',
    form([], { fieldsRoot: [kid({ dictionary: false })] }),
    'hasT:',
  ],
  [
    'a kid without hasKids',
    form([], { fieldsRoot: [kid({ hasKids: undefined })] }),
    'hasKids:',
  ],
  ['a kid /T without hasT', form([], { fieldsRoot: [kid({ t: 'a' })] }), 't:'],
  ['hasT without a /T', form([], { fieldsRoot: [kid({ hasT: true })] }), 't:'],
  [
    'a kid parentIsWalkParent true',
    form([], { fieldsRoot: [kid({ parentIsWalkParent: true })] }),
    'parentIsWalkParent:',
  ],
  ['a field place that is text', form([field({ walkIndex: '1' })]), 'walkIndex:'],
  ['a field /T without a place', form([field({ t: 'a' })]), 't:'],
  [
    'a field parentIsWalkParent without a place',
    form([field({ parentIsWalkParent: false })]),
    'parentIsWalkParent:',
  ],
  [
    'selectedIndices without selectedIndicesOwn',
    form([field({ selectedIndices: [1] })]),
    'selectedIndicesOwn:',
  ],
  [
    'selectedIndicesOwn without selectedIndices',
    form([field({ selectedIndicesOwn: true })]),
    'selectedIndicesOwn:',
  ],
  ['an /Opt that is no list', form([field({ opt: 'A' })]), 'opt:'],
  [
    'an /Opt name with another key',
    form([field({ opt: [{ name: 'a', x: 1 }] })]),
    'opt:',
  ],
  [
    "a widget's /Opt entry that is a number",
    form([field({ widgets: [widget({ opt: [1] })] })]),
    'opt:',
  ],
  [
    "a widget's own /I of a number",
    form([field({ widgets: [widget({ selectedIndices: 1 })] })]),
    'selectedIndices:',
  ],
  [
    "a widget's /Rotate that is text",
    form([field({ widgets: [widget({ rotate: 'x' })] })]),
    'rotate:',
  ],
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
    'a name entry with another key',
    form([field({ valueKind: 'array', value: [{ name: 'a', bytes: '' }] })]),
    'value:',
  ],
  [
    'a name entry cut to null',
    form([field({ valueKind: 'array', value: [{ name: null }], truncated: true })]),
    'value:',
  ],
  [
    'a name entry past one byte',
    form([field({ defaultValueKind: 'array', defaultValue: [{ name: 'Ā' }] })]),
    'defaultValue:',
  ],
  [
    'valueNull beside a string',
    form([field({ valueKind: 'string', value: 'x', valueNull: true })]),
    'valueNull:',
  ],
  ['valueNull false', form([field({ valueNull: false })]), 'valueNull:'],
  [
    'defaultValueNull beside a name',
    form([
      field({ defaultValueKind: 'name', defaultValue: 'x', defaultValueNull: true }),
    ]),
    'defaultValueNull:',
  ],
  [
    'selected indices of a number',
    form([field({ selectedIndices: 1, selectedIndicesOwn: true })]),
    'selectedIndices:',
  ],
  [
    'a selected index that is a string',
    form([field({ selectedIndices: ['1'], selectedIndicesOwn: true })]),
    'selectedIndices:',
  ],
  [
    'an unknown file kind',
    form([field({ widgets: [widget({ action: { s: 'Launch', fileKind: 'url' } })] })]),
    'fileKind:',
  ],
  [
    'a file in a URI action',
    form([
      field({
        widgets: [
          widget({ action: { s: 'URI', uriHex: '', fileKind: 'string', fileHex: '' } }),
        ],
      }),
    ]),
    'fileKind:',
  ],
  [
    'a string file without its bytes',
    form([field({ widgets: [widget({ action: { s: 'Launch', fileKind: 'string' } })] })]),
    'fileHex:',
  ],
  [
    'file bytes that are not hex',
    form([
      field({
        widgets: [widget({ action: { s: 'Launch', fileKind: 'string', fileHex: 'zz' } })],
      }),
    ]),
    'fileHex:',
  ],
  [
    'specification bytes beside a string file',
    form([
      field({
        widgets: [
          widget({
            action: { s: 'GoToR', fileKind: 'string', fileHex: '', fileSpecUFHex: '' },
          }),
        ],
      }),
    ]),
    'fileSpecUFHex:',
  ],
  [
    'string bytes beside a specification',
    form([
      field({
        widgets: [widget({ action: { s: 'GoToR', fileKind: 'spec', fileHex: '' } })],
      }),
    ]),
    'fileHex:',
  ],
  [
    'file bytes without a kind',
    form([field({ widgets: [widget({ action: { s: 'Launch', fileSpecFHex: '' } })] })]),
    'fileSpecFHex:',
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
