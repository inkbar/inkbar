import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fr } from '../locales/fr'
import { en } from '../messages'
import {
  openDocument,
  type DocumentStatus,
  type EngineLoader,
  type InkDocument,
} from '../model/document'
import { InkError } from '../model/errors'
import { writable } from '../model/readable'

import {
  attachFileKeys,
  downloadDocument,
  fileActionFailure,
  fileBusy,
  printDocument,
} from './file-actions'
import { savePictures } from './save-pictures'

const BYTES = new Uint8Array([37, 80, 68, 70])
const WRITTEN = new Uint8Array([37, 80, 68, 70, 45, 49])

/**
 * A document as the actions see it: its name, its file and its status. `saves` gives it an
 * engine: `save()` then gives what `written` resolves with.
 */
function docOf(
  state: DocumentStatus['state'] = 'ready',
  saves?: { written: () => Promise<Uint8Array> }
) {
  const getData = vi.fn(() => Promise.resolve(BYTES.slice()))
  const save = vi.fn(() => saves?.written() ?? Promise.resolve(BYTES.slice()))
  const doc = {
    fileName: 'lease.pdf',
    getData,
    save,
    _saves: !!saves,
    status: writable({ state } as DocumentStatus),
  } as unknown as InkDocument
  return Object.assign(doc, { getDataMock: getData, saveMock: save })
}

/** A promise and its resolve and reject, for a write a test lets finish. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const saveFailed = (stage: 'engine' | 'write') =>
  new InkError('SaveFailed', 'The changes could not be written into this file', { stage })

const opened: InkDocument[] = []
afterEach(() => {
  vi.restoreAllMocks()
  document.querySelectorAll('[data-ink-print-frame]').forEach((f) => f.remove())
  opened.splice(0).forEach((d) => d.destroy())
})

/** `text-simple` opened as a viewer opens it, with the real engine as its loader when asked. */
async function openReal(withEngine: boolean) {
  const loader = vi.fn<EngineLoader>(() => import('@inkbar/engine'))
  const doc = await openDocument(fixtureUrl('text-simple'), {
    assets: browserAssets(),
    pictures: savePictures(document),
    ...(withEngine ? { engine: loader } : {}),
  })
  opened.push(doc)
  await doc.ready
  return { doc, loader }
}

const addSquare = (doc: InkDocument) =>
  doc.annotations.add({
    type: 'square',
    page: 0,
    rect: { x: 72, y: 600, width: 120, height: 60 },
  })

/** The bytes behind an object URL. */
async function bytesAt(url: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(url)).arrayBuffer())
}

/** Whether `bytes` hold an annotation Inkbar wrote: its `/INKB_Gloss` entry. */
const holdsGloss = (bytes: Uint8Array): boolean =>
  new TextDecoder('latin1').decode(bytes).includes('/INKB_Gloss')

/** Lets the print frame's load through, with a stubbed print so no dialog opens. */
async function finishPrint(printing: Promise<void>): Promise<HTMLIFrameElement> {
  await vi.waitFor(() =>
    expect(document.querySelector('[data-ink-print-frame]')).not.toBeNull()
  )
  const frame = document.querySelector<HTMLIFrameElement>('[data-ink-print-frame]')!
  Object.defineProperty(frame, 'contentWindow', {
    value: { focus: vi.fn(), print: vi.fn() },
  })
  frame.dispatchEvent(new Event('load'))
  await printing
  return frame
}

/** Records the anchors the download clicks, without starting a real download. */
function catchDownloads(): HTMLAnchorElement[] {
  const clicked: HTMLAnchorElement[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    clicked.push(this)
  })
  return clicked
}

describe('downloadDocument', () => {
  it("saves the document's file under its name", async () => {
    const clicked = catchDownloads()
    const doc = docOf()
    await downloadDocument(doc)
    expect(clicked).toHaveLength(1)
    const a = clicked[0]!
    expect(a.download).toBe('lease.pdf')
    expect(a.href).toMatch(/^blob:/)
    // The anchor is gone once clicked.
    expect(a.isConnected).toBe(false)
    const blob = await (await fetch(a.href)).blob()
    expect(blob.type).toBe('application/pdf')
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([...BYTES])
  })

  it('takes a file name of your own', async () => {
    const clicked = catchDownloads()
    await downloadDocument(docOf(), { filename: 'Signed lease.pdf' })
    expect(clicked[0]!.download).toBe('Signed lease.pdf')
  })
})

describe('printDocument', () => {
  it("prints the document's file from a hidden frame", async () => {
    const doc = docOf()
    const printing = printDocument(doc)
    // The frame loads the PDF, then prints it.
    await vi.waitFor(() =>
      expect(document.querySelector('[data-ink-print-frame]')).not.toBeNull()
    )
    const frame = document.querySelector<HTMLIFrameElement>('[data-ink-print-frame]')!
    expect(frame.src).toMatch(/^blob:/)
    expect(frame.getAttribute('aria-hidden')).toBe('true')
    expect(frame.tabIndex).toBe(-1)
    const print = vi.fn()
    // Stub the frame's print once it has loaded, so no dialog opens.
    Object.defineProperty(frame, 'contentWindow', {
      value: { focus: vi.fn(), print },
    })
    frame.dispatchEvent(new Event('load'))
    await printing
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('keeps one frame, replacing it on the next print', async () => {
    for (let i = 0; i < 2; i++) {
      const printing = printDocument(docOf())
      await vi.waitFor(() =>
        expect(
          document.querySelector('[data-ink-print-frame]:not([data-printed])')
        ).not.toBeNull()
      )
      const frame = document.querySelector<HTMLIFrameElement>(
        '[data-ink-print-frame]:not([data-printed])'
      )!
      Object.defineProperty(frame, 'contentWindow', {
        value: { focus: vi.fn(), print: vi.fn() },
      })
      frame.dispatchEvent(new Event('load'))
      await printing
      frame.dataset.printed = ''
    }
    expect(document.querySelectorAll('[data-ink-print-frame]')).toHaveLength(1)
  })
})

describe('with an engine', () => {
  it('downloads the written copy, holding the added annotation', async () => {
    const clicked = catchDownloads()
    const { doc, loader } = await openReal(true)
    addSquare(doc)
    await downloadDocument(doc)
    expect(clicked).toHaveLength(1)
    expect(loader).toHaveBeenCalledTimes(1)
    const bytes = await bytesAt(clicked[0]!.href)
    expect(holdsGloss(bytes)).toBe(true)
    expect(bytes).not.toEqual(await doc.getData())
  })

  it('downloads the opened file, loading no engine, when nothing changed', async () => {
    const clicked = catchDownloads()
    const { doc, loader } = await openReal(true)
    await downloadDocument(doc)
    expect(await bytesAt(clicked[0]!.href)).toEqual(await doc.getData())
    expect(loader).not.toHaveBeenCalled()
  })

  it('without an engine downloads the opened file, changes or not', async () => {
    const clicked = catchDownloads()
    const { doc } = await openReal(false)
    addSquare(doc)
    await downloadDocument(doc)
    expect(await bytesAt(clicked[0]!.href)).toEqual(await doc.getData())
  })

  it('prints the written copy', async () => {
    const { doc } = await openReal(true)
    addSquare(doc)
    const frame = await finishPrint(printDocument(doc))
    expect(holdsGloss(await bytesAt(frame.src))).toBe(true)
  })

  it('Ctrl+S and Ctrl+P hand over the written copy too', async () => {
    const clicked = catchDownloads()
    const { doc } = await openReal(true)
    addSquare(doc)
    const el = document.createElement('div')
    document.body.append(el)
    const stop = attachFileKeys(el, () => doc)
    const key = (k: string) =>
      el.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: k,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
    key('s')
    await vi.waitFor(() => expect(clicked).toHaveLength(1), { timeout: 10_000 })
    expect(holdsGloss(await bytesAt(clicked[0]!.href))).toBe(true)
    const frame = await finishPrint(
      (async () => {
        key('p')
        await vi.waitFor(() =>
          expect(document.querySelector('[data-ink-print-frame]')).not.toBeNull()
        )
      })()
    )
    expect(holdsGloss(await bytesAt(frame.src))).toBe(true)
    stop()
    el.remove()
  })
})

describe('while a copy is written', () => {
  it('is busy until the copy is ready, and a second download meanwhile does nothing', async () => {
    const clicked = catchDownloads()
    const write = deferred<Uint8Array>()
    const doc = docOf('ready', { written: () => write.promise })
    const busy = fileBusy(doc)
    expect(busy).toBe(fileBusy(doc))
    expect(busy.get()).toBe(false)
    const first = downloadDocument(doc)
    expect(busy.get()).toBe(true)
    await downloadDocument(doc)
    // The print goes nowhere either: one copy at a time.
    await printDocument(doc)
    expect(doc.saveMock).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-ink-print-frame]')).toBeNull()
    write.resolve(WRITTEN.slice())
    await first
    expect(busy.get()).toBe(false)
    expect(clicked).toHaveLength(1)
    expect(await bytesAt(clicked[0]!.href)).toEqual(WRITTEN)
    expect(doc.getDataMock).not.toHaveBeenCalled()
  })

  it('a failed copy downloads and prints nothing, rejects, and ends the busy state', async () => {
    const clicked = catchDownloads()
    const failure = saveFailed('write')
    const doc = docOf('ready', { written: () => Promise.reject(failure) })
    const created = vi.spyOn(URL, 'createObjectURL')
    await expect(downloadDocument(doc)).rejects.toBe(failure)
    expect(fileBusy(doc).get()).toBe(false)
    await expect(printDocument(doc)).rejects.toBe(failure)
    expect(fileBusy(doc).get()).toBe(false)
    expect(clicked).toHaveLength(0)
    expect(document.querySelector('[data-ink-print-frame]')).toBeNull()
    // No object URL was made, so none is left to revoke.
    expect(created).not.toHaveBeenCalled()
  })

  it('a key that fails passes its error on, and the next key works', async () => {
    const clicked = catchDownloads()
    const failure = saveFailed('write')
    let fail = true
    const doc = docOf('ready', {
      written: () => (fail ? Promise.reject(failure) : Promise.resolve(WRITTEN.slice())),
    })
    const el = document.createElement('div')
    document.body.append(el)
    const onError = vi.fn()
    const stop = attachFileKeys(el, () => doc, { onError })
    const key = (k: string) =>
      el.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: k,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
    expect(key('s')).toBe(false)
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure))
    expect(key('p')).toBe(false)
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(2))
    expect(clicked).toHaveLength(0)
    expect(document.querySelector('[data-ink-print-frame]')).toBeNull()
    fail = false
    key('s')
    await vi.waitFor(() => expect(clicked).toHaveLength(1))
    stop()
    el.remove()
  })

  it('tells a reader why: the file could not be written, or saving is unavailable', () => {
    expect(fileActionFailure(saveFailed('write'), en)?.message).toBe(
      'Your changes could not be written into this file.'
    )
    expect(fileActionFailure(saveFailed('engine'), en)?.message).toBe(
      'Saving is not available right now. Check your connection and try again.'
    )
    expect(fileActionFailure(saveFailed('engine'), en)?.error.code).toBe('SaveFailed')
    // Anything else is not the reader's to see.
    expect(
      fileActionFailure(new InkError('DocumentDestroyed', 'gone'), en)
    ).toBeUndefined()
    expect(fileActionFailure(new Error('x'), en)).toBeUndefined()
  })
})

describe('printing on iOS', () => {
  /** Makes the browser look like an iPad, and stands in for `window.open`. */
  function onIpad() {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('iPad')
    const order: string[] = []
    const tab = {
      opener: {} as unknown,
      // The blank page a tab opened with no URL starts on.
      document: document.implementation.createHTMLDocument(''),
      location: { replace: vi.fn((url: string) => order.push(`go ${url.slice(0, 5)}`)) },
      close: vi.fn(() => order.push('close')),
    }
    const open = vi.spyOn(window, 'open').mockImplementation(() => {
      order.push('open')
      return tab as unknown as Window
    })
    return { order, tab, open }
  }

  it('opens the tab in the press, before the copy is written, then sends it there', async () => {
    const { order, tab, open } = onIpad()
    const write = deferred<Uint8Array>()
    const doc = docOf('ready', {
      written: () => {
        order.push('write')
        return write.promise
      },
    })
    const printing = printDocument(doc)
    // Synchronously, inside the press: a tab opened later would be blocked.
    expect(order).toEqual(['open', 'write'])
    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(tab.opener).toBeNull()
    write.resolve(WRITTEN.slice())
    await printing
    expect(order).toEqual(['open', 'write', 'go blob:'])
    expect(await bytesAt(tab.location.replace.mock.calls[0]![0])).toEqual(WRITTEN)
    expect(tab.close).not.toHaveBeenCalled()
    expect(document.querySelector('[data-ink-print-frame]')).toBeNull()
  })

  it('says the file is being prepared until the copy replaces the page', async () => {
    const { order, tab } = onIpad()
    const write = deferred<Uint8Array>()
    const said = () => tab.document.body.textContent
    const doc = docOf('ready', {
      written: () => {
        order.push(`write while saying ${said()}`)
        return write.promise
      },
    })
    const printing = printDocument(doc)
    expect(order).toEqual(['open', 'write while saying Preparing your file…'])
    expect(tab.document.title).toBe('Preparing your file…')
    write.resolve(WRITTEN.slice())
    await printing
    // Replaced, so Back from the PDF does not return to the blank page.
    expect(order.at(-1)).toBe('go blob:')
    expect(tab.location.replace).toHaveBeenCalledTimes(1)
  })

  it("says it in the viewer's words", async () => {
    const { tab } = onIpad()
    const doc = docOf('ready', { written: () => Promise.resolve(WRITTEN.slice()) })
    await printDocument(doc, { messages: fr })
    expect(tab.document.body.textContent).toBe('Préparation de votre fichier…')
  })

  it('closes the tab when the copy cannot be written', async () => {
    const { order, tab } = onIpad()
    const failure = saveFailed('write')
    const doc = docOf('ready', { written: () => Promise.reject(failure) })
    await expect(printDocument(doc)).rejects.toBe(failure)
    expect(order).toEqual(['open', 'close'])
    expect(tab.location.replace).not.toHaveBeenCalled()
    expect(fileBusy(doc).get()).toBe(false)
  })

  it('opens no tab while busy', async () => {
    const { open } = onIpad()
    const write = deferred<Uint8Array>()
    const doc = docOf('ready', { written: () => write.promise })
    const first = printDocument(doc)
    await printDocument(doc)
    expect(open).toHaveBeenCalledTimes(1)
    write.resolve(WRITTEN.slice())
    await first
  })
})

describe('attachFileKeys', () => {
  function keyIn(el: HTMLElement, key: string, mods: KeyboardEventInit = {}): boolean {
    return el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
        ...mods,
      })
    )
  }

  it('downloads on Ctrl or Cmd+S and prints on Ctrl or Cmd+P, taking the key', async () => {
    const clicked = catchDownloads()
    const el = document.createElement('div')
    document.body.append(el)
    const doc = docOf()
    const stop = attachFileKeys(el, () => doc)
    expect(keyIn(el, 's')).toBe(false)
    await vi.waitFor(() => expect(clicked).toHaveLength(1))
    expect(keyIn(el, 'S', { ctrlKey: false, metaKey: true })).toBe(false)
    await vi.waitFor(() => expect(clicked).toHaveLength(2))
    expect(keyIn(el, 'p')).toBe(false)
    await vi.waitFor(() =>
      expect(document.querySelector('[data-ink-print-frame]')).not.toBeNull()
    )
    stop()
    expect(keyIn(el, 's')).toBe(true)
    el.remove()
  })

  it('leaves the keys to the browser with no ready document, or with other modifiers', () => {
    const el = document.createElement('div')
    document.body.append(el)
    let doc: ReturnType<typeof docOf> | null = null
    const stop = attachFileKeys(el, () => doc)
    expect(keyIn(el, 'p')).toBe(true)
    doc = docOf('loading')
    expect(keyIn(el, 'p')).toBe(true)
    doc = docOf()
    expect(keyIn(el, 'p', { shiftKey: true })).toBe(true)
    expect(keyIn(el, 'p', { altKey: true })).toBe(true)
    expect(keyIn(el, 'p', { ctrlKey: false })).toBe(true)
    expect(doc.getDataMock).not.toHaveBeenCalled()
    stop()
    el.remove()
  })
})
