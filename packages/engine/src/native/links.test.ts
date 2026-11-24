import { expect, test } from 'vitest'

import { EngineError } from '../errors.ts'

import { parseNamedDestination, parseOutline, parsePageLinks } from './links.ts'

const hex = (text: string) => Buffer.from(text, 'latin1').toString('hex')
const utf8 = (text: string) => new TextEncoder().encode(text)

const item = (depth: number, title: string, extra: object = {}) => ({
  depth,
  title,
  flags: 0,
  count: 0,
  dest: null,
  action: null,
  ...extra,
})

const outline = (items: object[], truncated = false) =>
  JSON.stringify({ items, truncated })

/** An explicit destination as the fork writes it: a reference to a page, with no arguments. */
const dest = (extra: object = {}) => ({
  page: 0,
  pageRef: [3, 0],
  fit: 'Fit',
  args: [null, null, null, null],
  argCount: 0,
  argKinds: [],
  argIndirect: false,
  fitKind: 'name',
  pageKind: 'ref',
  ...extra,
})

/** The parsed form of `dest()`. */
const parsedDest = (extra: object = {}) => ({
  page: 0,
  pageRef: { objectNumber: 3, generation: 0 },
  fit: 'Fit',
  args: [null, null, null, null],
  argCount: 0,
  argKinds: [],
  argIndirect: false,
  fitKind: 'name',
  pageKind: 'ref',
  ...extra,
})

const annot = (extra: object = {}) => ({
  index: 0,
  subtype: 'Link',
  flags: 0,
  obj: 12,
  generation: 0,
  rectOk: true,
  hasQuads: false,
  quadsOk: true,
  ...extra,
})

const link = (extra: object = {}) => ({
  index: 0,
  rect: [0, 0, 1, 1],
  quads: null,
  dest: null,
  action: null,
  aa: null,
  ...extra,
})

const pageLinks = (links: object[], annots: object[] = []) =>
  JSON.stringify({ annots, links })

test('hex strings become bytes and null fields become absent keys', () => {
  const result = parsePageLinks(
    JSON.stringify({
      annots: [annot({ flags: 4, generation: 2 })],
      links: [
        {
          index: 0,
          rect: [10, 20, 110, 50],
          quads: null,
          dest: null,
          action: { s: 'URI', uriHex: hex('https://example.com/a'), uriKind: 'string' },
          aa: null,
        },
      ],
    })
  )
  expect(result.annotations).toEqual([
    {
      index: 0,
      subtype: 'Link',
      flags: 4,
      objectNumber: 12,
      generation: 2,
      rectOk: true,
      hasQuads: false,
      quadsOk: true,
    },
  ])
  const [first] = result.links
  expect(first).toEqual({
    index: 0,
    rect: { x: 10, y: 20, width: 100, height: 30 },
    action: { kind: 'URI', uri: utf8('https://example.com/a'), uriKind: 'string' },
  })
  expect(first).not.toHaveProperty('quads')
  expect(first).not.toHaveProperty('destination')
  expect(first).not.toHaveProperty('destinationInvalid')
  expect(first).not.toHaveProperty('additionalAction')
})

test('a direct annotation has no object number and no generation', () => {
  const [entry] = parsePageLinks(
    pageLinks([], [annot({ index: 2, obj: 0, rectOk: false, hasQuads: true })])
  ).annotations
  expect(entry).not.toHaveProperty('objectNumber')
  expect(entry).not.toHaveProperty('generation')
  expect(entry).toMatchObject({ rectOk: false, hasQuads: true, quadsOk: true })
})

test('destinations, files, quads and additional actions come through as the file has them', () => {
  const { links } = parsePageLinks(
    JSON.stringify({
      annots: [],
      links: [
        {
          index: 1,
          rect: [0, 0, 0, 0],
          quads: [1, 2, 3, 4, 5, 6, 7, 8],
          dest: dest({
            page: -1,
            pageRef: null,
            fit: 'XYZ',
            args: [72, null, null, null],
            argCount: 1,
            argKinds: ['number'],
            pageKind: 'integer',
          }),
          action: {
            s: 'GoToR',
            fileHex: hex('other.pdf'),
            fileKind: 'spec',
            dest: { nameHex: hex('chapter-3') },
            newWindow: false,
          },
          aa: { s: 'JavaScript', js: "app.alert('x')" },
        },
      ],
    })
  )
  expect(links[0]).toEqual({
    index: 1,
    rect: { x: 0, y: 0, width: 0, height: 0 },
    quads: [1, 2, 3, 4, 5, 6, 7, 8],
    destination: {
      page: -1,
      fit: 'XYZ',
      args: [72, null, null, null],
      argCount: 1,
      argKinds: ['number'],
      argIndirect: false,
      fitKind: 'name',
      pageKind: 'integer',
    },
    action: {
      kind: 'GoToR',
      file: utf8('other.pdf'),
      fileKind: 'spec',
      destination: { name: utf8('chapter-3') },
      newWindow: false,
    },
    additionalAction: { kind: 'JavaScript', script: "app.alert('x')" },
  })
})

test('a named action and an unknown action keep their names', () => {
  const { links } = parsePageLinks(
    JSON.stringify({
      annots: [],
      links: [
        {
          index: 0,
          rect: [0, 0, 1, 1],
          quads: null,
          dest: null,
          action: { s: 'Named', name: 'NextPage' },
          aa: null,
        },
        {
          index: 1,
          rect: [0, 0, 1, 1],
          quads: null,
          dest: null,
          action: { s: 'Thread' },
          aa: null,
        },
      ],
    })
  )
  expect(links[0]?.action).toEqual({ kind: 'Named', name: 'NextPage' })
  expect(links[1]?.action).toEqual({ kind: 'Thread' })
})

test('a flat outline with depths 0, 1, 1, 0, 1, 2 nests into two roots', () => {
  const result = parseOutline(
    outline([
      item(0, 'A'),
      item(1, 'A1'),
      item(1, 'A2'),
      item(0, 'B'),
      item(1, 'B1'),
      item(2, 'B1a'),
    ])
  )
  expect(result.truncated).toBe(false)
  expect(result.items.map((i) => i.title)).toEqual(['A', 'B'])
  expect(result.items[0]?.children.map((i) => i.title)).toEqual(['A1', 'A2'])
  expect(result.items[1]?.children.map((i) => i.title)).toEqual(['B1'])
  expect(result.items[1]?.children[0]?.children.map((i) => i.title)).toEqual(['B1a'])
  expect(result.items[0]?.children[0]?.children).toEqual([])
})

test('a depth that jumps by 2 attaches to the nearest ancestor', () => {
  const result = parseOutline(outline([item(0, 'A'), item(2, 'Deep'), item(1, 'Back')]))
  expect(result.items).toHaveLength(1)
  expect(result.items[0]?.children.map((i) => i.title)).toEqual(['Deep', 'Back'])
})

test('siblings after a depth jump stay siblings', () => {
  const result = parseOutline(outline([item(0, 'A'), item(2, 'X'), item(2, 'Y')]))
  expect(result.items).toHaveLength(1)
  expect(result.items[0]?.children.map((i) => i.title)).toEqual(['X', 'Y'])
  expect(result.items[0]?.children[0]?.children).toEqual([])
})

test.each([1.5, -1])('a depth of %s throws an EngineError', (depth) => {
  expect(() => parseOutline(outline([item(depth, 'Bad')]))).toThrow(EngineError)
})

test('an outline whose first item is not at depth 0 still has roots', () => {
  const result = parseOutline(outline([item(3, 'Odd'), item(0, 'Next')]))
  expect(result.items.map((i) => i.title)).toEqual(['Odd', 'Next'])
})

test('flags 3 is bold and italic, and count and targets carry over', () => {
  const result = parseOutline(
    outline(
      [
        item(0, 'Both', {
          flags: 3,
          count: -2,
          dest: dest({ page: 1 }),
        }),
        item(0, 'Bold', { flags: 2 }),
        item(0, 'Italic', { flags: 1 }),
        item(0, 'Plain'),
      ],
      true
    )
  )
  expect(result.truncated).toBe(true)
  const [both, bold, italic, plain] = result.items
  expect(both).toMatchObject({ bold: true, italic: true, count: -2 })
  expect(both?.destination).toEqual(parsedDest({ page: 1 }))
  expect(bold).toMatchObject({ bold: true, italic: false })
  expect(italic).toMatchObject({ bold: false, italic: true })
  expect(plain).toMatchObject({ bold: false, italic: false })
  expect(plain).not.toHaveProperty('destination')
  expect(plain).not.toHaveProperty('action')
})

test('a named destination is a destination, and the text null is undefined', () => {
  expect(
    parseNamedDestination(
      JSON.stringify(
        dest({
          page: 1,
          fit: 'XYZ',
          args: [72, 500, null, null],
          argCount: 2,
          argKinds: ['number', 'number'],
        })
      )
    )
  ).toEqual(
    parsedDest({
      page: 1,
      fit: 'XYZ',
      args: [72, 500, null, null],
      argCount: 2,
      argKinds: ['number', 'number'],
    })
  )
  expect(parseNamedDestination('null')).toBeUndefined()
})

test.each([
  ['not JSON', (s: string) => parsePageLinks(s), '{oops'],
  ['links', (s: string) => parsePageLinks(s), '{"annots":[],"links":[{"index":0}]}'],
  ['an outline', (s: string) => parseOutline(s), '[]'],
  [
    'bad hex',
    (s: string) => parsePageLinks(s),
    '{"annots":[],"links":[{"index":0,"rect":[0,0,1,1],"action":{"s":"URI","uriHex":"zz"}}]}',
  ],
  ['a destination', (s: string) => parseNamedDestination(s), '"x"'],
])('malformed JSON (%s) throws an EngineError', (_, parse, text) => {
  expect(() => parse(text)).toThrow(EngineError)
  expect(() => parse(text)).toThrow(
    expect.objectContaining({ code: 'engine-failure' }) as Error
  )
})

test("a destination's shape comes through as the file wrote it", () => {
  const { links } = parsePageLinks(
    pageLinks([
      link({
        dest: dest({
          pageRef: [7, 2],
          fit: 'Unknown',
          argCount: 9,
          argKinds: [
            'number',
            'null',
            'other',
            'number',
            'number',
            'number',
            'null',
            'null',
          ],
          argIndirect: true,
          fitKind: 'string',
          pageKind: 'other',
        }),
      }),
      link({
        index: 1,
        dest: dest({ pageRef: null, fitKind: 'missing', pageKind: 'missing' }),
      }),
    ])
  )
  expect(links[0]?.destination).toEqual(
    parsedDest({
      pageRef: { objectNumber: 7, generation: 2 },
      fit: 'Unknown',
      argCount: 9,
      argKinds: ['number', 'null', 'other', 'number', 'number', 'number', 'null', 'null'],
      argIndirect: true,
      fitKind: 'string',
      pageKind: 'other',
    })
  )
  expect(links[1]?.destination).not.toHaveProperty('pageRef')
  expect(links[1]?.destination).toMatchObject({ fitKind: 'missing', pageKind: 'missing' })
})

test('a link whose /Dest is no destination says so, and has none', () => {
  const { links } = parsePageLinks(
    pageLinks([link({ destInvalid: true }), link({ index: 1, destInvalid: null })])
  )
  expect(links[0]).toMatchObject({ destinationInvalid: true })
  expect(links[0]).not.toHaveProperty('destination')
  expect(links[1]).not.toHaveProperty('destinationInvalid')
})

test('kinds of address and file, and a cut script, come through', () => {
  const { links } = parsePageLinks(
    pageLinks([
      link({ action: { s: 'URI', uriHex: hex('x'), uriKind: 'name' } }),
      link({ index: 1, action: { s: 'URI', uriHex: '', uriKind: null } }),
      link({
        index: 2,
        action: {
          s: 'Launch',
          fileHex: null,
          fileKind: null,
          dest: null,
          newWindow: null,
        },
      }),
      link({
        index: 3,
        action: { s: 'GoToR', fileHex: hex('a.pdf'), fileKind: 'string', dest: null },
      }),
      link({
        index: 4,
        action: { s: 'JavaScript', js: 'app.al', scriptTruncated: true },
      }),
      link({ index: 5, aa: { s: 'JavaScript', js: '' } }),
    ])
  )
  expect(links.map((l) => l.action ?? l.additionalAction)).toEqual([
    { kind: 'URI', uri: utf8('x'), uriKind: 'name' },
    { kind: 'URI', uri: new Uint8Array(0) },
    { kind: 'Launch' },
    { kind: 'GoToR', file: utf8('a.pdf'), fileKind: 'string' },
    { kind: 'JavaScript', script: 'app.al', scriptTruncated: true },
    { kind: 'JavaScript', script: '' },
  ])
})

test('an outline item carries the same facts in its destination and action', () => {
  const [entry] = parseOutline(
    outline([
      item(0, 'A', {
        dest: dest({ pageRef: [5, 1] }),
        action: { s: 'JavaScript', js: 'x', scriptTruncated: true },
      }),
    ])
  ).items
  expect(entry?.destination).toEqual(
    parsedDest({ pageRef: { objectNumber: 5, generation: 1 } })
  )
  expect(entry?.action).toEqual({
    kind: 'JavaScript',
    script: 'x',
    scriptTruncated: true,
  })
})

const malformedDest = (extra: object) => pageLinks([link({ dest: dest(extra) })])
const malformedAction = (action: object) => pageLinks([link({ action })])

test.each([
  ['an annotation without hasQuads', pageLinks([], [annot({ hasQuads: undefined })])],
  ['hasQuads not a boolean', pageLinks([], [annot({ hasQuads: 1 })])],
  [
    'an annotation without a generation',
    pageLinks([], [annot({ generation: undefined })]),
  ],
  ['a negative generation', pageLinks([], [annot({ generation: -1 })])],
  ['a fractional generation', pageLinks([], [annot({ generation: 0.5 })])],
  ['a generation on a direct object', pageLinks([], [annot({ obj: 0, generation: 1 })])],
  ['destInvalid false', pageLinks([link({ destInvalid: false })])],
  [
    'destInvalid beside a destination',
    pageLinks([link({ dest: dest(), destInvalid: true })]),
  ],
  ['no argCount', malformedDest({ argCount: undefined })],
  ['a negative argCount', malformedDest({ argCount: -1 })],
  ['argKinds not a list', malformedDest({ argKinds: 'number' })],
  ['an unknown argKind', malformedDest({ argCount: 1, argKinds: ['string'] })],
  [
    'argKinds shorter than argCount',
    malformedDest({ argCount: 2, argKinds: ['number'] }),
  ],
  [
    'more than 8 argKinds',
    malformedDest({ argCount: 9, argKinds: Array.from({ length: 9 }, () => 'null') }),
  ],
  ['argIndirect not a boolean', malformedDest({ argIndirect: 'no' })],
  ['an unknown fitKind', malformedDest({ fitKind: 'number' })],
  ['no fitKind', malformedDest({ fitKind: undefined })],
  ['an unknown pageKind', malformedDest({ pageKind: 'dictionary' })],
  ['a pageRef of one number', malformedDest({ pageRef: [3] })],
  ['a pageRef of three numbers', malformedDest({ pageRef: [3, 0, 1] })],
  ['a pageRef that is not a list', malformedDest({ pageRef: 3 })],
  ['no pageRef', malformedDest({ pageRef: undefined })],
  ['an unknown uriKind', malformedAction({ s: 'URI', uriHex: '', uriKind: 'stream' })],
  [
    'an unknown fileKind',
    malformedAction({ s: 'Launch', fileHex: null, fileKind: 'url' }),
  ],
  [
    'scriptTruncated false',
    malformedAction({ s: 'JavaScript', js: '', scriptTruncated: false }),
  ],
  [
    'scriptTruncated a string',
    malformedAction({ s: 'JavaScript', js: '', scriptTruncated: 'yes' }),
  ],
])('a malformed fact (%s) throws an EngineError', (_, text) => {
  expect(() => parsePageLinks(text)).toThrow(
    expect.objectContaining({ code: 'engine-failure' }) as Error
  )
})

test.each([
  ['a URI action without uriKind', { s: 'URI', uriHex: hex('x') }, 'uriKind'],
  [
    'a GoToR action without fileKind',
    { s: 'GoToR', fileHex: hex('a.pdf'), dest: null, newWindow: null },
    'fileKind',
  ],
  [
    'a Launch action without fileKind',
    { s: 'Launch', fileHex: null, dest: null, newWindow: null },
    'fileKind',
  ],
])('%s comes from another module and throws an EngineError', (_, action, key) => {
  expect(() => parsePageLinks(malformedAction(action))).toThrow(
    expect.objectContaining({
      code: 'engine-failure',
      message: "A page's links could not be read.",
      cause: expect.objectContaining({
        message: expect.stringContaining(`${key}:`) as unknown,
      }) as unknown,
    }) as Error
  )
})

test('an action of another kind needs neither uriKind nor fileKind', () => {
  const { links } = parsePageLinks(malformedAction({ s: 'Named', name: 'NextPage' }))
  expect(links[0]?.action).toEqual({ kind: 'Named', name: 'NextPage' })
})

test.each([
  [
    'argCount',
    malformedDest({ argCount: 1.5 }),
    'argCount: expected a whole number from 0',
  ],
  ['fitKind', malformedDest({ fitKind: 'number' }), 'fitKind: expected one of'],
  ['pageRef', malformedDest({ pageRef: [3] }), 'pageRef: expected two numbers'],
  ['hasQuads', pageLinks([], [annot({ hasQuads: 1 })]), 'hasQuads: expected a boolean'],
  [
    'scriptTruncated',
    malformedAction({ s: 'JavaScript', js: '', scriptTruncated: false }),
    'scriptTruncated: expected',
  ],
])('the cause names the key at fault (%s)', (_, text, cause) => {
  expect(() => parsePageLinks(text)).toThrow(
    expect.objectContaining({
      message: "A page's links could not be read.",
      cause: expect.objectContaining({
        message: expect.stringContaining(cause) as unknown,
      }) as unknown,
    }) as Error
  )
})
