import { readFile } from 'node:fs/promises'

import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import { guardConsole } from '../../playwright/console-guard'
import Harness from '../../playwright/harness/FileHarness.vue'

import type { Page } from '@playwright/test'
import type {} from '../../playwright/harness/held-engine'

const assets = browserAssets()
guardConsole(test)

test('download saves the opened file under its name, and print loads it to print', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, { props: { src: fixtureUrl('text-simple'), assets } })
  const download = page.getByRole('button', { name: 'Download' })
  const print = page.getByRole('button', { name: 'Print' })
  await expect(download).toHaveAttribute('data-ink-download', '')
  await expect(print).toHaveAttribute('data-ink-print', '')
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await expect(download).toBeEnabled()
  await expect(print).toBeEnabled()

  const saving = page.waitForEvent('download')
  await download.click()
  const file = await saving
  expect(file.suggestedFilename()).toBe('text-simple.pdf')
  const bytes = await readFile(await file.path())
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')

  // Printing loads the file into a hidden frame; the dialog itself is the browser's.
  await page.evaluate(() => {
    window.print = () => undefined
  })
  await print.click()
  await expect(page.locator('[data-ink-print-frame]')).toHaveAttribute('src', /^blob:/)
})

test('a download button takes a file name, and Ctrl+S in the root downloads too', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('text-simple'), assets, filename: 'Lease.pdf' },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  const saving = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download' }).click()
  expect((await saving).suggestedFilename()).toBe('Lease.pdf')

  await cmp.locator('[data-ink-scroll]').focus()
  const byKey = page.waitForEvent('download')
  await page.keyboard.press('ControlOrMeta+s')
  expect((await byKey).suggestedFilename()).toBe('text-simple.pdf')
})

/** Adds a square on page 1 of the open document: a change to write. */
async function addSquare(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.querySelector('[data-ink-root]') as HTMLElement & {
      __inkDocument?: { annotations: { add(input: unknown): unknown } }
    }
    root.__inkDocument!.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 72, y: 600, width: 120, height: 60 },
    })
  })
}

const writing = (page: Page) => page.evaluate(() => window.__heldEngine!.writing())

test('with an engine, the buttons are busy while the copy is written, then download it', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('text-simple'), assets, engine: 'held' },
  })
  const download = page.getByRole('button', { name: 'Download' })
  const print = page.getByRole('button', { name: 'Print' })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await expect(download).toHaveAttribute('aria-busy', 'false')
  await addSquare(page)
  const saving = page.waitForEvent('download')
  await download.click()
  await expect.poll(() => writing(page)).toBe(true)
  for (const b of [download, print]) {
    await expect(b).toHaveAttribute('aria-busy', 'true')
    await expect(b).toHaveAttribute('aria-disabled', 'true')
  }
  // Focus stays on the pressed button, and pressing again starts nothing.
  await expect(download).toBeFocused()
  // Forced: Playwright waits for an `aria-disabled` button to enable.
  await download.click({ force: true })
  await print.click({ force: true })
  await page.evaluate(() => window.__heldEngine!.finish())
  const file = await saving
  expect((await readFile(await file.path())).toString()).toBe('%PDF-1.7 written')
  await expect(download).toHaveAttribute('aria-busy', 'false')
  await expect(download).not.toHaveAttribute('aria-disabled')
  await expect(print).toBeEnabled()
  // The root passed its loader to the document, which loaded it once.
  expect(await page.evaluate(() => window.__heldEngine!.loads)).toBe(1)
  await expect(page.locator('[data-ink-print-frame]')).toHaveCount(0)
})

test('a copy that cannot be written prints nothing, emits error and tells the reader', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('text-simple'), assets, engine: 'held' },
  })
  const print = page.getByRole('button', { name: 'Print' })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await addSquare(page)
  await print.click()
  await expect.poll(() => writing(page)).toBe(true)
  await expect(print).toHaveAttribute('aria-busy', 'true')
  await page.evaluate(() => window.__heldEngine!.fail())
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveText(
    'Your changes could not be written into this file.'
  )
  await expect(page.getByTestId('errors')).toHaveText('SaveFailed')
  await expect(page.locator('[data-ink-print-frame]')).toHaveCount(0)
  await expect(print).toHaveAttribute('aria-busy', 'false')
  await expect(print).toBeEnabled()
  await page.locator('[data-ink-form-alert-ok]').click()

  // Ctrl+S goes the same way.
  await cmp.locator('[data-ink-scroll]').focus()
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => writing(page)).toBe(true)
  await page.evaluate(() => window.__heldEngine!.fail())
  await expect(page.getByTestId('errors')).toHaveText('SaveFailed SaveFailed')
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveText(
    'Your changes could not be written into this file.'
  )
})

test('an engine that cannot be loaded says saving is unavailable', async ({
  mount,
  page,
}) => {
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('text-simple'), assets, engine: 'unavailable' },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await addSquare(page)
  await page.getByRole('button', { name: 'Download' }).click()
  await expect(page.locator('[data-ink-form-alert-message]')).toHaveText(
    'Saving is not available right now. Check your connection and try again.'
  )
  await expect(page.getByTestId('errors')).toHaveText('SaveFailed')
})
