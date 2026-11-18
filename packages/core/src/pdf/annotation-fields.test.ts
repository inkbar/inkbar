import { fixtureBytes, type FixtureName } from '@inkbar/fixtures'
import { describe, expect, it } from 'vitest'

import callouts from '../model/annotations/__fixtures__/standard-callout.json'

import {
  fontFromBaseName,
  pdfjsIdOfRef,
  readFreeTextFields,
  INKBAR_DATA_MAX_BYTES,
  readInkbarData,
  readSavedAnnotationPlaces,
  readSavedAnnotations,
  readTextIcon,
  refOfPdfjsId,
} from './annotation-fields'
import { isDict, parseValue, type PdfRef, type PdfValue } from './lexer'
import { openPdfObjects, type PdfObjects } from './objects'

const twin = callouts.annotations[0]!
const RECT = [56.5, 516.5, 283.5, 663.5]

/** Annotation object numbers found by scanning the file's FreeText and Text dictionaries. */
async function annotRefs(name: FixtureName, subtype: string): Promise<PdfRef[]> {
  const objs = (await openPdfObjects(await fixtureBytes(name)))!
  const found: PdfRef[] = []
  for (let num = 1; num < 40; num++) {
    const ref: PdfRef = { kind: 'ref', num, gen: 0 }
    const v = await objs.get(ref)
    const st = isDict(v) ? v.entries.get('Subtype') : undefined
    if (isDict(v) && (st as { name?: string } | undefined)?.name === subtype)
      found.push(ref)
  }
  return found
}

async function open(name: FixtureName): Promise<PdfObjects> {
  return (await openPdfObjects(await fixtureBytes(name)))!
}

/** An in-memory object table whose object 1 is the annotation parsed from `dict`. */
function fake(dict: string): { objs: PdfObjects; ref: PdfRef } {
  const bytes = Uint8Array.from(dict, (c) => c.charCodeAt(0))
  const annot = parseValue(bytes, 0).value
  const ref: PdfRef = { kind: 'ref', num: 1, gen: 0 }
  const objs: PdfObjects = {
    trailer: { kind: 'dict', entries: new Map() },
    get: (r) => Promise.resolve(r.num === 1 ? annot : undefined),
    resolve: (v: PdfValue | undefined) =>
      v && (v as PdfRef).kind === 'ref' ? objs.get(v as PdfRef) : Promise.resolve(v),
    stream: () => Promise.resolve(undefined),
  }
  return { objs, ref }
}

const fields = (dict: string, rect = RECT, da?: string) => {
  const { objs, ref } = fake(dict)
  return readFreeTextFields(objs, ref, rect, da)
}

describe('refOfPdfjsId', () => {
  it('reads PDF.js object ids', () => {
    expect(refOfPdfjsId('12R')).toEqual({ kind: 'ref', num: 12, gen: 0 })
    expect(refOfPdfjsId('12R3')).toEqual({ kind: 'ref', num: 12, gen: 3 })
    expect(refOfPdfjsId('annot_4')).toBeUndefined()
    expect(refOfPdfjsId('R')).toBeUndefined()
  })
})

describe('fontFromBaseName', () => {
  it.each([
    ['Helvetica', { fontFamily: 'Helvetica' }],
    ['Helv', { fontFamily: 'Helvetica' }],
    [
      'Helvetica-BoldOblique',
      { fontFamily: 'Helvetica', fontWeight: 'bold', fontStyle: 'italic' },
    ],
    ['Times-Roman', { fontFamily: 'Times' }],
    ['TiRo', { fontFamily: 'Times' }],
    ['TimesNewRomanPS-BoldMT', { fontFamily: 'Times', fontWeight: 'bold' }],
    ['Times-Italic', { fontFamily: 'Times', fontStyle: 'italic' }],
    ['Courier', { fontFamily: 'Courier' }],
    ['Cour', { fontFamily: 'Courier' }],
    ['CourierNewPSMT', { fontFamily: 'Courier' }],
    ['ABCDEF+ArialMT', { fontFamily: 'Arial' }],
    ['Arial,Bold', { fontFamily: 'Arial', fontWeight: 'bold' }],
    ['Arial-BoldMT', { fontFamily: 'Arial', fontWeight: 'bold' }],
    ['Symbol', undefined],
    ['ZapfDingbats', undefined],
    ['ZaDb', undefined],
  ])('%s', (name, expected) => {
    expect(fontFromBaseName(name)).toEqual(expected)
  })
})

describe('readFreeTextFields on fixtures', () => {
  it.each(['standard-callout', 'callout-xref-stream'] as const)(
    '%s matches the JSON twin',
    async (name) => {
      const [ref] = await annotRefs(name, 'FreeText')
      const got = await readFreeTextFields(await open(name), ref!, RECT, 'Helv')
      expect(got.callout).toEqual(twin.callout)
      expect(got.fringe).toEqual(twin.fringe)
      expect(got.head).toBe('OpenArrow')
      expect(got.font).toEqual({ fontFamily: 'Helvetica' })
    }
  )

  it('callout-incremental reads the rewritten /CL', async () => {
    const [ref] = await annotRefs('callout-incremental', 'FreeText')
    const got = await readFreeTextFields(
      await open('callout-incremental'),
      ref!,
      RECT,
      undefined
    )
    expect(got.callout?.[0]).toEqual({ x: 80, y: 560 })
    expect(got.callout).toHaveLength(3)
    expect(got.fringe).toEqual(twin.fringe)
    expect(got.head).toBe('OpenArrow')
  })

  it('callout-bad-xref is skipped: the reader does not rebuild a broken cross-reference', async () => {
    expect(await openPdfObjects(await fixtureBytes('callout-bad-xref'))).toBeUndefined()
  })

  it('callout-encrypted is skipped', async () => {
    expect(await openPdfObjects(await fixtureBytes('callout-encrypted'))).toBeUndefined()
  })

  it('freetext-fonts resolves four fonts four ways', async () => {
    const objs = await open('freetext-fonts')
    const refs = await annotRefs('freetext-fonts', 'FreeText')
    expect(refs).toHaveLength(4)
    const das = ['F1', 'Helv', 'F2', 'F3']
    const got = await Promise.all(
      refs.map(
        async (ref, i) =>
          (await readFreeTextFields(objs, ref, [72, 0, 300, 30], das[i])).font
      )
    )
    expect(got).toEqual([
      { fontFamily: 'Times', fontWeight: 'bold', fontStyle: 'italic' },
      { fontFamily: 'Helvetica' },
      { fontFamily: 'Courier', fontStyle: 'italic' },
      { fontFamily: 'Arial', fontWeight: 'bold' },
    ])
  })
})

describe('readFreeTextFields on malformed values', () => {
  const GOOD_CL = '/CL [10 20 30 40]'
  const GOOD_RD = '/RD [1 2 3 4]'

  it('ignores a /CL of five numbers and keeps the rest', async () => {
    const got = await fields(`<< /CL [1 2 3 4 5] ${GOOD_RD} /LE /Diamond >>`)
    expect(got).toEqual({
      fringe: { left: 1, top: 2, right: 3, bottom: 4 },
      head: 'Diamond',
    })
  })

  it('ignores a /CL holding a name', async () => {
    const got = await fields(`<< /CL [1 2 /X 4] ${GOOD_RD} >>`)
    expect(got.callout).toBeUndefined()
    expect(got.fringe).toBeDefined()
  })

  it('accepts a two-point /CL', async () => {
    expect((await fields(`<< ${GOOD_CL} >>`)).callout).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ])
  })

  it.each([
    ['three numbers', '/RD [1 2 3]'],
    ['a negative', '/RD [1 -2 3 4]'],
    ['left + right at the width', '/RD [100 2 127 4]'],
    ['top + bottom at the height', '/RD [1 70 3 77]'],
  ])('rejects /RD with %s', async (_name, rd) => {
    const got = await fields(`<< ${GOOD_CL} ${rd} /LE /Draft_1 >>`, [0, 0, 227, 147])
    expect(got.fringe).toBeUndefined()
    expect(got.callout).toHaveLength(2)
    expect(got.head).toBe('Draft_1')
  })

  it('rejects /RD against an unusable rect', async () => {
    expect((await fields(`<< ${GOOD_RD} >>`, [])).fringe).toBeUndefined()
  })

  it('reads /LE arrays', async () => {
    expect((await fields('<< /LE [] >>')).head).toBeUndefined()
    expect((await fields('<< /LE [/Diamond /None] >>')).head).toBe('Diamond')
    expect((await fields('<< /LE [1 /None] >>')).head).toBeUndefined()
    expect((await fields('<< /LE /Draft_1 >>')).head).toBe('Draft_1')
  })

  it('returns nothing for a missing or non-dictionary object', async () => {
    const { objs } = fake('<< >>')
    expect(
      await readFreeTextFields(objs, { kind: 'ref', num: 9, gen: 0 }, RECT, 'F1')
    ).toEqual({})
    expect(await fields('[1 2]')).toEqual({})
  })

  it('gives no font for a bare resource id or a symbol face', async () => {
    for (const id of ['F1', 'TT0', 'FXF0', 'ZaDb', 'Symbol'])
      expect((await fields('<< >>', RECT, id)).font).toBeUndefined()
  })

  it('reads the Times and Courier aliases and not Courgette', async () => {
    expect((await fields('<< >>', RECT, 'TiRo')).font).toEqual({ fontFamily: 'Times' })
    expect((await fields('<< >>', RECT, 'Cour')).font).toEqual({ fontFamily: 'Courier' })
    expect(fontFromBaseName('Courgette', true)).toBeUndefined()
  })

  it('drops a head or icon that is not a valid PDF name', async () => {
    expect((await fields('<< /LE /a#20b >>')).head).toBeUndefined()
    const { objs, ref } = fake('<< /Subtype /Text /Name /a#20b >>')
    expect(await readTextIcon(objs, ref)).toBeUndefined()
  })

  it('falls back to the bare name when no /DR names the font', async () => {
    expect((await fields('<< >>', RECT, 'Helv')).font).toEqual({
      fontFamily: 'Helvetica',
    })
  })
})

describe('readTextIcon', () => {
  it('reads /Name from note-icon-ap', async () => {
    const [ref] = await annotRefs('note-icon-ap', 'Text')
    expect(await readTextIcon(await open('note-icon-ap'), ref!)).toBe('Key')
  })

  it('is undefined without a /Name', async () => {
    const { objs, ref } = fake('<< /Subtype /Text >>')
    expect(await readTextIcon(objs, ref)).toBeUndefined()
  })
})

const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)

/** A classic-xref file whose object `n` is `objects[n - 1]`; a body may hold binary stream data. */
function buildPdf(objects: (string | Uint8Array[])[]): Uint8Array {
  const parts: Uint8Array[] = [latin1('%PDF-1.7\n')]
  let length = parts[0]!.length
  const push = (p: Uint8Array) => {
    parts.push(p)
    length += p.length
  }
  const offsets = objects.map((body, i) => {
    const at = length
    push(latin1(`${i + 1} 0 obj\n`))
    for (const p of typeof body === 'string' ? [latin1(body)] : body) push(p)
    push(latin1('\nendobj\n'))
    return at
  })
  const xrefAt = length
  let tail = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) tail += `${String(o).padStart(10, '0')} 00000 n \n`
  tail += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  push(latin1(tail))
  const out = new Uint8Array(length)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** A stream object's body: its dictionary (without `/Length`) and data. */
const streamBody = (dict: string, data: Uint8Array): Uint8Array[] => [
  latin1(`<< ${dict} /Length ${data.length} >>\nstream\n`),
  data,
  latin1('\nendstream'),
]

const ref = (num: number): PdfRef => ({ kind: 'ref', num, gen: 0 })

describe('pdfjsIdOfRef', () => {
  it('gives the id PDF.js uses, which refOfPdfjsId reads back', () => {
    expect(pdfjsIdOfRef(ref(12))).toBe('12R')
    expect(pdfjsIdOfRef({ kind: 'ref', num: 12, gen: 3 })).toBe('12R3')
    expect(refOfPdfjsId(pdfjsIdOfRef({ kind: 'ref', num: 7, gen: 2 }))).toEqual({
      kind: 'ref',
      num: 7,
      gen: 2,
    })
  })
})

describe('readInkbarData', () => {
  const json = '{"v":1,"note":"café ✓"}'

  it('reads a Flate stream as UTF-8', async () => {
    const data = await deflate(new TextEncoder().encode(json))
    const objs = (await openPdfObjects(
      buildPdf([
        '<< /Type /Catalog >>',
        '<< /Type /Annot /Subtype /Square /INKB_Gloss 3 0 R >>',
        streamBody('/Filter /FlateDecode', data),
      ])
    ))!
    expect(await readInkbarData(objs, ref(2))).toBe(json)
  })

  it('reads an unfiltered stream', async () => {
    const objs = (await openPdfObjects(
      buildPdf([
        '<< /Type /Catalog >>',
        '<< /Type /Annot /Subtype /Square /INKB_Gloss 3 0 R >>',
        streamBody('', new TextEncoder().encode(json)),
      ])
    ))!
    expect(await readInkbarData(objs, ref(2))).toBe(json)
  })

  it('stops at 8 MB: data that inflates past it is not read, compressed or not', async () => {
    // Zeros compress about a thousand to one, so a few kilobytes inflate to megabytes.
    const fits = new Uint8Array(INKBAR_DATA_MAX_BYTES).fill(0x20)
    const tooLong = new Uint8Array(INKBAR_DATA_MAX_BYTES + 1).fill(0x20)
    const far = await deflate(new Uint8Array(64 * 1024 * 1024).fill(0x20))
    expect(far.length).toBeLessThan(128 * 1024)
    const objs = (await openPdfObjects(
      buildPdf([
        '<< /Type /Catalog >>',
        '<< /Type /Annot /Subtype /Square /INKB_Gloss 3 0 R >>',
        streamBody('/Filter /FlateDecode', await deflate(fits)),
        '<< /Type /Annot /Subtype /Square /INKB_Gloss 5 0 R >>',
        streamBody('/Filter /FlateDecode', await deflate(tooLong)),
        '<< /Type /Annot /Subtype /Square /INKB_Gloss 7 0 R >>',
        streamBody('/Filter /FlateDecode', far),
        '<< /Type /Annot /Subtype /Square /INKB_Gloss 9 0 R >>',
        streamBody('', tooLong),
      ])
    ))!
    expect((await readInkbarData(objs, ref(2)))?.length).toBe(INKBAR_DATA_MAX_BYTES)
    expect(await readInkbarData(objs, ref(4))).toBeUndefined()
    expect(await readInkbarData(objs, ref(6))).toBeUndefined()
    expect(await readInkbarData(objs, ref(8))).toBeUndefined()
    // Other streams have no cap.
    expect((await objs.stream(ref(7)))?.length).toBe(64 * 1024 * 1024)
  })

  it('is undefined without the entry, for an entry that is not a stream, or for bytes that are not UTF-8', async () => {
    const objs = (await openPdfObjects(
      buildPdf([
        '<< /Type /Catalog >>',
        '<< /Type /Annot /Subtype /Square >>',
        '<< /Type /Annot /Subtype /Square /INKB_Gloss (inline) >>',
        '<< /Type /Annot /Subtype /Square /INKB_Gloss 1 0 R >>',
        '<< /Type /Annot /Subtype /Square /INKB_Gloss 6 0 R >>',
        streamBody('', new Uint8Array([0xff, 0xfe, 0x41])),
        '<< /Type /Annot /Subtype /Square /INKB_Gloss 9 0 R >>',
      ])
    ))!
    for (const n of [2, 3, 4, 5, 7, 99])
      expect(await readInkbarData(objs, ref(n))).toBe(undefined)
  })
})

describe('readSavedAnnotationPlaces', () => {
  it("lists the annotations with Inkbar's data, in page and /Annots order", async () => {
    const data = streamBody('', latin1('{}'))
    const objs = (await openPdfObjects(
      buildPdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
        '<< /Type /Page /Parent 2 0 R /Annots [5 0 R 6 0 R] >>',
        '<< /Type /Page /Parent 2 0 R /Annots 7 0 R >>',
        '<< /Type /Annot /Subtype /Square /Rect [10 20 30 40] >>',
        '<< /Type /Annot /Subtype /Square /Rect [30 40 10 20] /M (D:20261117104515Z) /INKB_Gloss 9 0 R >>',
        '[8 0 R << /Type /Annot /INKB_Gloss 9 0 R >>]',
        '<< /Type /Annot /Subtype /Ink /Rect [1 2] /INKB_Gloss 9 0 R >>',
        data,
      ])
    ))!
    expect(await readSavedAnnotationPlaces(objs)).toEqual([
      {
        page: 0,
        ref: ref(6),
        rect: [10, 20, 30, 40],
        modified: 'D:20261117104515Z',
        popup: false,
      },
      { page: 1, ref: ref(8), rect: undefined, modified: undefined, popup: false },
    ])
  })

  it('says which have a pop-up, and lists every /IRT on the pages', async () => {
    const data = streamBody('', latin1('{}'))
    const objs = (await openPdfObjects(
      buildPdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /Annots [4 0 R 5 0 R 6 0 R 7 0 R] >>',
        '<< /Type /Annot /Subtype /Text /Rect [10 20 30 40] /INKB_Gloss 8 0 R /Popup 7 0 R >>',
        '<< /Type /Annot /Subtype /Text /Rect [10 20 30 40] /INKB_Gloss 8 0 R /IRT 4 0 R >>',
        '<< /Type /Annot /Subtype /Text /Rect [10 20 30 40] /IRT 4 0 R >>',
        '<< /Type /Annot /Subtype /Popup /Parent 4 0 R >>',
        data,
      ])
    ))!
    const { places, replies } = await readSavedAnnotations(objs)
    expect(places.map((p) => [p.ref.num, p.popup])).toEqual([
      [4, true],
      [5, false],
    ])
    expect(replies).toEqual([
      { from: ref(5), to: ref(4) },
      { from: ref(6), to: ref(4) },
    ])
  })

  it('is empty for a file without pages', async () => {
    const objs = (await openPdfObjects(buildPdf(['<< /Type /Catalog >>'])))!
    expect(await readSavedAnnotationPlaces(objs)).toEqual([])
  })
})
