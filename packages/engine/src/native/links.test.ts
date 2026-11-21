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

test('hex strings become bytes and null fields become absent keys', () => {
  const result = parsePageLinks(
    JSON.stringify({
      annots: [
        { index: 0, subtype: 'Link', flags: 4, obj: 12, rectOk: true, quadsOk: true },
      ],
      links: [
        {
          index: 0,
          rect: [10, 20, 110, 50],
          quads: null,
          dest: null,
          action: { s: 'URI', uriHex: hex('https://example.com/a') },
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
      rectOk: true,
      quadsOk: true,
    },
  ])
  const [link] = result.links
  expect(link).toEqual({
    index: 0,
    rect: { x: 10, y: 20, width: 100, height: 30 },
    action: { kind: 'URI', uri: utf8('https://example.com/a') },
  })
  expect(link).not.toHaveProperty('quads')
  expect(link).not.toHaveProperty('destination')
  expect(link).not.toHaveProperty('additionalAction')
})

test('a direct annotation has no object number', () => {
  const [entry] = parsePageLinks(
    JSON.stringify({
      annots: [
        { index: 2, subtype: 'Link', flags: 0, obj: 0, rectOk: false, quadsOk: true },
      ],
      links: [],
    })
  ).annotations
  expect(entry).not.toHaveProperty('objectNumber')
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
          dest: { page: -1, fit: 'XYZ', args: [72, null, null, null] },
          action: {
            s: 'GoToR',
            fileHex: hex('other.pdf'),
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
    destination: { page: -1, fit: 'XYZ', args: [72, null, null, null] },
    action: {
      kind: 'GoToR',
      file: utf8('other.pdf'),
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
          dest: { page: 1, fit: 'Fit', args: [null, null, null, null] },
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
  expect(both?.destination).toEqual({
    page: 1,
    fit: 'Fit',
    args: [null, null, null, null],
  })
  expect(bold).toMatchObject({ bold: true, italic: false })
  expect(italic).toMatchObject({ bold: false, italic: true })
  expect(plain).toMatchObject({ bold: false, italic: false })
  expect(plain).not.toHaveProperty('destination')
  expect(plain).not.toHaveProperty('action')
})

test('a named destination is a destination, and the text null is undefined', () => {
  expect(
    parseNamedDestination(
      JSON.stringify({ page: 1, fit: 'XYZ', args: [72, 500, null, null] })
    )
  ).toEqual({ page: 1, fit: 'XYZ', args: [72, 500, null, null] })
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
