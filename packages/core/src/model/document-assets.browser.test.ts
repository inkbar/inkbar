// What a document does when one of the files `assets` names cannot be fetched. Only the engine's
// two files fail the open; a font draws its text with a substitute and a sandbox leaves the form
// without scripts.
import { browserAssets, fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPageRenderer } from '../dom/page-renderer'
import { mountContainer } from '../dom/test-utils'
import { createPageTransform } from '../dom/transform'

import { openDocument, type InkDocument } from './document'

import type { PdfAssets } from './assets'
import type { InkError } from './errors'

const opened: InkDocument[] = []
const cleanup: (() => void)[] = []
afterEach(() => {
  vi.restoreAllMocks()
  cleanup.splice(0).forEach((f) => f())
  opened.splice(0).forEach((d) => d.destroy())
})

async function open(name: FixtureName, assets: Partial<PdfAssets>): Promise<InkDocument> {
  const doc = await openDocument(fixtureUrl(name), {
    assets: { ...browserAssets(), ...assets },
  })
  opened.push(doc)
  return doc
}

/** Page 0 of `doc` drawn by a page canvas at zoom 1 and pixel ratio 1. */
async function drawPage(doc: InkDocument): Promise<HTMLCanvasElement> {
  const info = doc.pages[0]!
  const host = mountContainer(info.width, info.height)
  const renderer = createPageRenderer({
    document: doc,
    page: 0,
    host,
    transform: createPageTransform(info, 1, 0),
    devicePixelRatio: 1,
  })
  cleanup.push(() => {
    renderer.destroy()
    host.remove()
  })
  await renderer.rendered
  return host.querySelector<HTMLCanvasElement>('canvas[data-ink-canvas]')!
}

describe('assets that cannot be fetched', () => {
  it.each([
    ['engine', { engine: '/nowhere/inkbar-pdfium.wasm' }],
    ['worker', { worker: '/nowhere/worker.mjs' }],
  ] as const)(
    'fails the open with AssetLoadFailed when the %s is not found',
    async (_, assets) => {
      const doc = await open('text-simple', assets)
      await expect(doc.ready).rejects.toMatchObject({
        code: 'AssetLoadFailed',
        details: { cause: expect.anything() as unknown },
      })
      expect(doc.status.get()).toMatchObject({
        state: 'error',
        error: { code: 'AssetLoadFailed' },
      })
    }
  )

  it('draws the page, and warns, when a font is not found', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const doc = await open('unembedded-japanese', { fonts: '/nowhere/fonts/' })
    await doc.ready
    // The page draws, with no page error, though the Japanese has no font to draw with.
    const canvas = await drawPage(doc)
    expect([canvas.width, canvas.height]).toEqual([595, 842])
    expect(canvas.closest('.ink-page-error, [data-ink-page-error]')).toBeNull()
    expect(
      warn.mock.calls.filter((args) => String(args[0]).includes('no fallback font'))
    ).toHaveLength(1)
  })

  it('has no font for a key a partial map leaves out', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const doc = await open('unembedded-japanese', {
      fonts: { korean: '/inkbar-fonts/NotoSansKR-Regular.otf' },
    })
    await doc.ready
    await drawPage(doc)
    expect(
      warn.mock.calls.filter((args) => String(args[0]).includes('"japanese"'))
    ).toHaveLength(1)
  })

  it('reports FormScriptError and keeps the form fillable when the sandbox is not found', async () => {
    const doc = await open('form-scripted', { sandbox: '/nowhere/sandbox/' })
    await doc.ready
    const heard: InkError[] = []
    doc.form.on('error', (e) => heard.push(e))
    expect(heard.map((e) => e.code)).toEqual(['FormScriptError'])
    expect(doc.form.set({ qty: '3' }).applied).toEqual(['qty'])
    expect(doc.form.get('qty')).toBe('3')
    // No script ran: the total is not calculated.
    doc.form.set({ price: '2.5' })
    expect(doc.form.get('total')).not.toBe('7.5')
  })
})

/** `/pdfjs/wasm/`, where the test server serves the sandbox, written relative to this page. */
const relativeSandbox = (): string => {
  const depth = new URL(document.baseURI).pathname.split('/').length - 2
  return `./${'../'.repeat(depth)}pdfjs/wasm/`
}

describe('the sandbox directory', () => {
  it.each([
    ['without its trailing slash', () => '/pdfjs/wasm'],
    ['relative to the page', relativeSandbox],
  ])('runs the form scripts from a directory given %s', async (_, sandbox) => {
    const doc = await open('form-scripted', { sandbox: sandbox() })
    await doc.ready
    const heard: InkError[] = []
    doc.form.on('error', (e) => heard.push(e))
    doc.form.set({ qty: '3' })
    doc.form.set({ price: '2.5' })
    expect(doc.form.get('total')).toBe('7.5')
    expect(heard).toEqual([])
  })
})
