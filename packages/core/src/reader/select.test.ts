import { afterEach, describe, expect, it } from 'vitest'

import { readerKind } from './select'

const flag = globalThis as { __INKBAR_READER__?: unknown }

afterEach(() => {
  delete flag.__INKBAR_READER__
})

describe('readerKind', () => {
  it('is pdfjs by default', () => {
    expect(readerKind()).toBe('pdfjs')
  })

  it.each([undefined, null, '', 'pdfjs', 'Engine', 'engine ', true, 1, {}])(
    'is pdfjs for %o',
    (value) => {
      flag.__INKBAR_READER__ = value
      expect(readerKind()).toBe('pdfjs')
    }
  )

  it('is engine for "engine", read on each call', () => {
    flag.__INKBAR_READER__ = 'engine'
    expect(readerKind()).toBe('engine')
    delete flag.__INKBAR_READER__
    expect(readerKind()).toBe('pdfjs')
  })
})
