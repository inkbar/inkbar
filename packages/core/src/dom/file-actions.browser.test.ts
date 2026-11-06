import { afterEach, describe, expect, it, vi } from 'vitest'

import { writable } from '../model/readable'

import { attachFileKeys, downloadDocument, printDocument } from './file-actions'

import type { DocumentStatus, InkDocument } from '../model/document'

const BYTES = new Uint8Array([37, 80, 68, 70])

/** A document as the actions see it: its name, its file and its status. */
function docOf(state: DocumentStatus['state'] = 'ready') {
  const getData = vi.fn(() => Promise.resolve(BYTES.slice()))
  const doc = {
    fileName: 'lease.pdf',
    getData,
    status: writable({ state } as DocumentStatus),
  } as unknown as InkDocument
  return Object.assign(doc, { getDataMock: getData })
}

afterEach(() => {
  vi.restoreAllMocks()
  document.querySelectorAll('[data-ink-print-frame]').forEach((f) => f.remove())
})

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
