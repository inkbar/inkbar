import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { guardConsole } from './console-guard'
import { waitForFirstPage } from './helpers'

guardConsole(test)

/** Whether `bytes` hold an annotation Inkbar wrote: its `/INKB_Gloss` entry. */
const holdsGloss = (bytes: Uint8Array): boolean =>
  Buffer.from(bytes).toString('latin1').includes('/INKB_Gloss')

/** Clicks Download and reads the file the browser saved. */
async function download(page: Page): Promise<Uint8Array> {
  const saving = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download' }).click()
  const file = await saving
  expect(file.suggestedFilename()).toBe('text-simple.pdf')
  return new Uint8Array(await readFile(await file.path()))
}

/** Adds a note on page 1 with the note tool and gives it its text. */
async function addNote(page: Page): Promise<void> {
  await page.locator('[data-tool="note"]').click()
  const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
  await page.mouse.click(box.x + 300, box.y + 300)
  const popover = page.locator('[data-ink-thread-popover]')
  await popover.getByRole('textbox', { name: 'Comment' }).fill('Check this paragraph')
  await popover.getByRole('button', { name: 'Comment' }).click()
  await page.keyboard.press('Escape')
}

test('Download and Print hand over the file with the annotations added in the session', async ({
  page,
}) => {
  const engineFiles: string[] = []
  page.on('request', (r) => {
    if (/inkbar-pdfium|@inkbar\/engine|packages\/engine/.test(r.url()))
      engineFiles.push(r.url())
  })
  await page.goto('/?doc=text-simple')
  await waitForFirstPage(page)

  // Nothing changed: the file as it was opened, and the engine never loads.
  const opened = await download(page)
  expect(holdsGloss(opened)).toBe(false)
  expect(engineFiles).toEqual([])

  await addNote(page)
  const written = await download(page)
  expect(holdsGloss(written)).toBe(true)
  expect(engineFiles).not.toEqual([])
  const downloadButton = page.getByRole('button', { name: 'Download' })
  await expect(downloadButton).toHaveAttribute('aria-busy', 'false')

  // Print loads the same copy into its frame; the dialog itself is the browser's.
  await page.evaluate(() => {
    window.print = () => undefined
  })
  await page.getByRole('button', { name: 'Print' }).click()
  const frame = page.locator('[data-ink-print-frame]')
  await expect(frame).toHaveAttribute('src', /^blob:/)
  const printed = await frame.evaluate(async (f: HTMLIFrameElement) =>
    Array.from(new Uint8Array(await (await fetch(f.src)).arrayBuffer()))
  )
  expect(holdsGloss(new Uint8Array(printed))).toBe(true)
})
