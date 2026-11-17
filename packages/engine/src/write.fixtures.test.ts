import { readFile } from 'node:fs/promises'
import { deflateSync, inflateSync } from 'node:zlib'

import { fixtureBytes } from '@inkbar/fixtures'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createEngine, EngineError, type Engine } from './index.ts'
import { EngineCore } from './native/core.ts'
import { loadNative } from './native/module.ts'
import { withFunctions } from './native/testing.ts'
import { qpdfAvailable, qpdfCheck, qpdfQdf, requireQpdfInCi } from './qpdf.testing.ts'

import type { Native } from './native/functions.ts'
import type { Appearance, Rect, WriteAnnotation, WriteInput } from './types.ts'
import type { Annotation as GlossAnnotation, Rect as GlossRect } from 'gloss-format'

let engine: Engine
let wasm: Uint8Array
let opened: Uint8Array
/** Every file a test saved, for the closing `qpdf --check`. */
const saves: { name: string; bytes: Uint8Array }[] = []

beforeAll(async () => {
  wasm = await readFile(new URL('../vendor/inkbar-pdfium.wasm', import.meta.url))
  engine = await createEngine({ wasm, worker: false })
  opened = await fixtureBytes('text-simple')
  requireQpdfInCi()
})

afterAll(async () => {
  await engine.destroy()
})

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1')
/**
 * A saved file with its /ID blanked. The fixture has none, so PDFium makes a new one on every
 * save, and two saves of the same document differ only there.
 */
const withoutId = (bytes: Uint8Array) =>
  latin1(bytes).replace(/\/ID\s*\[\s*<[0-9A-F]*>\s*<[0-9A-F]*>\s*\]/i, '/ID[]')
const ascii = (text: string) => new TextEncoder().encode(text)
const rect = (x: number, y: number, width: number, height: number): GlossRect => ({
  x,
  y,
  width,
  height,
})

/** An appearance that fills its bounds with one RGB colour. */
function fill(bounds: Rect, rgb: [number, number, number] = [0, 0, 1]): Appearance {
  const { x, y, width, height } = bounds
  return {
    bounds,
    content: ascii(`${rgb.join(' ')} rg ${x} ${y} ${width} ${height} re f`),
  }
}

/** The entries every Gloss annotation here shares. */
function common(id: string, bounds: GlossRect) {
  return {
    id,
    page: 0,
    rect: bounds,
    color: '#ff8000',
    opacity: 0.75,
    author: 'Ada Lovelace',
    contents: `About ${id}`,
    createdAt: '2026-11-17T09:30:00Z',
    modifiedAt: '2026-11-17T10:45:15+01:00',
  }
}

/** One annotation on page 0 with a plain fill as its appearance. */
function item(annotation: GlossAnnotation, data = `{"id":"${annotation.id}"}`) {
  return {
    page: 0,
    annotation,
    appearance: fill(annotation.rect),
    data,
  } satisfies WriteAnnotation
}

/** Opens the fixture, writes `input`, saves and closes. The saved file is kept for qpdf. */
async function written(name: string, input: WriteInput): Promise<Uint8Array> {
  const doc = await engine.open(opened)
  try {
    await doc.write(input)
    const bytes = await doc.save()
    saves.push({ name, bytes })
    return bytes
  } finally {
    await doc.close()
  }
}

/** What PDF.js reads of a page's annotations. */
interface PdfjsAnnotation {
  id: string
  subtype: string
  annotationFlags: number
  hasAppearance: boolean
  contentsObj: { str: string }
  color: Uint8ClampedArray | null
  modificationDate: string | null
  quadPoints?: Float32Array | null
  name?: string
  lineCoordinates?: number[]
  lineEndings?: string[]
  vertices?: Float32Array | null
  inkLists?: Float32Array[]
  inReplyTo?: string | null
}

async function pdfjsAnnotations(saved: Uint8Array, page = 0): Promise<PdfjsAnnotation[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(saved), verbosity: 0 })
  try {
    const pdf = await task.promise
    const annotations: unknown[] = await (
      await pdf.getPage(page + 1)
    ).getAnnotations({ intent: 'any' })
    return annotations as PdfjsAnnotation[]
  } finally {
    await task.destroy()
  }
}

/** The object number in a PDF.js annotation id such as `12R`. */
const objectNumber = (id: string) => Number.parseInt(id, 10)

/** The text of object `number` in a file with no object streams, from `obj` to `endobj`. */
function objectText(saved: Uint8Array, number: number): string {
  const text = latin1(saved)
  const start = new RegExp(`(?:^|\\s)${number} 0 obj\\b`).exec(text)
  if (!start) throw new Error(`no object ${number}`)
  return text.slice(start.index, text.indexOf('endobj', start.index))
}

/** The one annotation PDF.js reads from page 0, with its dictionary's text. */
async function only(saved: Uint8Array) {
  const annotations = await pdfjsAnnotations(saved)
  expect(annotations).toHaveLength(1)
  const read = annotations[0] as PdfjsAnnotation
  return { read, dict: objectText(saved, objectNumber(read.id)) }
}

/** The engine reopens the saved file and renders its first page. */
async function reopens(saved: Uint8Array) {
  const doc = await engine.open(saved)
  try {
    expect(doc.pageCount).toBe(3)
    return await doc.renderPage(0)
  } finally {
    await doc.close()
  }
}

/** Asserts the entries every written annotation carries. */
function expectCommon(read: PdfjsAnnotation, dict: string, id: string, subtype: string) {
  expect(read.subtype).toBe(subtype)
  expect(dict).toMatch(new RegExp(`/NM\\s*\\(${id}\\)`))
  expect(read.contentsObj.str).toBe(`About ${id}`)
  expect(dict).toMatch(/\/T\s*\(Ada Lovelace\)/)
  expect(read.modificationDate).toBe("D:20261117104515+01'00'")
  expect(dict).toMatch(/\/CreationDate\s*\(D:20261117093000Z\)/)
  expect(dict).toMatch(/\/CA\s*\.75\b|\/CA\s*0\.75\b/)
  expect(dict).toMatch(/\/F\s*4\b/)
  expect(read.annotationFlags).toBe(4)
}

const quad = (x: number, y: number, width: number, height: number) => ({
  p1: { x, y: y + height },
  p2: { x: x + width, y: y + height },
  p3: { x, y },
  p4: { x: x + width, y },
})

describe('writes each Gloss type so other programs can read it', () => {
  test.each([
    ['highlight', 'Highlight'],
    ['underline', 'Underline'],
    ['strikeout', 'StrikeOut'],
    ['squiggly', 'Squiggly'],
  ] as const)('writes a %s other programs can read', async (type, subtype) => {
    const bounds = rect(70, 700, 120, 30)
    const annotation = {
      ...common(type, bounds),
      type,
      quads: [quad(72, 702, 100, 12), quad(72, 715, 60, 12)],
    } satisfies GlossAnnotation
    const saved = await written(type, { annotations: [item(annotation)] })
    const { read, dict } = await only(saved)
    expectCommon(read, dict, type, subtype)
    expect([...(read.quadPoints ?? [])]).toEqual([
      72, 714, 172, 714, 72, 702, 172, 702, 72, 727, 132, 727, 72, 715, 132, 715,
    ])
    expect([...(read.color ?? [])]).toEqual([255, 128, 0])
    expect(read.hasAppearance).toBe(true)
    await reopens(saved)
  })

  test('writes a note with its icon', async () => {
    const annotation = {
      ...common('note', rect(300, 600, 20, 20)),
      type: 'text',
      icon: 'Key',
    } satisfies GlossAnnotation
    const saved = await written('note', { annotations: [item(annotation)] })
    const { read, dict } = await only(saved)
    expectCommon(read, dict, 'note', 'Text')
    // PDF.js reports the icon of a note with an appearance as NoIcon; the entry is in the file.
    expect(dict).toMatch(/\/Name\s*\/Key\b/)
    expect(read.hasAppearance).toBe(true)
    await reopens(saved)
  })

  test('writes a text box', async () => {
    const annotation = {
      ...common('box', rect(100, 400, 200, 60)),
      type: 'freetext',
      width: 1,
      defaultStyle: {
        fontFamily: 'Times New Roman',
        fontSize: 14,
        color: '#003366',
        textAlign: 'center',
        fontWeight: 'bold',
      },
    } satisfies GlossAnnotation
    const saved = await written('freetext', { annotations: [item(annotation)] })
    const { read, dict } = await only(saved)
    expectCommon(read, dict, 'box', 'FreeText')
    // PDF.js takes the font size and colour from the appearance when there is one, so the
    // default appearance string is read from the file: #003366, bold Times at 14 points.
    expect(dict).toMatch(/\/DA\s*\(0 \.2 \.4 rg \/\S*Times-Bold 14 Tf\)/)
    expect(dict).toMatch(/\/Q\s*1\b/)
    expect(dict).not.toMatch(/\/CL\b/)
    expect(dict).not.toMatch(/\/IT\b/)
    expect(read.hasAppearance).toBe(true)
    await reopens(saved)
  })

  test('writes a text box with a callout', async () => {
    const annotation = {
      ...common('callout', rect(100, 300, 250, 100)),
      type: 'freetext',
      width: 1,
      callout: [
        { x: 110, y: 310 },
        { x: 150, y: 340 },
        { x: 200, y: 340 },
      ],
      head: 'OpenArrow',
    } satisfies GlossAnnotation
    const saved = await written('callout', { annotations: [item(annotation)] })
    const { read, dict } = await only(saved)
    expectCommon(read, dict, 'callout', 'FreeText')
    expect(dict).toMatch(/\/CL\s*\[\s*110\s+310\s+150\s+340\s+200\s+340\s*\]/)
    expect(dict).toMatch(/\/IT\s*\/FreeTextCallout/)
    expect(dict).toMatch(/\/LE\s*\/OpenArrow/)
    expect(read.hasAppearance).toBe(true)
    await reopens(saved)
  })

  test.each([
    ['square', 'Square'],
    ['circle', 'Circle'],
  ] as const)(
    'writes a %s with its interior colour and border',
    async (type, subtype) => {
      const annotation = {
        ...common(type, rect(200, 200, 80, 50)),
        type,
        width: 3,
        interiorColor: '#00ff00',
      } satisfies GlossAnnotation
      const saved = await written(type, { annotations: [item(annotation)] })
      const { read, dict } = await only(saved)
      expectCommon(read, dict, type, subtype)
      expect(dict).toMatch(/\/IC\s*\[\s*0\s+1\s+0\s*\]/)
      expect(dict).toMatch(/\/Border\s*\[\s*0\s+0\s+3\s*\]/)
      expect(read.hasAppearance).toBe(true)
      await reopens(saved)
    }
  )

  test('writes a line with its end points and endings', async () => {
    const annotation = {
      ...common('line', rect(90, 90, 120, 70)),
      type: 'line',
      start: { x: 100, y: 100 },
      end: { x: 200, y: 150 },
      width: 2,
      head: 'Circle',
      tail: 'ClosedArrow',
    } satisfies GlossAnnotation
    const saved = await written('line', { annotations: [item(annotation)] })
    const { read, dict } = await only(saved)
    expectCommon(read, dict, 'line', 'Line')
    expect(read.lineCoordinates).toEqual([100, 100, 200, 150])
    expect(read.lineEndings).toEqual(['Circle', 'ClosedArrow'])
    expect(read.hasAppearance).toBe(true)
    await reopens(saved)
  })

  test.each([
    ['polyline', 'PolyLine'],
    ['polygon', 'Polygon'],
  ] as const)('writes a %s with its vertices', async (type, subtype) => {
    const vertices = [
      { x: 300, y: 300 },
      { x: 350, y: 380 },
      { x: 400, y: 310 },
    ]
    const annotation = {
      ...common(type, rect(295, 295, 110, 90)),
      type,
      width: 2,
      vertices,
    } satisfies GlossAnnotation
    const saved = await written(type, { annotations: [item(annotation)] })
    const { read, dict } = await only(saved)
    expectCommon(read, dict, type, subtype)
    expect([...(read.vertices ?? [])]).toEqual([300, 300, 350, 380, 400, 310])
    expect(read.hasAppearance).toBe(true)
    await reopens(saved)
  })

  test('writes an ink drawing with its ink list', async () => {
    const annotation = {
      ...common('ink', rect(50, 50, 100, 100)),
      type: 'ink',
      width: 2,
      inklist: [
        [
          { x: 60, y: 60 },
          { x: 80, y: 90 },
          { x: 100, y: 70 },
        ],
        [
          { x: 120, y: 120 },
          { x: 140, y: 130 },
        ],
      ],
    } satisfies GlossAnnotation
    const saved = await written('ink', { annotations: [item(annotation)] })
    const { read, dict } = await only(saved)
    expectCommon(read, dict, 'ink', 'Ink')
    expect(read.inkLists?.map((list) => [...list])).toEqual([
      [60, 60, 80, 90, 100, 70],
      [120, 120, 140, 130],
    ])
    expect(read.hasAppearance).toBe(true)
    await reopens(saved)
  })

  test('writes a stamp', async () => {
    const annotation = {
      ...common('stamp', rect(400, 500, 100, 60)),
      type: 'stamp',
      imagedata: `data:image/png;base64,${Buffer.from(tinyPng()).toString('base64')}`,
    } satisfies GlossAnnotation
    const saved = await written('stamp', { annotations: [item(annotation)] })
    const { read, dict } = await only(saved)
    expectCommon(read, dict, 'stamp', 'Stamp')
    expect(read.hasAppearance).toBe(true)
    await reopens(saved)
  })

  test.each([
    ['circle', 'loupe'],
    ['circle', 'mask'],
    ['square', 'mask'],
  ] as const)('writes a %s marked as a %s as a stamp', async (type, kind) => {
    const annotation = {
      ...common(kind, rect(100, 100, 150, 150)),
      type,
      width: 1,
      custom: { inkbar: { type: kind } },
    } satisfies GlossAnnotation
    const saved = await written(`${type} ${kind}`, { annotations: [item(annotation)] })
    const { read, dict } = await only(saved)
    expectCommon(read, dict, kind, 'Stamp')
    expect(dict).not.toMatch(/\/IC\b/)
    expect(read.hasAppearance).toBe(true)
    await reopens(saved)
  })

  test('writes a redaction mark with its quad points and interior colour', async () => {
    const annotation = {
      ...common('redact', rect(70, 650, 120, 20)),
      type: 'redact',
      quads: [quad(72, 652, 110, 14)],
      interiorColor: '#000000',
      overlayText: 'Withheld',
    } satisfies GlossAnnotation
    const saved = await written('redact', { annotations: [item(annotation)] })
    const { read, dict } = await only(saved)
    expectCommon(read, dict, 'redact', 'Redact')
    expect(dict).toMatch(
      /\/QuadPoints\s*\[\s*72\s+666\s+182\s+666\s+72\s+652\s+182\s+652\s*\]/
    )
    expect(dict).toMatch(/\/IC\s*\[\s*0\s+0\s+0\s*\]/)
    expect(dict).toMatch(/\/OverlayText\s*\(Withheld\)/)
    expect(read.hasAppearance).toBe(true)
    await reopens(saved)
  })

  test('writes a reply: a hidden note linked to its parent, with no appearance', async () => {
    const parent = {
      ...common('parent', rect(300, 600, 20, 20)),
      type: 'text',
      icon: 'Comment',
    } satisfies GlossAnnotation
    const reply = {
      ...common('reply', rect(300, 600, 20, 20)),
      type: 'text',
      icon: 'Comment',
      inReplyTo: 'parent',
    } satisfies GlossAnnotation
    const saved = await written('reply', {
      annotations: [item(parent), { page: 0, annotation: reply, data: '{}' }],
    })
    const annotations = await pdfjsAnnotations(saved)
    expect(annotations.map((a) => a.subtype)).toEqual(['Text', 'Text'])
    const [first, second] = annotations as [PdfjsAnnotation, PdfjsAnnotation]
    const dict = objectText(saved, objectNumber(second.id))
    expect(dict).toMatch(/\/NM\s*\(reply\)/)
    expect(second.inReplyTo).toBe(first.id)
    expect(second.annotationFlags).toBe(2 | 4)
    expect(second.hasAppearance).toBe(false)
    expect(second.contentsObj.str).toBe('About reply')
    await reopens(saved)
  })
})

/** A 2x2 RGBA PNG, one pixel transparent. */
function tinyPng(): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (bytes: Uint8Array) => {
    let c = 0xffffffff
    for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] as number) ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Uint8Array) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc(body), body.length + 4)
    return out
  }
  const header = Buffer.from([0, 0, 0, 2, 0, 0, 0, 2, 8, 6, 0, 0, 0])
  const rows = Buffer.from([
    0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0, 0, 255,
  ])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** An appearance that names one resource of every kind, around a blue centre. */
function everyResource(bounds: Rect): Appearance {
  const { x, y, width, height } = bounds
  const group: Appearance & { group: boolean } = {
    bounds: rect(x, y, 20, 20),
    content: ascii(`1 0 0 rg ${x} ${y} 20 20 re f`),
    group: true,
    opacities: { Half: { fill: 0.5 } },
  }
  return {
    bounds,
    content: ascii(
      [
        `0 0 1 rg ${x} ${y} ${width} ${height} re f`,
        `q /GS0 gs 1 1 0 rg ${x + width - 20} ${y + height - 20} 20 20 re f Q`,
        `BT 0 g /F0 8 Tf ${x + 2} ${y + height - 10} Td (Hi) Tj ET`,
        `q 10 0 0 10 ${x + width - 12} ${y + 2} cm /Im0 Do Q`,
        `q 0.02 0 0 0.02 ${x + 30} ${y + 2} cm /P0 Do Q`,
        '/Fm0 Do',
      ].join('\n')
    ),
    fonts: { F0: 'Courier-Bold' },
    opacities: { GS0: { fill: 0.5, stroke: 0.25 } },
    images: { Im0: { format: 'png', data: tinyPng() } },
    pages: { P0: 1 },
    forms: { Fm0: group },
  }
}

test('installs the appearance it was given', async () => {
  const bounds = rect(200, 300, 160, 120)
  const annotation = {
    ...common('drawn', bounds),
    type: 'square',
    width: 1,
  } satisfies GlossAnnotation
  const saved = await written('every resource', {
    annotations: [{ page: 0, annotation, appearance: everyResource(bounds), data: '{}' }],
  })
  const page = await reopens(saved)
  // The page is 612 x 792 at one pixel per point; rows run top to bottom.
  const cx = bounds.x + bounds.width / 2
  const cy = 792 - (bounds.y + bounds.height / 2)
  const at = (cy * page.width + cx) * 4
  expect([...page.data.subarray(at, at + 4)]).toEqual([0, 0, 255, 255])
  const text = latin1(saved)
  expect(text).toMatch(/\/BaseFont\s*\/Courier-Bold/)
  expect(text).toMatch(/\/ca\s*\.5\b|\/ca\s*0\.5\b/)
  expect(text).toMatch(/\/CA\s*\.25\b|\/CA\s*0\.25\b/)
  expect(text).toMatch(/\/Subtype\s*\/Image/)
  expect(text).toMatch(/\/SMask/)
  expect(text).toMatch(/\/S\s*\/Transparency/)
  // The appearance, the nested group and the copy of page 1.
  expect(text.match(/\/Subtype\s*\/Form/g)?.length).toBeGreaterThanOrEqual(3)
})

/** The decoded stream that `/INKB_Gloss` refers to in an uncompressed-xref file. */
function glossStream(saved: Uint8Array): string {
  const text = latin1(saved)
  const ref = /\/INKB_Gloss\s+(\d+)\s+0\s+R/.exec(text)
  if (!ref) throw new Error('no /INKB_Gloss reference')
  const dict = objectText(saved, Number(ref[1]))
  const start = /stream\r?\n/.exec(dict)
  if (!start) throw new Error('no stream')
  const at = text.indexOf(dict) + start.index + start[0].length
  const end = text.indexOf('endstream', at)
  return inflateSync(Buffer.from(saved).subarray(at, end)).toString('utf8')
}

const DATA = '{"id":"kept","note":"données ✓"}'

function dataInput(): WriteInput {
  const annotation = {
    ...common('kept', rect(100, 100, 50, 50)),
    type: 'square',
    width: 1,
  } satisfies GlossAnnotation
  return { annotations: [item(annotation, DATA)] }
}

test('stores the data where a reader can inflate it', async () => {
  const saved = await written('data', dataInput())
  expect(glossStream(saved)).toBe(DATA)
})

test.skipIf(!qpdfAvailable)('stores the data', async () => {
  const saved = await written('data (qpdf)', dataInput())
  const qdf = await qpdfQdf(saved)
  const ref = /\/INKB_Gloss (\d+) 0 R/.exec(qdf)
  expect(ref).not.toBeNull()
  const object = new RegExp(
    `\\n${ref?.[1]} 0 obj\\n[\\s\\S]*?stream\\n([\\s\\S]*?)\\nendstream`
  )
  const stream = object.exec(qdf)?.[1]
  expect(Buffer.from(stream ?? '', 'latin1').toString('utf8')).toBe(DATA)
})

const square = (id: string, x: number) =>
  item({
    ...common(id, rect(x, 100, 40, 40)),
    type: 'square',
    width: 1,
  } satisfies GlossAnnotation)

test('removes the annotations it is told to', async () => {
  const saved = await written('two', {
    annotations: [square('first', 100), square('second', 200)],
  })
  const before = await pdfjsAnnotations(saved)
  expect(before).toHaveLength(2)
  const first = objectNumber((before[0] as PdfjsAnnotation).id)
  expect(objectText(saved, first)).toMatch(/\/NM\s*\(first\)/)

  const doc = await engine.open(saved)
  let after: Uint8Array
  try {
    await doc.write({ remove: [{ page: 0, objectNumber: first }] })
    after = await doc.save()
    saves.push({ name: 'one removed', bytes: after })
  } finally {
    await doc.close()
  }
  const left = await pdfjsAnnotations(after)
  expect(left).toHaveLength(1)
  expect(objectText(after, objectNumber((left[0] as PdfjsAnnotation).id))).toMatch(
    /\/NM\s*\(second\)/
  )
})

test('rejects a removal of an annotation the page does not have', async () => {
  const doc = await engine.open(opened)
  try {
    await expect(
      doc.write({ remove: [{ page: 0, objectNumber: 9999 }] })
    ).rejects.toMatchObject({
      name: 'EngineError',
      code: 'write-failed',
    })
  } finally {
    await doc.close()
  }
})

test('does not stack', async () => {
  const input = { annotations: [square('a', 100), square('b', 200)] }
  const doc = await engine.open(opened)
  let saved: Uint8Array
  try {
    await doc.write(input)
    await doc.write(input)
    saved = await doc.save()
    saves.push({ name: 'written twice', bytes: saved })
  } finally {
    await doc.close()
  }
  const annotations = await pdfjsAnnotations(saved)
  expect(annotations).toHaveLength(2)
  expect(latin1(saved).match(/\/INKB_Gloss/g)).toHaveLength(2)
})

test('copies the input when write is called', async () => {
  const written = square('copied', 200)
  const doc = await engine.open(opened)
  let saved: Uint8Array
  try {
    const pending = doc.write({ annotations: [written] })
    // Blue becomes red in the caller's array while the call waits in the queue.
    written.appearance.content.set(ascii('1 0 0 rg'))
    await pending
    saved = await doc.save()
  } finally {
    await doc.close()
  }
  const page = await reopens(saved)
  const at = ((792 - 120) * page.width + 220) * 4
  expect([...page.data.subarray(at, at + 4)]).toEqual([0, 0, 255, 255])
})

test('appends annotations to their pages in the order given', async () => {
  const saved = await written('order', {
    annotations: [
      square('one', 100),
      { ...square('other page', 100), page: 2 },
      square('two', 200),
      square('three', 300),
    ],
  })
  const names = (await pdfjsAnnotations(saved)).map(
    (a) => /\/NM\s*\(([^)]*)\)/.exec(objectText(saved, objectNumber(a.id)))?.[1]
  )
  expect(names).toEqual(['one', 'two', 'three'])
  expect(await pdfjsAnnotations(saved, 2)).toHaveLength(1)
})

/** A page-0 square whose appearance paints page 99, which the document lacks. */
const badPage = (): WriteInput => ({
  annotations: [
    {
      ...square('bad', 100),
      appearance: { ...fill(rect(100, 100, 40, 40)), pages: { P0: 99 } },
    },
  ],
})

describe('leaves the document as opened after a failed write', () => {
  test('with nothing written before', async () => {
    const plain = await engine.open(opened)
    const expected = await plain.save()
    await plain.close()

    const doc = await engine.open(opened)
    try {
      const failed = doc.write(badPage())
      await expect(failed).rejects.toMatchObject({
        name: 'EngineError',
        code: 'write-failed',
      })
      await expect(failed).rejects.toThrow(/bad/)
      expect(withoutId(await doc.save())).toBe(withoutId(expected))
    } finally {
      await doc.close()
    }
  })

  test('after a write that worked', async () => {
    const plain = await engine.open(opened)
    const expected = await plain.save()
    await plain.close()

    const doc = await engine.open(opened)
    try {
      await doc.write({ annotations: [square('fine', 100)] })
      await expect(doc.write(badPage())).rejects.toMatchObject({ code: 'write-failed' })
      expect(withoutId(await doc.save())).toBe(withoutId(expected))
      // The engine goes on working.
      await doc.write({ annotations: [square('fine', 100)] })
      expect(await pdfjsAnnotations(await doc.save())).toHaveLength(1)
    } finally {
      await doc.close()
    }
  })
})

test('rejects a reply whose parent is not written in the same call', async () => {
  const reply = {
    ...common('orphan', rect(300, 600, 20, 20)),
    type: 'text',
    icon: 'Comment',
    inReplyTo: 'missing',
  } satisfies GlossAnnotation
  const doc = await engine.open(opened)
  try {
    const failed = doc.write({
      annotations: [{ page: 0, annotation: reply, data: '{}' }],
    })
    await expect(failed).rejects.toMatchObject({ code: 'write-failed' })
    await expect(failed).rejects.toThrow(/orphan/)
  } finally {
    await doc.close()
  }
})

test('rejects an annotation without an appearance, naming it', async () => {
  const { appearance: _, ...bare } = square('bare', 100)
  const doc = await engine.open(opened)
  try {
    const failed = doc.write({ annotations: [bare] })
    await expect(failed).rejects.toMatchObject({ code: 'write-failed' })
    await expect(failed).rejects.toThrow(/bare/)
  } finally {
    await doc.close()
  }
})

test('rejects form values until they are supported, and takes an empty set', async () => {
  const doc = await engine.open(opened)
  try {
    const failed = doc.write({ fields: { name: { value: 'Ada' } } })
    await expect(failed).rejects.toMatchObject({ code: 'write-failed' })
    await expect(failed).rejects.toThrow(/form values/i)
    await expect(doc.write({ fields: {} })).resolves.toBeUndefined()
  } finally {
    await doc.close()
  }
})

describe('rejects with a RangeError', () => {
  const named = (appearance: Partial<Appearance>): WriteInput => ({
    annotations: [
      {
        ...square('named', 100),
        appearance: { ...fill(rect(100, 100, 40, 40)), ...appearance },
      },
    ],
  })

  test.each([
    ['a font name with a space', named({ fonts: { 'F 0': 'Helvetica' } })],
    ['an opacity name with a slash', named({ opacities: { '/GS0': { fill: 0.5 } } })],
    [
      'an empty image name',
      named({ images: { '': { format: 'png', data: tinyPng() } } }),
    ],
    ['a page name with a dash', named({ pages: { 'P-0': 0 } })],
    [
      'a nested form name with a dot',
      named({ forms: { 'Fm.0': fill(rect(100, 100, 10, 10)) } }),
    ],
    [
      'a bad name inside a nested form',
      named({
        forms: { Fm0: { ...fill(rect(100, 100, 10, 10)), fonts: { é: 'Courier' } } },
      }),
    ],
    [
      'an annotation page outside the document',
      { annotations: [{ ...square('far', 1), page: 3 }] },
    ],
    [
      'a removal on a page outside the document',
      { remove: [{ page: -1, objectNumber: 5 }] },
    ],
  ] satisfies [string, WriteInput][])(
    'for %s, before any native call',
    async (_, input) => {
      const native = await loadNative({ wasm })
      const calls: string[] = []
      const fn = new Proxy(native.fn, {
        get(target, key: keyof Native) {
          const real = target[key]
          return (...args: number[]) => {
            calls.push(key)
            return real(...args)
          }
        },
      })
      const core = new EngineCore(withFunctions(native, fn))
      try {
        const { id } = core.open(opened)
        calls.length = 0
        expect(() => core.write(id, input)).toThrow(RangeError)
        expect(calls).toEqual([])
      } finally {
        core.destroy()
      }
    }
  )
})

describe('frees what it allocates', () => {
  /** A core whose module records what is live: heap blocks, appearances, annotations, pages, documents. */
  async function counted() {
    const native = await loadNative({ wasm })
    const live = {
      blocks: new Set<number>(),
      appearances: new Set<number>(),
      annotations: new Set<number>(),
      pages: new Set<number>(),
      documents: new Set<number>(),
    }
    const fn = new Proxy(native.fn, {
      get(target, key: keyof Native) {
        const real = target[key] as (...args: number[]) => number
        return (...args: number[]) => {
          const result = real(...args)
          const [first = 0, , third = 0] = args
          switch (key) {
            case 'malloc':
              live.blocks.add(result)
              break
            case 'free':
              live.blocks.delete(first)
              break
            case 'INK_Appearance_New':
              if (result) live.appearances.add(result)
              break
            case 'INK_Appearance_Free':
              live.appearances.delete(first)
              break
            case 'INK_Appearance_AddForm':
              live.appearances.delete(third)
              break
            case 'INK_Annot_SetAppearance':
              live.appearances.delete(args[1] ?? 0)
              break
            case 'FPDFPage_CreateAnnot':
              if (result) live.annotations.add(result)
              break
            case 'FPDFPage_CloseAnnot':
              live.annotations.delete(first)
              break
            case 'FPDF_LoadPage':
              if (result) live.pages.add(result)
              break
            case 'FPDF_ClosePage':
              live.pages.delete(first)
              break
            case 'FPDF_LoadMemDocument64':
              if (result) live.documents.add(result)
              break
            case 'FPDF_CloseDocument':
              live.documents.delete(first)
              break
          }
          return result
        }
      },
    })
    const core = new EngineCore(withFunctions(native, fn))
    const snapshot = () => ({
      blocks: [...live.blocks].sort(),
      appearances: live.appearances.size,
      annotations: live.annotations.size,
      pages: live.pages.size,
      documents: live.documents.size,
    })
    return { core, snapshot }
  }

  const reply = {
    ...common('reply', rect(300, 600, 20, 20)),
    type: 'text',
    icon: 'Comment',
    inReplyTo: 'parent',
  } satisfies GlossAnnotation
  const parent = { ...square('parent', 300), page: 1 }
  const nested = (data: Uint8Array): Appearance => ({
    ...fill(rect(100, 100, 40, 40)),
    fonts: { F0: 'Helvetica' },
    forms: {
      Fm0: {
        ...fill(rect(100, 100, 10, 10)),
        group: true,
        forms: {
          Fm1: {
            ...fill(rect(100, 100, 5, 5)),
            images: { Im0: { format: 'png', data } },
          },
        },
      },
    },
  })
  const good: WriteInput = {
    annotations: [
      parent,
      square('plain', 100),
      { ...square('nested', 200), appearance: nested(tinyPng()) },
      // On another page than its parent, so the parent's handle outlives its page's turn.
      { page: 0, annotation: reply, data: '{}' },
    ],
  }

  test.each([
    ['a write that works', good, true],
    [
      'a bad image deep in the second annotation',
      {
        annotations: [
          square('plain', 100),
          { ...square('nested', 200), appearance: nested(ascii('not a png')) },
        ],
      },
      false,
    ],
    ['a page out of range', badPage(), false],
    [
      'a reply with no parent, after its siblings',
      { annotations: [square('plain', 100), { page: 0, annotation: reply, data: '{}' }] },
      false,
    ],
    [
      'a removal that fails',
      { annotations: [square('plain', 100)], remove: [{ page: 0, objectNumber: 9999 }] },
      false,
    ],
  ] satisfies [string, WriteInput, boolean][])('after %s', async (_, input, works) => {
    const { core, snapshot } = await counted()
    try {
      const { id } = core.open(opened)
      const before = snapshot()
      if (works) core.write(id, input)
      else expect(() => core.write(id, input)).toThrow(EngineError)
      expect(snapshot()).toEqual(before)
      expect(core.stopped).toBe(false)
    } finally {
      core.destroy()
    }
  })
})

test.skipIf(!qpdfAvailable)('every saved file passes qpdf --check', async () => {
  expect(saves.length).toBeGreaterThan(10)
  for (const { name, bytes } of saves)
    expect({ name, result: await qpdfCheck(bytes) }).toEqual({
      name,
      result: { ok: true },
    })
})
