import { fileURLToPath } from 'node:url'

// eslint-disable-next-line import-x/no-named-as-default
import AxeBuilder from '@axe-core/playwright'
import { guardConsole } from '@inkbar/sandbox-shared/console-guard'
import { expect, test, type Page } from '@playwright/test'

const guard = guardConsole(test)

/** Every framework page meets the same contract; later tasks add their id here. */
const FRAMEWORKS = ['react', 'vue'] as const

/** The sample holds three NI numbers, three emails and three phone numbers. */
const SAMPLE_SUGGESTIONS = '9 suggestions'

const textSimple = fileURLToPath(
  new URL('../../../fixtures/pdf/text-simple.pdf', import.meta.url)
)

/** One page and no annotations, unlike the three-page sample, so a swap is unmistakable. */
const onePage = fileURLToPath(
  new URL('../../../fixtures/pdf/text-cjk.pdf', import.meta.url)
)

async function waitForFirstPage(page: Page): Promise<void> {
  await expect(page.locator('[data-ink-root]')).toHaveAttribute('data-state', 'ready', {
    timeout: 20_000,
  })
  await expect(
    page.locator('.ink-page[data-page="0"] canvas[data-ink-canvas]')
  ).toBeVisible({
    timeout: 20_000,
  })
}

for (const framework of FRAMEWORKS) {
  test.describe(framework, () => {
    test('renders the sample with its embedded annotations', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      await expect(page.locator('[data-ink-root]')).toHaveCount(1)
      await expect(
        page.locator('.ink-page[data-page="0"] .ink-annotation[data-locked]')
      ).toHaveCount(2)
    })

    test('suggests redactions once, then finds nothing new', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      const suggest = page.getByRole('button', { name: 'Suggest redactions' })
      const result = page.locator('.demo-result')
      await suggest.click()
      await expect(result).toHaveText(SAMPLE_SUGGESTIONS)
      await expect(page.locator('.ink-annotation[data-origin="suggested"]')).toHaveCount(
        9
      )
      await suggest.click()
      await expect(result).toHaveText('0 suggestions')
      await expect(page.locator('.ink-annotation[data-origin="suggested"]')).toHaveCount(
        9
      )
    })

    test('undo removes the last change', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      const undo = page.getByRole('button', { name: 'Undo' })
      await expect(undo).toBeDisabled()
      await page.getByRole('button', { name: 'Suggest redactions' }).click()
      await expect(page.locator('.demo-result')).toHaveText(SAMPLE_SUGGESTIONS)
      await expect(undo).toBeEnabled()
      await undo.click()
      await expect(page.locator('.ink-annotation[data-origin="suggested"]')).toHaveCount(
        8
      )
    })

    test('opens a local PDF in place of the sample', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      await page.locator('input[type=file]').setInputFiles(onePage)
      await expect(page.locator('[data-file-status]')).toHaveText('Showing text-cjk.pdf.')
      await waitForFirstPage(page)
      await expect(page.locator('[data-ink-page-count]')).toHaveText('of 1')
      await expect(page.locator('.ink-annotation[data-locked]')).toHaveCount(0)
    })

    test('refuses a file that is not a PDF and keeps the document', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      await page.locator('input[type=file]').setInputFiles({
        name: 'notes.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('not a pdf'),
      })
      await expect(page.locator('[data-file-status]')).toHaveText(
        'notes.txt is not a PDF.'
      )
      await expect(page.locator('[data-ink-page-count]')).toHaveText('of 3')
    })

    test('shows an error for a broken PDF and recovers on the next file', async ({
      page,
    }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      await page.locator('input[type=file]').setInputFiles({
        name: 'broken.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.7 this is not really a PDF'),
      })
      await expect(page.locator('[data-ink-root]')).toHaveAttribute('data-state', 'error')
      await expect(page.getByText('This document could not be opened.')).toBeVisible()
      // PDF.js logs its parse failure; that is the expected outcome of this file.
      guard.take(/./)
      await page.locator('input[type=file]').setInputFiles(textSimple)
      await waitForFirstPage(page)
    })

    test('has no horizontal scroll at phone width', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      await page.locator('details.source summary').click()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(overflow).toBe(0)
    })

    test('has no axe violations with the source open', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      await page.locator('details.source summary').click()
      const { violations } = await new AxeBuilder({ page }).analyze()
      expect(violations).toEqual([])
    })
  })
}
