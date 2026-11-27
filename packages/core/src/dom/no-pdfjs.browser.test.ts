// The engine reads the file, and PDF.js is never loaded: PDF.js's module is never evaluated, and
// no request for its module, worker or assets is made. Only a document with scripts loads the
// kept scripting sandbox.
import { browserAssets, fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { openSecondReader } from '../pdfjs/second-reader'

import { mountContainer, until } from './test-utils'
import { createViewer } from './viewer/create-viewer'

import type { InkDocument } from '../model/document'

/** Whether PDF.js's module was evaluated. */
const pdfjsUse = vi.hoisted(() => ({ evaluated: false }))
vi.mock('pdfjs-dist', async (original) => {
  pdfjsUse.evaluated = true
  return original()
})

let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.reverse().forEach((f) => f())
  cleanup = []
})

/**
 * The URLs the page requests while `work` runs, from Resource Timing. A module cannot be imported
 * without an entry here: Resource Timing lists a response from the HTTP cache too, and each test
 * file runs in a page of its own, whose module map starts empty.
 */
async function requestsDuring(work: () => Promise<void>): Promise<string[]> {
  const urls: string[] = []
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) urls.push(entry.name)
  })
  observer.observe({ type: 'resource' })
  try {
    await work()
  } finally {
    for (const entry of observer.takeRecords()) urls.push(entry.name)
    observer.disconnect()
  }
  return urls
}

/**
 * A request for PDF.js: its package (the module, its worker, the sandbox), its worker file, or a
 * file the tests serve under `/pdfjs/` (the sandbox's files, and PDF.js's own for the tests'
 * second reader).
 */
const isPdfjs = (url: string): boolean =>
  url.includes('pdfjs-dist') ||
  url.includes('pdf.worker') ||
  new URL(url, location.href).pathname.startsWith('/pdfjs/')
/** The kept scripting sandbox: its module as Vite serves it, and the QuickJS files it loads. */
const isSandbox = (url: string): boolean =>
  /pdf[._]+sandbox/.test(url) || /\/pdfjs\/wasm\/quickjs-eval\.(js|wasm)$/.test(url)

/** A viewer over `name`, at zoom 1, once its document is ready and its first page drawn. */
async function view(name: FixtureName): Promise<InkDocument> {
  const host = mountContainer(800, 900)
  const viewer = createViewer(host, {
    source: fixtureUrl(name),
    assets: browserAssets(),
    zoom: 1,
  })
  cleanup.push(() => {
    viewer.destroy()
    host.remove()
  })
  await until(
    () =>
      viewer.status.get().state === 'ready' &&
      host.querySelector('.ink-page[data-page="0"] canvas[data-ink-canvas]') !== null &&
      host.querySelector('.ink-page[data-page="0"] [data-ink-text-layer] span') !== null,
    20_000
  )
  return viewer.document.get()!
}

describe('a document', () => {
  it('opens, fills, searches and saves a form without loading PDF.js', async () => {
    let doc!: InkDocument
    const urls = await requestsDuring(async () => {
      doc = await view('form-fields')
      const text = doc.form.fields
        .get()
        .find((f) => f.type === 'text' && !f.flags.readOnly && !f.locked)!
      expect(doc.form.set({ [text.name]: 'Filled in' }).applied).toEqual([text.name])
      const word = (await doc.pageText(0)).split(/\s+/u).find((w) => w.length > 3)!
      expect(await doc.search(word).all()).not.toEqual([])
      const saved = await doc.save()
      expect(saved.byteLength).toBeGreaterThan(0)
    })
    // The page's own requests were seen: the fixture, and the engine's worker.
    expect(urls.some((url) => url.includes('form-fields.pdf'))).toBe(true)
    expect(urls.filter(isPdfjs)).toEqual([])
    expect(pdfjsUse).toEqual({ evaluated: false })
  })

  it('loads the scripting sandbox, and nothing else of PDF.js, for a form with scripts', async () => {
    let doc!: InkDocument
    const urls = await requestsDuring(async () => {
      doc = await view('form-scripted')
      // The open has run the file's scripts.
      await until(() => doc.form.fields.get().length > 0)
    })
    const pdfjs = urls.filter(isPdfjs)
    expect(pdfjs.length).toBeGreaterThan(0)
    expect(pdfjs.filter((url) => !isSandbox(url))).toEqual([])
    expect(pdfjsUse).toEqual({ evaluated: false })
  })

  // Control, last as it loads PDF.js into the page: the same watch sees PDF.js load when the
  // tests' second reader opens a file with it.
  it('sees PDF.js load when it opens a file', async () => {
    const urls = await requestsDuring(async () => {
      const bytes = new Uint8Array(
        await (await fetch(fixtureUrl('text-simple'))).arrayBuffer()
      )
      const opened = await openSecondReader(bytes)
      await opened.destroy()
    })
    expect(pdfjsUse).toEqual({ evaluated: true })
    expect(urls.filter(isPdfjs)).not.toEqual([])
  })
})
