import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { guardConsole } from './console-guard'
import { expectReader, READERS, waitForFirstPage, withReader } from './helpers'

import type {} from '../src/redaction-page'

guardConsole(test)

const textLayer = (page: Page) =>
  page.locator('.ink-page[data-page="0"] [data-ink-text-layer]')
const marks = (page: Page) => page.locator('.ink-annotation[data-type="redact"]')
const alert = (page: Page) => page.locator('[data-ink-form-alert-message]')
const applyButton = (page: Page) => page.getByRole('button', { name: 'Apply redactions' })

/** Drags `tool` across the box of the text-layer span holding `text`, `pad` px around it. */
async function dragOver(page: Page, tool: string, text: string, pad = 6): Promise<void> {
  await page.locator(`[data-tool="${tool}"]`).click()
  const span = textLayer(page).locator('span', { hasText: text })
  const box = (await span.boundingBox())!
  await page.mouse.move(box.x - pad, box.y - pad)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width + pad, box.y + box.height + pad, { steps: 5 })
  await page.mouse.up()
}

/** Marks SECRET-ALPHA, the fixture's secret, with the redact-area tool. */
async function markSecret(page: Page): Promise<void> {
  await expect(textLayer(page)).toContainText('SECRET-ALPHA')
  await dragOver(page, 'redact-area', 'SECRET-ALPHA')
  await expect(marks(page)).toHaveCount(1)
}

/** Waits for the redacted file to show, with its text read again. */
async function redactedShown(page: Page): Promise<void> {
  await expect(page.getByTestId('status')).toHaveAttribute('data-applied', '1')
  await expect(alert(page)).toHaveText('1 redaction applied.')
  await expect(textLayer(page)).toContainText('KEEP-BETA')
}

async function expectNoSecret(page: Page): Promise<void> {
  await expect(textLayer(page)).not.toContainText('SECRET')
  await expect(textLayer(page)).not.toContainText('ALPHA')
}

// Each scenario runs with PDF.js reading the file, and again with the engine.
for (const reader of READERS)
  test.describe(`read by ${reader}`, () => {
    test('confirm, apply, reopen: the mark is gone and the text cannot be selected', async ({
      page,
    }) => {
      await page.goto(withReader('/?doc=redact-text', reader))
      await waitForFirstPage(page)
      await expectReader(page, reader)
      await expect(applyButton(page)).toBeDisabled()
      await page.getByRole('button', { name: 'Zoom in' }).click()
      const zoom = page.getByRole('combobox', { name: 'Zoom' })
      await expect(zoom).not.toHaveText('Fit width')
      const zoomed = await zoom.textContent()
      await markSecret(page)

      await applyButton(page).click()
      const dialog = page.locator('[data-ink-redaction-dialog]')
      await expect(dialog).toContainText(
        'This removes the content under 1 mark on 1 page.'
      )
      await dialog.getByRole('button', { name: 'Apply' }).click()
      await expect(dialog).toHaveCount(0)

      await redactedShown(page)
      await expectNoSecret(page)
      await expect(marks(page)).toHaveCount(0)
      await expect(applyButton(page)).toBeDisabled()
      // The same zoom, and a history of its own: nothing to undo.
      await expect(zoom).toHaveText(zoomed!)
      await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()

      // Download gives the redacted file, under the name it was opened with.
      const saving = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download' }).click()
      const file = await saving
      expect(file.suggestedFilename()).toBe('redact-text.pdf')
      const downloaded = new Uint8Array(await readFile(await file.path()))
      const heard = await page.evaluate(() => window.__inkbarRedacted!.at(-1)!)
      expect([...downloaded]).toEqual(heard)
    })

    test('the redacted event carries bytes that reopen without the secret', async ({
      page,
    }) => {
      await page.goto(withReader('/?doc=redact-text&confirm=0', reader))
      await waitForFirstPage(page)
      await expectReader(page, reader)
      await markSecret(page)
      await applyButton(page).click()
      await redactedShown(page)
      const heard = await page.evaluate(() => window.__inkbarRedacted!)
      expect(heard).toHaveLength(1)
      expect(Buffer.from(heard[0]!).subarray(0, 5).toString()).toBe('%PDF-')

      // The host passes the bytes as a new source: they open as any file does.
      await page.getByTestId('open-redacted').click()
      await expect(page.locator('[data-ink-root]')).toHaveAttribute('data-state', 'ready')
      await expect(textLayer(page)).toContainText('KEEP-BETA')
      await expectNoSecret(page)
      await expect(marks(page)).toHaveCount(0)
    })

    test('controlled annotations with history on: the list has no marks and Undo is unavailable', async ({
      page,
    }) => {
      await page.goto(withReader('/?doc=redact-text&controlled=1', reader))
      await waitForFirstPage(page)
      await expectReader(page, reader)
      const hostList = page.getByTestId('host-list')
      // A shape over KEEP-BETA, which stays, then the mark.
      await dragOver(page, 'shape', 'KEEP-BETA')
      await expect(hostList).not.toHaveText('')
      const kept = await hostList.textContent()
      await markSecret(page)
      await expect(hostList).toHaveText(`${kept} redact`)
      const undo = page.getByRole('button', { name: 'Undo' })
      await expect(undo).toBeEnabled()

      await applyButton(page).click()
      await page.locator('[data-ink-redaction-confirm]').click()
      await redactedShown(page)
      await expectNoSecret(page)
      await expect(hostList).toHaveText(kept!)
      await expect(marks(page)).toHaveCount(0)
      await expect(page.locator(`.ink-annotation[data-type="${kept}"]`)).toHaveCount(1)
      await expect(undo).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled()
      // The host's answers to the proposals are no steps, however late they settle.
      await page.waitForTimeout(300)
      await expect(undo).toBeDisabled()
      await expect(hostList).toHaveText(kept!)

      // The reader's first edit on the redacted file is a step, and Undo takes it away again.
      await page.locator('[data-ink-form-alert-ok]').click()
      await page.locator('[data-tool="shape"]').click()
      const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
      await page.mouse.move(box.x + 100, box.y + 60)
      await page.mouse.down()
      await page.mouse.move(box.x + 200, box.y + 120, { steps: 5 })
      await page.mouse.up()
      await expect(hostList).toHaveText(`${kept} ${kept}`)
      await expect(undo).toBeEnabled()
      await undo.click()
      await expect(hostList).toHaveText(kept!)
      await expect(undo).toBeDisabled()
    })

    test('a mark over content the apply cannot remove is refused, and the mark is selected', async ({
      page,
    }) => {
      await page.goto(withReader('/?doc=redact-drawing-hatch&confirm=0', reader))
      await waitForFirstPage(page)
      await expectReader(page, reader)
      // Over the band the hatch pattern fills: (110, 110) to (190, 190) on the 400 by 300 pt page.
      await page.locator('[data-tool="redact-area"]').click()
      const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
      const scale = box.width / 400
      await page.mouse.move(box.x + 110 * scale, box.y + (300 - 190) * scale)
      await page.mouse.down()
      await page.mouse.move(box.x + 190 * scale, box.y + (300 - 110) * scale, {
        steps: 5,
      })
      await page.mouse.up()
      await expect(marks(page)).toHaveCount(1)
      await page.locator('[data-tool="select-text"]').click()
      await page.locator('[data-ink-scroll]').focus()
      await page.keyboard.press('Escape')
      await expect(marks(page)).not.toHaveAttribute('data-state', 'selected')

      await applyButton(page).click()
      await expect(alert(page)).toHaveText(
        '1 mark covers content that cannot be removed. Move or delete it and try again.'
      )
      // The document is as it was: the mark is still there, now selected, and nothing was
      // handed over.
      await expect(marks(page)).toHaveCount(1)
      await expect(marks(page)).toHaveAttribute('data-state', 'selected')
      await expect(textLayer(page)).toContainText('KEEP-BETA')
      await expect(page.getByTestId('status')).toHaveAttribute('data-applied', '')
      expect(await page.evaluate(() => window.__inkbarRedacted)).toBeUndefined()
      await expect(applyButton(page)).toBeEnabled()
    })

    test('redactionConfirm={false} applies without the dialog', async ({ page }) => {
      await page.goto(withReader('/?doc=redact-text&confirm=0', reader))
      await waitForFirstPage(page)
      await expectReader(page, reader)
      await markSecret(page)
      await applyButton(page).click()
      await redactedShown(page)
      await expectNoSecret(page)
      await expect(page.locator('[data-ink-redaction-dialog]')).toHaveCount(0)
    })
  })
