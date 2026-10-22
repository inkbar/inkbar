import { fixtureBytes } from '@inkbar/fixtures'
import { describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../pdfjs/node-assets'

import { openDocument } from './document'

describe('openDocument', () => {
  it('reports pages with box, rotation and unrotated size', async () => {
    const doc = await openDocument(await fixtureBytes('text-rotated-90'), {
      assets: nodeAssets(),
    })
    await doc.ready
    expect(doc.status.get()).toEqual({ state: 'ready' })
    expect(doc.info).toMatchObject({
      pageCount: 1,
      isEncrypted: false,
      title: 'Inkbar fixture',
      author: 'Inkbar',
    })
    expect(doc.pages[0]).toEqual({
      index: 0,
      box: { x: 0, y: 0, width: 612, height: 792 },
      rotate: 90,
      userUnit: 1,
      width: 612,
      height: 792,
    })
    doc.destroy()
  })

  it('exposes the CropBox offset in box', async () => {
    const doc = await openDocument(await fixtureBytes('cropbox-offset'), {
      assets: nodeAssets(),
    })
    await doc.ready
    expect(doc.pages[0]!.box).toEqual({ x: 50, y: 50, width: 500, height: 700 })
    doc.destroy()
  })

  it('starts in the loading state while the source is still being fetched', async () => {
    let release!: (res: Response) => void
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
        })
    )
    const bytes = await fixtureBytes('text-simple')
    const pending = openDocument('https://x/doc.pdf', {
      assets: nodeAssets(),
      fetch: fetchImpl,
    })
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    release(new Response(new Uint8Array(bytes)))
    const doc = await pending
    expect(doc.key).toBe('https://x/doc.pdf')
    await doc.ready
    expect(doc.pages).toHaveLength(3)
    doc.destroy()
  })

  it('surfaces load errors through status and ready', async () => {
    const doc = await openDocument(await fixtureBytes('encrypted-aes'), {
      assets: nodeAssets(),
    })
    await expect(doc.ready).rejects.toMatchObject({ code: 'PasswordRequired' })
    const status = doc.status.get()
    expect(status.state).toBe('error')
    if (status.state === 'error') expect(status.error.code).toBe('PasswordRequired')
    expect(doc.pages).toEqual([])
    expect(doc.info.isEncrypted).toBe(true)
    await expect(doc.text(0)).rejects.toMatchObject({ code: 'PasswordRequired' })
  })

  it('opens an encrypted document with its password', async () => {
    const doc = await openDocument(await fixtureBytes('encrypted-aes'), {
      assets: nodeAssets(),
      password: 'inkbar',
    })
    await doc.ready
    expect(doc.info.isEncrypted).toBe(true)
    expect(doc.pages).toHaveLength(1)
    doc.destroy()
  })

  it('surfaces fetch failures as SourceFetchFailed', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('gone', { status: 404 })))
    const doc = await openDocument('https://x/missing.pdf', {
      assets: nodeAssets(),
      fetch: fetchImpl,
    })
    await expect(doc.ready).rejects.toMatchObject({
      code: 'SourceFetchFailed',
      details: { status: 404 },
    })
    expect(doc.status.get().state).toBe('error')
  })

  it('surfaces unreadable bytes as InvalidPdf', async () => {
    // PDF.js warns while it tries to recover the truncated file; expected here.
    const doc = await openDocument(await fixtureBytes('malformed-truncated'), {
      assets: nodeAssets(),
      verbosity: 0,
    })
    const status = doc.status.get()
    expect(status.state).toBe('error')
    if (status.state !== 'error') throw new Error('expected an error status')
    expect(status.error.code).toBe('InvalidPdf')
    await expect(doc.ready).rejects.toMatchObject({ code: 'InvalidPdf' })
    await expect(doc.ready).rejects.toBe(status.error)
    expect(doc.pages).toEqual([])
    expect(doc.info.isEncrypted).toBe(false)
    await expect(doc.text(0)).rejects.toBe(status.error)
  })

  it('reports each page box of a mixed-size document', async () => {
    const doc = await openDocument(await fixtureBytes('mixed-page-sizes'), {
      assets: nodeAssets(),
    })
    await doc.ready
    expect(doc.info.pageCount).toBe(4)
    expect(doc.pages.map((p) => p.box)).toEqual([
      { x: 0, y: 0, width: 612, height: 792 },
      { x: 0, y: 0, width: 595, height: 842 },
      { x: 0, y: 0, width: 842, height: 595 },
      { x: 0, y: 0, width: 300, height: 300 },
    ])
    expect(doc.pages.map((p) => [p.index, p.width, p.height, p.rotate])).toEqual([
      [0, 612, 792, 0],
      [1, 595, 842, 0],
      [2, 842, 595, 0],
      [3, 300, 300, 0],
    ])
    doc.destroy()
  })

  it('opens the same bytes twice without emptying the host buffer', async () => {
    const bytes = await fixtureBytes('text-simple')
    const length = bytes.byteLength
    const first = await openDocument(bytes, { assets: nodeAssets() })
    await first.ready
    expect(bytes.byteLength).toBe(length)
    const second = await openDocument(bytes, { assets: nodeAssets() })
    await second.ready
    expect(second.pages).toHaveLength(3)
    expect(bytes.byteLength).toBe(length)
    first.destroy()
    second.destroy()
  })

  it('retries an encrypted byte source with a password after PasswordRequired', async () => {
    const buffer = (await fixtureBytes('encrypted-aes')).slice().buffer
    const length = buffer.byteLength
    const locked = await openDocument(
      { data: buffer, key: 'enc' },
      { assets: nodeAssets() }
    )
    await expect(locked.ready).rejects.toMatchObject({ code: 'PasswordRequired' })
    expect(buffer.byteLength).toBe(length)
    const open = await openDocument(
      { data: buffer, key: 'enc' },
      { assets: nodeAssets(), password: 'inkbar' }
    )
    await open.ready
    expect(open.status.get()).toEqual({ state: 'ready' })
    locked.destroy()
    open.destroy()
  })

  it('throws AssetConfigMissing synchronously for a missing assets option', async () => {
    await expect(openDocument(new Uint8Array(), {} as never)).rejects.toMatchObject({
      code: 'AssetConfigMissing',
    })
  })

  it('rejects page lookups after destroy and out of range', async () => {
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    await doc.ready
    await expect(doc.text(7)).rejects.toMatchObject({ code: 'PageOutOfRange' })
    doc.destroy()
    await expect(doc.text(0)).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    await expect(doc._pdfjs.getPage(0)).rejects.toMatchObject({
      code: 'DocumentDestroyed',
    })
  })

  it('joins page text the way the page reads', async () => {
    const simple = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    await simple.ready
    expect(await simple.pageText(0)).toContain(
      'National Insurance number QQ123456C appears here.'
    )
    simple.destroy()

    const search = await openDocument(await fixtureBytes('text-search'), {
      assets: nodeAssets(),
    })
    await search.ready
    const text = await search.pageText(0)
    expect(text).toContain('Invoice')
    expect(text).not.toContain('  ')
    search.destroy()
  })
})
