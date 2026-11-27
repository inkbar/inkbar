import { describe, expect, it } from 'vitest'

import { normalize, stableJson } from './stable-json'

describe('stableJson', () => {
  it('sorts keys at every depth, so the same data in another order is the same text', () => {
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      stableJson({ a: { c: 3, d: 2 }, b: 1 })
    )
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      '{ "a": { "c": 3, "d": 2 }, "b": 1 }\n'
    )
  })

  it('rounds every number to four decimals and writes -0 as 0', () => {
    expect(normalize([0.1 + 0.2, 1 / 3, 2.00004, 2.00005, -0, -0.00001])).toEqual([
      0.3, 0.3333, 2, 2.0001, 0, 0,
    ])
  })

  it('tells numbers apart that differ by a ten-thousandth', () => {
    expect(stableJson({ x: 72.0001 })).not.toBe(stableJson({ x: 72 }))
  })

  it('writes a number that is not finite as the string that names it', () => {
    expect(normalize([NaN, Infinity, -Infinity])).toEqual([
      'NaN',
      'Infinity',
      '-Infinity',
    ])
  })

  it('leaves out a key set to undefined and writes undefined in a list as null', () => {
    expect(stableJson({ a: undefined, b: [undefined, 1] })).toBe('{ "b": [null, 1] }\n')
  })

  it('writes what does not fit on one line one entry per line', () => {
    const long = 'x'.repeat(60)
    expect(stableJson({ a: long, b: { c: long } })).toBe(
      `{\n  "a": "${long}",\n  "b": { "c": "${long}" }\n}\n`
    )
  })

  it('packs a long list of plain values several to a line', () => {
    const text = stableJson({ list: [...Array(40).keys()] })
    const lines = text.split('\n')
    expect(lines.length).toBeLessThan(8)
    expect(lines.every((line) => line.length <= 100)).toBe(true)
    expect(JSON.parse(text)).toEqual({ list: [...Array(40).keys()] })
  })

  it('gives text that parses back to the data it wrote', () => {
    const data = {
      items: [
        { str: 'Hello "world"', quad: { p1: { x: 1.5, y: 2 } }, advances: [0, 0.5, 1] },
        { str: '', empty: [], none: {} },
      ],
    }
    expect(JSON.parse(stableJson(data))).toEqual(data)
  })

  it('refuses a value JSON cannot hold', () => {
    expect(() => stableJson({ n: 1n })).toThrow('bigint')
  })
})
