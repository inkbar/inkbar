import { describe, expect, it, vi } from 'vitest'

import { assertAssets, sandboxDirectory, type PdfAssets } from './assets'

const good: PdfAssets = {
  engine: '/inkbar/inkbar-pdfium.wasm',
  worker: '/inkbar/worker.mjs',
  fonts: '/inkbar/fonts/',
  sandbox: '/inkbar/sandbox/',
}

/** The key `assertAssets` names for `value`, or `undefined` when it passes. */
function badKey(value: unknown): unknown {
  try {
    assertAssets(value)
    return undefined
  } catch (error) {
    expect(error).toMatchObject({ name: 'InkError', code: 'AssetConfigMissing' })
    return (error as { details: { key: unknown } }).details.key
  }
}

describe('assertAssets', () => {
  it('accepts the four keys', () => {
    expect(badKey(good)).toBeUndefined()
  })

  it('names the first key that is missing or empty', () => {
    for (const key of ['engine', 'worker', 'sandbox'] as const) {
      const { [key]: _gone, ...rest } = good
      expect(badKey(rest), `${key} missing`).toBe(key)
      expect(badKey({ ...good, [key]: '' }), `${key} empty`).toBe(key)
      expect(badKey({ ...good, [key]: 7 }), `${key} a number`).toBe(key)
    }
    expect(badKey({ ...good, fonts: undefined })).toBe('fonts')
    expect(badKey({ sandbox: '/s/' })).toBe('engine')
    expect(badKey({ engine: '/e.wasm', sandbox: '' })).toBe('worker')
  })

  it('names `engine` when there is no assets object at all', () => {
    expect(badKey(undefined)).toBe('engine')
    expect(badKey(null)).toBe('engine')
    expect(badKey('assets')).toBe('engine')
  })

  it('accepts a font directory with or without its trailing slash', () => {
    expect(badKey({ ...good, fonts: '/inkbar/fonts/' })).toBeUndefined()
    expect(badKey({ ...good, fonts: '/inkbar/fonts' })).toBeUndefined()
    expect(badKey({ ...good, fonts: 'fonts' })).toBeUndefined()
  })

  it('accepts a partial map of fonts, and false for none', () => {
    expect(badKey({ ...good, fonts: { japanese: '/jp.otf' } })).toBeUndefined()
    expect(badKey({ ...good, fonts: {} })).toBeUndefined()
    expect(badKey({ ...good, fonts: false })).toBeUndefined()
  })

  it('names `fonts` for anything else', () => {
    for (const fonts of [3, true, '', null, ['/a.otf']])
      expect(badKey({ ...good, fonts }), JSON.stringify(fonts)).toBe('fonts')
  })

  it('names a key whose URL cannot be read against the page', () => {
    vi.stubGlobal('document', { baseURI: 'https://app.example.com/viewer/' })
    try {
      for (const key of ['engine', 'worker', 'sandbox'] as const) {
        expect(badKey({ ...good, [key]: 'http://' }), key).toBe(key)
        expect(() => assertAssets({ ...good, [key]: 'http://' })).toThrow(/http:\/\//)
      }
      expect(badKey({ ...good, fonts: 'https://[nope/' })).toBe('fonts')
      expect(badKey({ ...good, fonts: { korean: 'http://' } })).toBe('fonts')
      expect(badKey(good)).toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('names the key in its message', () => {
    expect(() => assertAssets({ ...good, sandbox: '' })).toThrow(/`sandbox`/)
  })
})

describe('sandboxDirectory', () => {
  it('ends the directory in a slash, whether or not it was given one', () => {
    expect(sandboxDirectory({ sandbox: '/x/sandbox' })).toBe('/x/sandbox/')
    expect(sandboxDirectory({ sandbox: '/x/sandbox/' })).toBe('/x/sandbox/')
  })
})
