import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import { q } from './dom.js'
import FileHarness from './harness/FileHarness.svelte'

const assets = browserAssets()
guardConsole()

const src = fixtureUrl('text-simple')

afterEach(() => {
  vi.restoreAllMocks()
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

describe('download and print', () => {
  it('the buttons wait for the document, then download and print its file', async () => {
    const clicked = catchDownloads()
    await render(FileHarness, { src, assets })
    const download = browserPage.getByRole('button', { name: 'Download' })
    const print = browserPage.getByRole('button', { name: 'Print' })
    await expect.element(download).toHaveAttribute('data-ink-download', '')
    await expect.element(print).toHaveAttribute('data-ink-print', '')
    await q('[data-ink-scroll] .ink-page canvas')
    await expect.element(download).toBeEnabled()
    await expect.element(print).toBeEnabled()

    await download.click()
    await expect.poll(() => clicked.length).toBe(1)
    expect(clicked[0]!.download).toBe('text-simple.pdf')

    // Printing loads the file into a hidden frame; the dialog itself is the browser's.
    await print.click()
    await expect
      .poll(() => document.querySelector('[data-ink-print-frame]')?.getAttribute('src'))
      .toMatch(/^blob:/)
  })

  it('a download button takes a file name, and Ctrl+S in the root downloads too', async () => {
    const clicked = catchDownloads()
    await render(FileHarness, { src, assets, filename: 'Lease.pdf' })
    await q('[data-ink-scroll] .ink-page canvas')
    await browserPage.getByRole('button', { name: 'Download' }).click()
    await expect.poll(() => clicked.length).toBe(1)
    expect(clicked[0]!.download).toBe('Lease.pdf')

    document.querySelector<HTMLElement>('[data-ink-scroll]')!.focus()
    await userEvent.keyboard('{Control>}s{/Control}')
    await expect.poll(() => clicked.length).toBe(2)
    expect(clicked[1]!.download).toBe('text-simple.pdf')
  })
})
