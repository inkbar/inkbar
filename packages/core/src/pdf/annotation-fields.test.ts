import { fixtureBytes, type FixtureName } from '@inkbar/fixtures'
import { describe, expect, it } from 'vitest'

import callouts from '../model/annotations/__fixtures__/standard-callout.json'

import {
  fontFromBaseName,
  readFreeTextFields,
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
