import { deflateSync } from 'node:zlib'

import { fixtureBytes } from '@inkbar/fixtures'
import { describe, expect, it } from 'vitest'

import { dictGet, isDict, isName, type PdfValue } from './lexer'
import { openPdfObjects } from './objects'

const latin1 = (s: string): Uint8Array =>
  Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)
const str = (u: Uint8Array): string => String.fromCharCode(...u)

/** A classic-xref file whose object `n` is `objects[n - 1]`. */
function buildPdf(objects: string[]): Uint8Array {
  let out = '%PDF-1.4\n'
  const offsets = objects.map((body, i) => {
    const at = out.length
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
    return at
  })
  const xrefAt = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return latin1(out)
}

/**
 * Object 1 catalog, 2 an object stream holding object 4 (`/Length 3 0 R`), 3 the length,
 * 5 an uncompressed xref stream. `hybrid` puts the xref stream behind a classic table's /XRefStm.
 */
function buildObjectStreamPdf(hybrid: boolean): Uint8Array {
  // The header "4 0 " puts object 4 at offset 0; /First is the header's length.
  const header = '4 0 '
  const body = '<< /Hello 42 >>'
  const compressed = str(deflateSync(header + body))
  let out = '%PDF-1.5\n'
  const at: number[] = []
  const add = (n: number, text: string): void => {
    at[n] = out.length
    out += `${n} 0 obj\n${text}\nendobj\n`
  }
  add(1, '<< /Type /Catalog >>')
  at[2] = out.length
  out += `2 0 obj\n<< /Type /ObjStm /N 1 /First ${header.length} /Filter /FlateDecode /Length 3 0 R >>\nstream\n${compressed}\nendstream\nendobj\n`
  add(3, String(compressed.length))
  const row = (t: number, a: number, b: number): string =>
    String.fromCharCode(t, a >> 8, a & 255, b)
  const rows = [
    row(0, 0, 255),
    row(1, at[1]!, 0),
    row(1, at[2], 0),
    row(1, at[3]!, 0),
    row(2, 2, 0),
  ]
  const xrefStmAt = out.length
  const rowsWithSelf = [...rows, row(1, xrefStmAt, 0)].join('')
  out += `5 0 obj\n<< /Type /XRef /Size 6 /W [1 2 1] /Length ${rowsWithSelf.length} /Root 1 0 R >>\nstream\n${rowsWithSelf}\nendstream\nendobj\n`
  if (hybrid) {
    const tableAt = out.length
    out += `xref\n0 5\n0000000000 65535 f \n${String(at[1]).padStart(10, '0')} 00000 n \n${String(at[2]).padStart(10, '0')} 00000 n \n${String(at[3]).padStart(10, '0')} 00000 n \n0000000000 00000 f \n`
    out += `trailer\n<< /Size 6 /Root 1 0 R /XRefStm ${xrefStmAt} >>\nstartxref\n${tableAt}\n%%EOF\n`
  } else {
    out += `startxref\n${xrefStmAt}\n%%EOF\n`
  }
  return latin1(out)
}

const ref = (num: number) => ({ kind: 'ref' as const, num, gen: 0 })
const asDict = (v: PdfValue | undefined) => {
  if (!isDict(v)) throw new Error('expected a dictionary')
  return v
}

describe('openPdfObjects', () => {
  it('reads a classic xref', async () => {
    const objects = await openPdfObjects(
      buildPdf(['<< /Type /Catalog >>', '<< /Answer 42 >>', '7'])
    )
    const two = asDict(await objects!.get(ref(2)))
    expect(dictGet(two, 'Answer')).toBe(42)
    expect(await objects!.get(ref(3))).toBe(7)
  })

  it('reads xref streams and object streams', async () => {
    const objects = (await openPdfObjects(await fixtureBytes('object-streams')))!
    const root = asDict(await objects.resolve(dictGet(objects.trailer, 'Root')))
    expect(isName(dictGet(root, 'Type'), 'Catalog')).toBe(true)
    const pages = asDict(await objects.resolve(dictGet(root, 'Pages')))
    const kids = dictGet(pages, 'Kids') as PdfValue[]
    const page = asDict(await objects.resolve(kids[0]))
    expect(isName(dictGet(page, 'Type'), 'Page')).toBe(true)
  })

  it('resolves an indirect /Length', async () => {
    const objects = (await openPdfObjects(buildObjectStreamPdf(false)))!
    const four = asDict(await objects.get(ref(4)))
    expect(dictGet(four, 'Hello')).toBe(42)
  })

  it('honours /XRefStm in a hybrid file', async () => {
    const objects = (await openPdfObjects(buildObjectStreamPdf(true)))!
    const four = asDict(await objects.get(ref(4)))
    expect(dictGet(four, 'Hello')).toBe(42)
  })

  it('newest entry wins after an incremental update', async () => {
    // The update rewrites the page object to add /Annots (one Highlight) and appends the annotation.
    const objects = (await openPdfObjects(await fixtureBytes('incremental-saved')))!
    const root = asDict(await objects.resolve(dictGet(objects.trailer, 'Root')))
    const pages = asDict(await objects.resolve(dictGet(root, 'Pages')))
    const page = asDict(await objects.resolve((dictGet(pages, 'Kids') as PdfValue[])[0]))
    const annots = (await objects.resolve(dictGet(page, 'Annots'))) as PdfValue[]
    expect(annots).toHaveLength(1)
    const highlight = asDict(await objects.resolve(annots[0]))
    expect(isName(dictGet(highlight, 'Subtype'), 'Highlight')).toBe(true)
  })

  it('returns undefined for encrypted files', async () => {
    expect(await openPdfObjects(await fixtureBytes('encrypted-aes'))).toBeUndefined()
    expect(await openPdfObjects(await fixtureBytes('encrypted-rc4'))).toBeUndefined()
  })

  it('returns undefined when the xref cannot be read', async () => {
    expect(
      await openPdfObjects(await fixtureBytes('malformed-truncated'))
    ).toBeUndefined()
    expect(
      await openPdfObjects(await fixtureBytes('malformed-missing-xref'))
    ).toBeUndefined()
  })

  it('treats a reference with the wrong generation as missing', async () => {
    const objects = (await openPdfObjects(buildPdf(['<< >>', '<< /Answer 42 >>'])))!
    expect(await objects.get({ kind: 'ref', num: 2, gen: 1 })).toBeUndefined()
    expect(isDict(await objects.get(ref(2)))).toBe(true)
  })

  it('get returns undefined for missing, free and junk objects without throwing', async () => {
    const bytes = buildPdf(['<< /Type /Catalog >>', '<< >>'])
    const objects = (await openPdfObjects(bytes))!
    expect(await objects.get(ref(99))).toBeUndefined()
    expect(await objects.get(ref(0))).toBeUndefined()
    // Point object 2's offset at junk by corrupting its header.
    const text = str(bytes).replace('2 0 obj', 'zzzzzzz')
    const junk = (await openPdfObjects(latin1(text)))!
    expect(await junk.get(ref(2))).toBeUndefined()
    expect(await junk.resolve(5)).toBe(5)
  })
})
