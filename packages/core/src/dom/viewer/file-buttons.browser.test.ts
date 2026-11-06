import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { mountContainer, until } from '../test-utils'

import { createDownloadButton, createPrintButton } from './controls'
import { createViewer, type Viewer } from './create-viewer'

let cleanup: (() => void)[] = []
afterEach(() => {
  vi.restoreAllMocks()
  cleanup.forEach((f) => f())
  cleanup = []
  document.querySelectorAll('[data-ink-print-frame]').forEach((f) => f.remove())
})

/** Records the anchors a download clicks, without starting a real download. */
function catchDownloads(): HTMLAnchorElement[] {
  const clicked: HTMLAnchorElement[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    clicked.push(this)
  })
  return clicked
}

function make(): Viewer {
  const host = mountContainer(600, 450)
  const viewer = createViewer(host, {
    source: fixtureUrl('text-simple'),
    assets: browserAssets(),
  })
  cleanup.push(() => {
    viewer.destroy()
    host.remove()
  })
  return viewer
}

describe('download and print', () => {
  it('the buttons wait for the document, then download and print its file', async () => {
    const clicked = catchDownloads()
    const viewer = make()
    const download = createDownloadButton(viewer)
    const print = createPrintButton(viewer)
    expect(download.getAttribute('aria-label')).toBe('Download')
    expect(print.getAttribute('aria-label')).toBe('Print')
    expect(download.dataset.inkDownload).toBe('')
    expect(print.dataset.inkPrint).toBe('')
    expect(download.disabled).toBe(true)
    expect(print.disabled).toBe(true)
    await until(() => viewer.status.get().state === 'ready')
    expect(download.disabled).toBe(false)
    expect(print.disabled).toBe(false)

    download.click()
    await until(() => clicked.length === 1)
    // The URL's last segment names the file.
    expect(clicked[0]!.download).toBe('text-simple.pdf')

    print.click()
    await until(() => document.querySelector('[data-ink-print-frame]') !== null)
  })

  it('a download button takes a file name of its own', async () => {
    const clicked = catchDownloads()
    const viewer = make()
    const download = createDownloadButton(viewer, { filename: 'Lease.pdf' })
    await until(() => !download.disabled)
    download.click()
    await until(() => clicked.length === 1)
    expect(clicked[0]!.download).toBe('Lease.pdf')
  })

  it('Ctrl+S in the viewer downloads; the methods do nothing with no document', async () => {
    const clicked = catchDownloads()
    const viewer = make()
    await viewer.download()
    expect(clicked).toHaveLength(0)
    await until(() => viewer.status.get().state === 'ready')
    const scroll = viewer.element.querySelector<HTMLElement>('[data-ink-scroll]')!
    const taken = !scroll.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    )
    expect(taken).toBe(true)
    await until(() => clicked.length === 1)
  })
})
