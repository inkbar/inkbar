import { _setEngineFactory } from '@inkbar/core'
import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import { q } from './dom.js'
import FileHarness from './harness/FileHarness.svelte'
import { heldEngine } from './harness/held-engine.js'

import type { InkError } from '@inkbar/core'

const assets = browserAssets()
guardConsole()

const src = fixtureUrl('text-simple')

afterEach(() => {
  _setEngineFactory(undefined)
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

/** Adds a square on page 1 of the open document: a change to write. */
async function addSquare(): Promise<void> {
  const root = await q<HTMLElement & { __inkDocument?: unknown }>('[data-ink-root]')
  const doc = root.__inkDocument as { annotations: { add(input: unknown): unknown } }
  doc.annotations.add({
    type: 'square',
    page: 0,
    rect: { x: 72, y: 600, width: 120, height: 60 },
  })
}

const alertText = () =>
  document.querySelector('[data-ink-form-alert-message]')?.textContent ?? null

describe('with changes to write', () => {
  it('the buttons are busy while the copy is written, then download it', async () => {
    const clicked = catchDownloads()
    const held = heldEngine()
    await render(FileHarness, { src, assets })
    await q('[data-ink-scroll] .ink-page canvas')
    const download = await q<HTMLButtonElement>('[data-ink-download]')
    const print = await q<HTMLButtonElement>('[data-ink-print]')
    await expect.poll(() => download.disabled).toBe(false)
    expect(download.getAttribute('aria-busy')).toBe('false')
    await addSquare()
    download.focus()
    download.click()
    await expect.poll(held.writing).toBe(true)
    for (const b of [download, print]) {
      await expect.poll(() => b.getAttribute('aria-busy')).toBe('true')
      expect(b.getAttribute('aria-disabled')).toBe('true')
    }
    // Focus stays on the pressed button, and pressing again starts nothing.
    expect(document.activeElement).toBe(download)
    download.click()
    print.click()
    held.finish()
    await expect.poll(() => clicked.length).toBe(1)
    expect(await (await fetch(clicked[0]!.href)).text()).toBe('%PDF-1.7 written')
    await expect.poll(() => download.getAttribute('aria-busy')).toBe('false')
    expect(download.hasAttribute('aria-disabled')).toBe(false)
    expect(print.disabled).toBe(false)
    // The document runs one engine: the one it reads with wrote the copy.
    expect(held.loads).toBe(1)
    expect(document.querySelector('[data-ink-print-frame]')).toBeNull()
  })

  it('a copy that cannot be written prints nothing, calls onError and tells the reader', async () => {
    const held = heldEngine()
    const errors: InkError[] = []
    await render(FileHarness, {
      src,
      assets,
      onError: (e) => errors.push(e),
    })
    await q('[data-ink-scroll] .ink-page canvas')
    const print = await q<HTMLButtonElement>('[data-ink-print]')
    await expect.poll(() => print.disabled).toBe(false)
    await addSquare()
    print.click()
    await expect.poll(held.writing).toBe(true)
    await expect.poll(() => print.getAttribute('aria-busy')).toBe('true')
    held.fail()
    await expect.poll(alertText).toBe('Your changes could not be written into this file.')
    expect(errors.map((e) => e.code)).toEqual(['SaveFailed'])
    expect(document.querySelector('[data-ink-print-frame]')).toBeNull()
    await expect.poll(() => print.getAttribute('aria-busy')).toBe('false')
    expect(print.disabled).toBe(false)
    document.querySelector<HTMLElement>('[data-ink-form-alert-ok]')!.click()

    // Ctrl+S goes the same way.
    document.querySelector<HTMLElement>('[data-ink-scroll]')!.focus()
    await userEvent.keyboard('{Control>}s{/Control}')
    await expect.poll(held.writing).toBe(true)
    held.fail()
    await expect.poll(() => errors.length).toBe(2)
    expect(errors[1]!.code).toBe('SaveFailed')
    await expect.poll(alertText).toBe('Your changes could not be written into this file.')
  })

  it('an engine that stops and cannot start again says saving is unavailable', async () => {
    heldEngine(true)
    const errors: InkError[] = []
    await render(FileHarness, {
      src,
      assets,
      onError: (e) => errors.push(e),
    })
    await q('[data-ink-scroll] .ink-page canvas')
    const download = await q<HTMLButtonElement>('[data-ink-download]')
    await expect.poll(() => download.disabled).toBe(false)
    await addSquare()
    // The write the engine stops in fails; the next finds no engine can start.
    download.click()
    await expect.poll(alertText).toBe('Your changes could not be written into this file.')
    document.querySelector<HTMLElement>('[data-ink-form-alert-ok]')!.click()
    await expect.poll(() => download.getAttribute('aria-busy')).toBe('false')
    download.click()
    await expect
      .poll(alertText)
      .toBe('Saving is not available right now. Check your connection and try again.')
    // The write's failure, then the stop, heard once: the save that found it reports no second.
    expect(errors.map((e) => e.code)).toEqual(['SaveFailed', 'EngineUnavailable'])
  })
})
