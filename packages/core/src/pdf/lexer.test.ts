import { describe, expect, it } from 'vitest'

import { dictGet, isName, parseIndirect, parseValue, PdfSyntaxError } from './lexer'

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

  it('skips literal strings with nested and escaped parens, and hex strings', () => {
    const literal = '(a(b)\\)c)'
    expect(parseValue(b(`${literal} x`), 0)).toEqual({
      value: { kind: 'string' },
      end: literal.length,
    })
    expect(parseValue(b('<41 42>'), 0)).toEqual({ value: { kind: 'string' }, end: 7 })
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
