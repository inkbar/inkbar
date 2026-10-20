import { deflateSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { parseValue, PdfSyntaxError, type PdfDict } from './lexer'
import { decodeStream } from './stream'

const b = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0))
const dict = (s: string): PdfDict => parseValue(b(s), 0).value as PdfDict
const text = (u: Uint8Array): string => String.fromCharCode(...u)

describe('decodeStream', () => {
  it('inflates FlateDecode', async () => {
    const data = deflateSync('hello')
    const out = await decodeStream(
      data,
      dict('<< /Filter /FlateDecode >>'),
      0,
      data.length
    )
    expect(text(out)).toBe('hello')
  })

  it('undoes PNG Up predictor', async () => {
    const data = deflateSync(Uint8Array.from([2, 1, 2, 3, 2, 1, 1, 1]))
    const d = dict(
      '<< /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 3 >> >>'
    )
    const out = await decodeStream(data, d, 0, data.length)
    expect([...out]).toEqual([1, 2, 3, 2, 3, 4])
  })

  it('undoes PNG filter types 0, 1, 3 and 4', async () => {
    const rows = [0, 5, 6, 7, 1, 1, 1, 1, 3, 2, 2, 2, 4, 1, 1, 1]
    const data = deflateSync(Uint8Array.from(rows))
    const d = dict(
      '<< /Filter [/FlateDecode] /DecodeParms [<< /Predictor 15 /Columns 3 >>] >>'
    )
    const out = await decodeStream(data, d, 0, data.length)
    expect([...out]).toEqual([5, 6, 7, 1, 2, 3, 2, 4, 5, 3, 5, 6])
  })

  it('returns raw bytes when there is no filter', async () => {
    const out = await decodeStream(b('xxabc\nendstream'), dict('<< >>'), 2, 3)
    expect(text(out)).toBe('abc')
  })

  it('rejects other filters', async () => {
    const data = b('abc')
    await expect(
      decodeStream(data, dict('<< /Filter /LZWDecode >>'), 0, 3)
    ).rejects.toThrow()
    await expect(
      decodeStream(data, dict('<< /Filter [/FlateDecode /ASCII85Decode] >>'), 0, 3)
    ).rejects.toThrow()
  })

  it('falls back to endstream when /Length is missing or wrong', async () => {
    const src = b('abc\r\nendstream endobj')
    expect(text(await decodeStream(src, dict('<< >>'), 0, undefined))).toBe('abc')
    expect(text(await decodeStream(src, dict('<< >>'), 0, 99))).toBe('abc')
    expect(text(await decodeStream(src, dict('<< >>'), 0, 1))).toBe('abc')
  })

  it('rejects /DecodeParms that is not a dictionary', async () => {
    const data = deflateSync('hello')
    for (const parms of ['5 0 R', '7', '[ 5 0 R ]']) {
      await expect(
        decodeStream(
          data,
          dict(`<< /Filter /FlateDecode /DecodeParms ${parms} >>`),
          0,
          data.length
        )
      ).rejects.toThrow(PdfSyntaxError)
    }
  })
})
