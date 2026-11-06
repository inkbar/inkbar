import { describe, expect, it, vi } from 'vitest'

import { resolveSource, sourceFileName } from './source'

describe('resolveSource', () => {
  it('uses the URL string as the key', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(new Uint8Array([1, 2, 3])))
    )
    const s = resolveSource('https://x/doc.pdf?sig=1', fetchImpl)
    expect(s.key).toBe('https://x/doc.pdf?sig=1')
    expect([...(await s.bytes())]).toEqual([1, 2, 3])
    expect(fetchImpl).toHaveBeenCalledWith('https://x/doc.pdf?sig=1', {
      credentials: 'same-origin',
    })
  })

  it('keeps an explicit key separate from the URL', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(new Uint8Array([4]))))
    const s = resolveSource(
      { url: 'https://x/doc.pdf?sig=2', key: 'doc-42:v7' },
      fetchImpl
    )
    expect(s.key).toBe('doc-42:v7')
    expect([...(await s.bytes())]).toEqual([4])
    expect(fetchImpl).toHaveBeenCalledWith('https://x/doc.pdf?sig=2', {
      credentials: 'same-origin',
    })
  })

  it('wraps bytes with a generated key and the given key', async () => {
    const a = resolveSource(new Uint8Array([9]))
    const b = resolveSource(new Uint8Array([9]))
    expect(a.key).not.toBe(b.key)
    expect(a.key.startsWith('bytes:')).toBe(true)
    const c = resolveSource({ data: new Uint8Array([9]).buffer, key: 'k' })
    expect(c.key).toBe('k')
    expect([...(await c.bytes())]).toEqual([9])
  })

  it('reads Blob sources', async () => {
    const s = resolveSource(new Blob([new Uint8Array([5, 6])]))
    expect(s.key.startsWith('bytes:')).toBe(true)
    expect([...(await s.bytes())]).toEqual([5, 6])
  })

  it('maps HTTP failures to SourceFetchFailed with the status', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('no', { status: 403 })))
    const s = resolveSource('https://x/doc.pdf', fetchImpl)
    await expect(s.bytes()).rejects.toMatchObject({
      code: 'SourceFetchFailed',
      details: { url: 'https://x/doc.pdf', status: 403 },
    })
  })

  it('maps network errors to SourceFetchFailed', async () => {
    const network = new TypeError('Failed to fetch')
    const fetchImpl = vi.fn(() => Promise.reject(network))
    const s = resolveSource('https://x/doc.pdf', fetchImpl)
    await expect(s.bytes()).rejects.toMatchObject({
      code: 'SourceFetchFailed',
      cause: network,
    })
  })
})

describe('sourceFileName', () => {
  it("takes a URL's last path segment, decoded, without its query", () => {
    expect(sourceFileName('https://x/files/Site%20survey.pdf?sig=1#page=2')).toBe(
      'Site survey.pdf'
    )
    expect(sourceFileName({ url: '/docs/lease.pdf', key: 'lease' })).toBe('lease.pdf')
  })

  it("takes a File's name", () => {
    const file = new File([new Uint8Array([1])], 'Invoice 2041.pdf')
    expect(sourceFileName(file)).toBe('Invoice 2041.pdf')
  })

  it('adds .pdf to a name without it', () => {
    expect(sourceFileName('https://x/download/12345')).toBe('12345.pdf')
    expect(sourceFileName(new File([], 'scan'))).toBe('scan.pdf')
    expect(sourceFileName('https://x/report.PDF')).toBe('report.PDF')
  })

  it('falls back to document.pdf with no name to take', () => {
    expect(sourceFileName(new Uint8Array([1]))).toBe('document.pdf')
    expect(sourceFileName(new ArrayBuffer(1))).toBe('document.pdf')
    expect(sourceFileName({ data: new Uint8Array([1]), key: 'k' })).toBe('document.pdf')
    expect(sourceFileName(new Blob([]))).toBe('document.pdf')
    expect(sourceFileName('https://x/')).toBe('document.pdf')
  })
})
