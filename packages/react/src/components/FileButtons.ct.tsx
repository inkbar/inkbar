import { readFile } from 'node:fs/promises'

import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-react'

import { guardConsole } from '../../playwright/console-guard'
import { FileHarness as Harness } from '../../playwright/harness/FileHarness'

const assets = browserAssets()
guardConsole(test)

test('download saves the opened file under its name, and print loads it to print', async ({
  mount,
  page,
}) => {
  const cmp = await mount(<Harness src={fixtureUrl('text-simple')} assets={assets} />)
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
  const cmp = await mount(
    <Harness src={fixtureUrl('text-simple')} assets={assets} filename="Lease.pdf" />
  )
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  const saving = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download' }).click()
  expect((await saving).suggestedFilename()).toBe('Lease.pdf')

  await cmp.locator('[data-ink-scroll]').focus()
  const byKey = page.waitForEvent('download')
  await page.keyboard.press('ControlOrMeta+s')
  expect((await byKey).suggestedFilename()).toBe('text-simple.pdf')
})
