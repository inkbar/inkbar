import { fileURLToPath } from 'node:url'

// eslint-disable-next-line import-x/no-named-as-default
import AxeBuilder from '@axe-core/playwright'
import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type Page } from '@playwright/test'

const guard = guardConsole(test)

/** Every framework page meets the same contract; later tasks add their id here. */
const FRAMEWORKS = ['react', 'vue', 'svelte', 'vanilla'] as const

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

/**
 * Drags out a shape in the page's top margin, clear of the sample's own annotations and
 * inside the window (the fitted page runs past the bottom of it). Offsets are CSS px from
 * the page's top-left.
 */
async function dragShape(page: Page, from = [40, 30], to = [200, 100]): Promise<void> {
  const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
  await page.mouse.move(box.x + from[0]!, box.y + from[1]!)
  await page.mouse.down()
  await page.mouse.move(box.x + to[0]!, box.y + to[1]!, { steps: 6 })
  await page.mouse.up()
}

const shapeButton = (page: Page) => page.getByRole('button', { name: /^Shape: / })
const sessionShape = (page: Page, type: string) =>
  page.locator(
    `.ink-page[data-page="0"] .ink-annotation[data-type="${type}"][data-source="session"]`
  )

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

    test('undo removes a whole suggestion run, redo restores it', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      const undo = page.getByRole('button', { name: 'Undo' })
      const redo = page.getByRole('button', { name: 'Redo' })
      await expect(undo).toBeDisabled()
      await page.getByRole('button', { name: 'Suggest redactions' }).click()
      await expect(page.locator('.demo-result')).toHaveText(SAMPLE_SUGGESTIONS)
      await undo.click()
      await expect(page.locator('.ink-annotation[data-origin="suggested"]')).toHaveCount(
        0
      )
      await redo.click()
      await expect(page.locator('.ink-annotation[data-origin="suggested"]')).toHaveCount(
        9
      )
    })

    test('opens a local PDF in place of the sample', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      await page.locator('input[type=file]').setInputFiles(onePage)
      await expect(page.locator('[data-file-status]')).toHaveText('Opened text-cjk.pdf.')
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
      // Scoped to the viewer: the plain TypeScript page's source panel holds the same words.
      await expect(
        page.locator('[data-ink-root]').getByText('This document could not be opened.')
      ).toBeVisible()
      // PDF.js logs its parse failure; that is the expected outcome of this file.
      guard.take(/./)
      await page.locator('input[type=file]').setInputFiles(textSimple)
      await waitForFirstPage(page)
      await expect(page.locator('[data-file-status]')).toHaveText(
        'Opened text-simple.pdf.'
      )
    })

    test('ignores a suggestion run that a new file interrupts', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      await page.getByRole('button', { name: 'Suggest redactions' }).click()
      // Straight away, inside the run's delay: the old document is destroyed under it.
      await page.locator('input[type=file]').setInputFiles(onePage)
      await waitForFirstPage(page)
      await expect(page.locator('[data-ink-page-count]')).toHaveText('of 1')
      // Let the interrupted run's 400 ms delay end, so a rejection would reach the console guard.
      await page.waitForTimeout(800)
      await expect(page.locator('.demo-result')).not.toHaveText(
        'Could not check this document.'
      )
    })

    test('select text then rectangle select a note', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      const selectText = page.getByRole('button', { name: 'Select text', exact: true })
      await expect(selectText).toHaveAttribute('aria-pressed', 'true')

      // A drag across a line of text selects it natively.
      const span = page
        .locator('.ink-page[data-page="0"] [data-ink-text-layer] span')
        .filter({ hasText: /\w{4}/ })
        .first()
      const line = (await span.boundingBox())!
      await page.mouse.move(line.x + 1, line.y + line.height / 2)
      await page.mouse.down()
      await page.mouse.move(line.x + line.width - 1, line.y + line.height / 2, {
        steps: 5,
      })
      await page.mouse.up()
      expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).not.toBe(
        ''
      )

      // A note in the page's bottom margin, then a marquee around it.
      const pageBox = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
      await page.getByRole('button', { name: 'Add note' }).click()
      await page.mouse.click(
        pageBox.x + pageBox.width - 40,
        pageBox.y + pageBox.height - 40
      )
      const note = page.locator(
        '.ink-page[data-page="0"] .ink-annotation[data-type="text"]'
      )
      await expect(note).toHaveCount(1)
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Rectangle select' }).click()
      // A press on empty space clears the selection.
      await page.mouse.click(
        pageBox.x + pageBox.width - 120,
        pageBox.y + pageBox.height - 40
      )
      await expect(note).toHaveAttribute('data-state', /idle|hover/)
      const box = (await note.boundingBox())!
      await page.mouse.move(box.x - 20, box.y - 20)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width + 10, box.y + box.height + 10, { steps: 5 })
      await page.mouse.up()
      await expect(note).toHaveAttribute('data-state', 'selected')
    })

    test('a drag that starts on a highlight selects text, not the highlight', async ({
      page,
    }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      const span = page
        .locator('.ink-page[data-page="0"] [data-ink-text-layer] span')
        .filter({ hasText: /\w{8}/ })
        .first()
      const text = (await span.textContent()) ?? ''
      const line = (await span.boundingBox())!
      const midY = line.y + line.height / 2

      // Highlight the line with the highlight tool.
      await page.getByRole('button', { name: 'Highlight', exact: true }).click()
      await page.mouse.move(line.x + 1, midY)
      await page.mouse.down()
      await page.mouse.move(line.x + line.width - 1, midY, { steps: 5 })
      await page.mouse.up()
      const highlight = page.locator(
        '.ink-page[data-page="0"] .ink-annotation[data-type="highlight"][data-source="session"]'
      )
      await expect(highlight).toHaveCount(1)

      await page.getByRole('button', { name: 'Select text', exact: true }).click()
      await page.evaluate(() => window.getSelection()?.removeAllRanges())
      // A real drag from a point on the highlight across part of its text.
      const onHighlight = await page.evaluate(
        ([x, y]) =>
          document
            .elementFromPoint(x!, y!)
            ?.closest('[data-annotation]')
            ?.getAttribute('data-type') ?? null,
        [line.x + 2, midY]
      )
      expect(onHighlight).toBe('highlight')
      await page.mouse.move(line.x + 2, midY)
      await page.mouse.down()
      await page.mouse.move(line.x + line.width * 0.6, midY, { steps: 8 })
      await page.mouse.up()
      const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '')
      expect(selected.trim()).not.toBe('')
      expect(text).toContain(selected.trim())
      await expect(page.locator('.ink-annotation[data-state="selected"]')).toHaveCount(0)
    })

    test('line style changes a drawn rectangle', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      await shapeButton(page).click()
      await dragShape(page)
      await expect(sessionShape(page, 'square')).toHaveCount(1)
      const rect = sessionShape(page, 'square').locator('rect')
      // The page is fitted to the window: the stroke is the width in points times the scale.
      const stroke = async () => Number(await rect.getAttribute('stroke-width'))
      const thin = await stroke()
      await expect(rect).not.toHaveAttribute('stroke-dasharray', /.+/)
      await page.getByRole('button', { name: 'Line style' }).click()
      await page.getByRole('menuitemradio', { name: '6 pt', exact: true }).click()
      await expect.poll(async () => (await stroke()) / thin).toBeCloseTo(6, 3)
      await page.getByRole('menuitemradio', { name: 'Dashed', exact: true }).click()
      await expect(rect).toHaveAttribute('stroke-dasharray', /^[\d.]+ [\d.]+$/)
    })

    test('fill colour applies to a selected rectangle', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      await shapeButton(page).click()
      await dragShape(page)
      await expect(sessionShape(page, 'square')).toHaveCount(1)
      const rect = sessionShape(page, 'square').locator('rect')
      await expect(rect).toHaveAttribute('fill', 'none')
      await page.getByRole('button', { name: 'Fill colour' }).click()
      await page.getByRole('menuitemradio', { name: '#34C759', exact: true }).click()
      await expect(rect).toHaveAttribute('fill', /#34c759/i)
      await page.getByRole('menuitemradio', { name: 'No fill', exact: true }).click()
      await expect(rect).toHaveAttribute('fill', 'none')
    })

    test('draw a rectangle and an arrow', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      await shapeButton(page).click()
      await expect(shapeButton(page)).toHaveAttribute('aria-pressed', 'true')
      await dragShape(page)
      await expect(sessionShape(page, 'square')).toHaveCount(1)

      await page.getByRole('button', { name: 'Choose shape' }).click()
      await page.getByRole('menuitemradio', { name: 'Arrow', exact: true }).click()
      await expect(shapeButton(page)).toHaveAccessibleName('Shape: Arrow')
      await dragShape(page, [260, 30], [400, 100])
      const arrow = sessionShape(page, 'line')
      await expect(arrow).toHaveCount(1)
      await expect(arrow.locator('[data-ending="tail"]')).toHaveCount(1)
      await expect(sessionShape(page, 'square')).toHaveCount(1)
    })

    test('type into a new text box', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      const text = page.getByRole('button', { name: 'Text', exact: true })
      await text.click()
      await expect(text).toHaveAttribute('aria-pressed', 'true')
      const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
      await page.mouse.click(box.x + 40, box.y + 30)
      const editor = page.getByRole('textbox', { name: 'Text box' })
      await expect(editor).toBeFocused()
      await page.keyboard.type('Hello')
      await page.keyboard.press('Enter')
      await page.keyboard.type('there')
      await page.keyboard.press('Escape')
      await expect(editor).toHaveCount(0)
      const created = sessionShape(page, 'freetext')
      await expect(created).toHaveCount(1)
      await expect(created.locator('.ink-free-text')).toHaveText('Hello\nthere')
      // Creating and typing are one step: undo takes the whole box away.
      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(created).toHaveCount(0)
    })

    test('add a speech bubble with text', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      await page.getByRole('button', { name: 'Choose shape' }).click()
      await page
        .getByRole('menuitemradio', { name: 'Speech bubble', exact: true })
        .click()
      await expect(shapeButton(page)).toHaveAccessibleName('Shape: Speech bubble')
      await dragShape(page, [40, 30], [200, 100])
      const editor = page.getByRole('textbox', { name: 'Text box' })
      await expect(editor).toBeFocused()
      await page.keyboard.type('Hello')
      await page.keyboard.press('Escape')
      await expect(editor).toHaveCount(0)
      const bubble = sessionShape(page, 'freetext')
      await expect(bubble).toHaveCount(1)
      await expect(bubble.locator('path.ink-bubble')).toHaveCount(1)
      await expect(bubble.locator('.ink-free-text')).toHaveText('Hello')
    })

    test('make a text box bold and centred', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      await page.getByRole('button', { name: 'Text', exact: true }).click()
      const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
      await page.mouse.click(box.x + 40, box.y + 30)
      await expect(page.getByRole('textbox', { name: 'Text box' })).toBeFocused()
      await page.keyboard.type('Hello')
      await page.keyboard.press('Escape')
      const created = sessionShape(page, 'freetext')
      await expect(created).toHaveCount(1)
      const trigger = page.getByRole('button', { name: 'Text style', exact: true })
      await created.click()
      await expect(trigger).toBeEnabled()
      await trigger.click()
      const panel = page.getByRole('dialog', { name: 'Text style' })
      await panel.getByRole('button', { name: 'Bold', exact: true }).click()
      await panel.getByRole('radio', { name: 'Align centre' }).click()
      const text = created.locator('.ink-free-text')
      await expect(text).toHaveCSS('font-weight', '700')
      await expect(text).toHaveCSS('text-align', 'center')
      await page.keyboard.press('Escape')
      await expect(panel).toHaveCount(0)
    })

    test('draw two joined strokes', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      await page.getByRole('button', { name: 'Draw', exact: true }).click()
      await dragShape(page, [40, 30], [200, 60])
      await dragShape(page, [40, 90], [200, 120])
      const ink = sessionShape(page, 'ink')
      await expect(ink).toHaveCount(1)
      await expect(ink.locator('path.ink-stroke')).toHaveCount(2)
      // Each stroke is its own undo step.
      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(ink.locator('path.ink-stroke')).toHaveCount(1)
    })

    test('sketch a circle', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      await page.getByRole('button', { name: 'Sketch', exact: true }).click()
      const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
      const at = (i: number) => {
        const t = (i / 40) * Math.PI * 2
        return [box.x + 150 + 50 * Math.cos(t), box.y + 110 + 45 * Math.sin(t)] as const
      }
      await page.mouse.move(...at(0))
      await page.mouse.down()
      for (let i = 1; i <= 42; i++) await page.mouse.move(...at(i))
      await page.mouse.up()
      await expect(sessionShape(page, 'circle')).toHaveCount(1)
      await expect(sessionShape(page, 'ink')).toHaveCount(0)
      // One undo brings the stroke back.
      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(sessionShape(page, 'ink')).toHaveCount(1)
      await expect(sessionShape(page, 'circle')).toHaveCount(0)
    })

    test('has no horizontal scroll at phone width', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(overflow).toBe(0)
    })

    test('has no axe violations', async ({ page }) => {
      await page.goto(`${framework}/`)
      await waitForFirstPage(page)
      const { violations } = await new AxeBuilder({ page }).analyze()
      expect(violations).toEqual([])
    })
  })
}
