import { describe, expect, it } from 'vitest'

import {
  dictGet,
  isName,
  parseIndirect,
  parseValue,
  PdfSyntaxError,
  textString,
} from './lexer'

const b = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0))

describe('parseValue', () => {
  it('parses numbers, booleans, null', () => {
    expect(parseValue(b('  -12.5 '), 0).value).toBe(-12.5)
    expect(parseValue(b('.5'), 0).value).toBe(0.5)
    expect(parseValue(b('true'), 0).value).toBe(true)
    expect(parseValue(b('false'), 0).value).toBe(false)
    expect(parseValue(b('null'), 0).value).toBeNull()
  })

  it('parses names with #xx escapes', () => {
    expect(parseValue(b('/A#20B'), 0).value).toEqual({ kind: 'name', name: 'A B' })
    expect(parseValue(b('/FreeTextCallout'), 0).value).toEqual({
      kind: 'name',
      name: 'FreeTextCallout',
    })
  })

  it('parses a reference before plain numbers', () => {
    expect(parseValue(b('[1 0 R 2 3]'), 0).value).toEqual([
      { kind: 'ref', num: 1, gen: 0 },
      2,
      3,
    ])
  })

  it('reads literal strings with nested and escaped parens, and hex strings', () => {
    const literal = '(a(b)\\)c)'
    expect(parseValue(b(`${literal} x`), 0)).toEqual({
      value: { kind: 'string', bytes: b('a(b))c') },
      end: literal.length,
    })
    expect(parseValue(b('<41 42>'), 0)).toEqual({
      value: { kind: 'string', bytes: b('AB') },
      end: 7,
    })
    expect(parseValue(b('<414>'), 0).value).toEqual({ kind: 'string', bytes: b('A@') })
  })

  it('decodes escapes in literal strings', () => {
    const s = parseValue(b('(a\\nb\\101\\\nc\\\\)'), 0).value
    expect(s).toEqual({ kind: 'string', bytes: b('a\nbAc\\') })
  })

  it('normalises CR and CRLF line ends in literal strings to LF', () => {
    expect(parseValue(b('(a\r\nb\rc\nd)'), 0).value).toEqual({
      kind: 'string',
      bytes: b('a\nb\nc\nd'),
    })
    // An escaped \r stays a CR.
    expect(parseValue(b('(a\\rb)'), 0).value).toEqual({
      kind: 'string',
      bytes: b('a\rb'),
    })
  })

  it('decodes text strings', () => {
    const utf16 = Uint8Array.from([0xfe, 0xff, 0x00, 0xa3, 0x00, 0x31])
    expect(textString({ kind: 'string', bytes: utf16 })).toBe('£1')
    const utf8 = Uint8Array.from([0xef, 0xbb, 0xbf, 0xc2, 0xa3])
    expect(textString({ kind: 'string', bytes: utf8 })).toBe('£')
    expect(textString({ kind: 'string', bytes: Uint8Array.from([0x41, 0x84]) })).toBe(
      'A—'
    )
    expect(textString({ kind: 'string', bytes: Uint8Array.from([0xa0, 0x35]) })).toBe(
      '€5'
    )
    expect(textString({ kind: 'name', name: 'x' })).toBeUndefined()
  })

  it('parses nested dicts and arrays', () => {
    const { value } = parseValue(
      b('<< /CL [1 2 3 4] /RD [1 2 3 4] /LE /OpenArrow /Sub << /A 1 >> >>'),
      0
    )
    expect(value).toMatchObject({ kind: 'dict' })
    const dict = value as Parameters<typeof dictGet>[0]
    expect(dictGet(dict, 'CL')).toEqual([1, 2, 3, 4])
    expect(dictGet(dict, 'RD')).toEqual([1, 2, 3, 4])
    expect(isName(dictGet(dict, 'LE'), 'OpenArrow')).toBe(true)
    expect(isName(dictGet(dict, 'LE'), 'Other')).toBe(false)
    expect(dictGet(dict, 'Missing')).toBeUndefined()
    const sub = dictGet(dict, 'Sub') as Parameters<typeof dictGet>[0]
    expect(dictGet(sub, 'A')).toBe(1)
  })

  it('skips comments', () => {
    expect(parseValue(b('% x\n42'), 0).value).toBe(42)
  })

  it('throws PdfSyntaxError on junk', () => {
    expect(() => parseValue(b(')'), 0)).toThrow(PdfSyntaxError)
    expect(() => parseValue(b('[1 2'), 0)).toThrow(PdfSyntaxError)
    expect(() => parseValue(b('<< /A'), 0)).toThrow(PdfSyntaxError)
    expect(() => parseValue(b(''), 0)).toThrow(PdfSyntaxError)
  })
})

describe('parseIndirect', () => {
  it('reads the object and stream start', () => {
    const src = '7 0 obj << /Length 3 >> stream\r\nabc\nendstream endobj'
    const obj = parseIndirect(b(src), 0)
    expect(obj.num).toBe(7)
    expect(obj.gen).toBe(0)
    expect(obj.streamStart).toBe(src.indexOf('abc'))
    expect(dictGet(obj.value as Parameters<typeof dictGet>[0], 'Length')).toBe(3)
  })

  it('has no streamStart for plain objects', () => {
    const obj = parseIndirect(b('3 1 obj 42 endobj'), 0)
    expect(obj).toEqual({ num: 3, gen: 1, value: 42 })
  })

  it('throws when the header is not an object', () => {
    expect(() => parseIndirect(b('7 0 foo 1'), 0)).toThrow(PdfSyntaxError)
  })
})
