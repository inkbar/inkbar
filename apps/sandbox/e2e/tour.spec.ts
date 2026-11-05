import { fileURLToPath } from 'node:url'

import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type Page } from '@playwright/test'
import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib'

import { FRAMEWORK_ORDER } from '../src/shell/frameworks.ts'
import { makeDocument } from '../vite/documents/index.ts'

guardConsole(test)

/** A FreeText callout stored the standard way, with its own appearance. */
const standardCallout = fileURLToPath(
  new URL('../../../fixtures/pdf/standard-callout.pdf', import.meta.url)
)

const MARK_TYPES: Record<string, string> = {
  Highlight: 'highlight',
  Underline: 'underline',
  Squiggly: 'squiggly',
  StrikeOut: 'strikeout',
  Square: 'square',
  Circle: 'circle',
  Line: 'line',
  Polygon: 'polygon',
  Ink: 'ink',
  FreeText: 'freetext',
  Text: 'text',
}

/**
 * The marks the viewer draws per page, read from the tour document itself. A reply (it has
 * /IRT) lives in its note's thread, and the signature stamp is painted into the page by PDF.js
 * with no overlay of its own, so neither is a mark.
 */
async function embeddedMarksByPage(): Promise<string[][]> {
  const d = await PDFDocument.load(await makeDocument('tour'))
  return d.getPages().map((p) =>
    (p.node.lookupMaybe(PDFName.of('Annots'), PDFArray)?.asArray() ?? [])
      .map((ref) => d.context.lookup(ref, PDFDict))
      .filter((a) => !a.has(PDFName.of('IRT')))
      .map((a) => MARK_TYPES[String(a.get(PDFName.of('Subtype'))).slice(1)])
      .filter((t): t is string => t !== undefined)
  )
}

async function waitForFirstPage(page: Page): Promise<void> {
  await expect(page.locator('[data-scenario-viewer] [data-ink-root]')).toHaveAttribute(
    'data-state',
    'ready',
    { timeout: 20_000 }
  )
  await expect(
    page.locator('.ink-page[data-page="0"] canvas[data-ink-canvas]')
  ).toBeVisible({ timeout: 20_000 })
}

/**
 * Drags out a shape in the page's top margin, clear of the tour's own annotations and inside
 * the window. Offsets are CSS px from the page's top-left.
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

for (const framework of FRAMEWORK_ORDER) {
  test.describe(`${framework} tour`, () => {
    test('renders page 1 with its embedded highlight and note', async ({ page }) => {
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      await expect(page.locator('[data-scenario-viewer] [data-ink-root]')).toHaveCount(1)
      const marks = page.locator('.ink-page[data-page="0"] .ink-annotation')
      // The note's reply shows in its thread, not as a mark of its own.
      await expect(marks).toHaveCount(2)
      await expect(
        marks.evaluateAll((els) => els.map((e) => e.dataset.type))
      ).resolves.toEqual(['highlight', 'text'])
      await expect(
        marks.evaluateAll((els) => els.map((e) => e.dataset.source))
      ).resolves.toEqual(['pdf', 'pdf'])
    })

    test('renders every embedded annotation type of the tour document', async ({
      page,
    }) => {
      const expected = await embeddedMarksByPage()
      // Each type in the document shows up somewhere, so a dropped type cannot hide.
      expect(new Set(expected.flat())).toEqual(
        new Set([
          'highlight',
          'text',
          'underline',
          'squiggly',
          'strikeout',
          'freetext',
          'circle',
          'line',
          'polygon',
          'ink',
          'square',
        ])
      )
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      for (const [index, types] of expected.entries()) {
        await page.locator('input[aria-label="Page"]').fill(String(index + 1))
        await page.keyboard.press('Enter')
        const marks = page.locator(`.ink-page[data-page="${index}"] .ink-annotation`)
        await expect(marks).toHaveCount(types.length)
        await expect(
          marks.evaluateAll((els) => els.map((e) => e.dataset.type))
        ).resolves.toEqual(types)
      }
    })

    test('opens a PDF with a standard callout and gives it a hit area', async ({
      page,
    }) => {
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      await page.locator('input[type=file]').setInputFiles(standardCallout)
      await expect(page.locator('[data-file-status]')).toHaveText(
        'Opened standard-callout.pdf.'
      )
      await waitForFirstPage(page)
      const callout = page.locator(
        '.ink-page[data-page="0"] .ink-annotation[data-type="freetext"][data-source="pdf"]'
      )
      await expect(callout).toHaveCount(1)
      await expect(callout).toHaveAttribute('data-locked', '')
      // PDF.js paints the callout; Inkbar adds only the invisible hit area over it.
      await expect(callout.locator('svg[data-ink-hit]')).toHaveCount(1)
    })

    test('select text then rectangle select a note', async ({ page }) => {
      await page.goto(`./#/${framework}/tour`)
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

    test('select text: a drag across text clears the annotation selection', async ({
      page,
    }) => {
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      const pageBox = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
      await page.getByRole('button', { name: 'Add note' }).click()
      await page.mouse.click(
        pageBox.x + pageBox.width - 40,
        pageBox.y + pageBox.height - 40
      )
      const note = page.locator(
        '.ink-page[data-page="0"] .ink-annotation[data-type="text"]'
      )
      await page.getByRole('button', { name: 'Select text', exact: true }).click()
      await note.click()
      await expect(note).toHaveAttribute('data-state', 'selected')

      const line = (await page
        .locator('.ink-page[data-page="0"] [data-ink-text-layer] span')
        .filter({ hasText: /\w{4}/ })
        .first()
        .boundingBox())!
      await page.mouse.move(line.x + 1, line.y + line.height / 2)
      await page.mouse.down()
      await page.mouse.move(line.x + line.width - 1, line.y + line.height / 2, {
        steps: 5,
      })
      await page.mouse.up()
      await expect(page.locator('.ink-annotation[data-state="selected"]')).toHaveCount(0)
      expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).not.toBe(
        ''
      )
    })

    test('a drag that starts on a highlight selects text, not the highlight', async ({
      page,
    }) => {
      await page.goto(`./#/${framework}/tour`)
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
      // The tool selects what it made; Escape on it clears that.
      await expect(highlight).toHaveAttribute('data-state', 'selected')
      await highlight.focus()
      await page.keyboard.press('Escape')
      await expect(page.locator('.ink-annotation[data-state="selected"]')).toHaveCount(0)

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

    test('highlight text and comment on it', async ({ page }) => {
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      const span = page
        .locator('.ink-page[data-page="0"] [data-ink-text-layer] span')
        .filter({ hasText: /\w{8}/ })
        .first()
      const line = (await span.boundingBox())!
      const midY = line.y + line.height / 2

      // Underline the line, chosen from the highlight menu.
      await page.getByRole('button', { name: 'Choose highlight' }).click()
      await page
        .getByRole('menu', { name: 'Highlights' })
        .getByRole('menuitemradio', { name: 'Underline', exact: true })
        .click()
      await page.mouse.move(line.x + 1, midY)
      await page.mouse.down()
      await page.mouse.move(line.x + line.width - 1, midY, { steps: 5 })
      await page.mouse.up()
      const mark = sessionShape(page, 'underline')
      await expect(mark).toHaveCount(1)
      await expect(mark).toHaveAttribute('data-state', 'selected')

      // Activate it and write the first comment, then a reply.
      await mark.focus()
      await page.keyboard.press('Enter')
      const popover = page.locator('[data-ink-thread-popover]')
      await expect(popover).toBeVisible()
      await expect(popover).toHaveAccessibleName('Comment thread')
      await popover.getByRole('textbox', { name: 'Comment' }).fill('Check this line')
      await popover.getByRole('button', { name: 'Comment' }).click()
      await popover.getByRole('textbox', { name: 'Reply' }).fill('Done')
      await popover.getByRole('button', { name: 'Reply' }).click()
      await expect(popover.locator('[data-ink-thread-item]')).toHaveCount(2)
      await popover.getByRole('button', { name: 'Close' }).click()
      await expect(popover).toBeHidden()
      await expect(mark).toHaveCount(1)
      await expect(mark.locator('.ink-comment-marker')).toHaveCount(1)
      await expect(mark).toHaveAccessibleName('Underline with comment')
      // The reply lives in the thread only: no note on the page.
      await expect(
        page.locator('.ink-page[data-page="0"] [data-type="text"][data-source="session"]')
      ).toHaveCount(0)

      // A drag across the commented line still selects its text.
      await page.getByRole('button', { name: 'Select text', exact: true }).click()
      await page.evaluate(() => window.getSelection()?.removeAllRanges())
      await page.mouse.move(line.x + 2, midY)
      await page.mouse.down()
      await page.mouse.move(line.x + line.width * 0.6, midY, { steps: 8 })
      await page.mouse.up()
      const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '')
      expect(selected.trim()).not.toBe('')
    })

    test('a drag across a just-made highlight selects text', async ({ page }) => {
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      const span = page
        .locator('.ink-page[data-page="0"] [data-ink-text-layer] span')
        .filter({ hasText: /\w{8}/ })
        .first()
      const text = (await span.textContent()) ?? ''
      const line = (await span.boundingBox())!
      const midY = line.y + line.height / 2
      await page.getByRole('button', { name: 'Highlight', exact: true }).click()
      await page.mouse.move(line.x + 1, midY)
      await page.mouse.down()
      await page.mouse.move(line.x + line.width - 1, midY, { steps: 5 })
      await page.mouse.up()
      const highlight = sessionShape(page, 'highlight')
      await expect(highlight).toHaveAttribute('data-state', 'selected')
      const before = await highlight.boundingBox()

      // Straight on, still selected: the drag selects text rather than moving the mark.
      await page.getByRole('button', { name: 'Select text', exact: true }).click()
      await page.mouse.move(line.x + 2, midY)
      await page.mouse.down()
      await page.mouse.move(line.x + line.width * 0.6, midY, { steps: 8 })
      await page.mouse.up()
      const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '')
      expect(selected.trim()).not.toBe('')
      expect(text).toContain(selected.trim())
      expect(await highlight.boundingBox()).toEqual(before)
    })

    test('line style changes a drawn rectangle', async ({ page }) => {
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      await shapeButton(page).click()
      await dragShape(page)
      await expect(sessionShape(page, 'square')).toHaveCount(1)
      const rect = sessionShape(page, 'square').locator('rect:not([data-ink-hit-stroke])')
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
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      await shapeButton(page).click()
      await dragShape(page)
      await expect(sessionShape(page, 'square')).toHaveCount(1)
      const rect = sessionShape(page, 'square').locator('rect:not([data-ink-hit-stroke])')
      await expect(rect).toHaveAttribute('fill', 'none')
      await page.getByRole('button', { name: 'Fill colour' }).click()
      await page.getByRole('menuitemradio', { name: '#34C759', exact: true }).click()
      await expect(rect).toHaveAttribute('fill', /#34c759/i)
      await page.getByRole('menuitemradio', { name: 'No fill', exact: true }).click()
      await expect(rect).toHaveAttribute('fill', 'none')
    })

    test('a click on empty page after a shape switches back to Select text', async ({
      page,
    }) => {
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      await shapeButton(page).click()
      await dragShape(page)
      await expect(sessionShape(page, 'square')).toHaveCount(1)
      const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
      await page.mouse.click(box.x + 300, box.y + 60)
      await expect(
        page.getByRole('button', { name: 'Select text', exact: true })
      ).toHaveAttribute('aria-pressed', 'true')
      await expect(shapeButton(page)).toHaveAttribute('aria-pressed', 'false')
      await expect(sessionShape(page, 'square')).toHaveCount(1)
    })

    test('draw a rectangle and an arrow', async ({ page }) => {
      await page.goto(`./#/${framework}/tour`)
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

    test('the line style arrowheads apply to new lines and arrows', async ({ page }) => {
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      await shapeButton(page).click()
      const kind = async (name: string) => {
        await page.getByRole('button', { name: 'Choose shape' }).click()
        await page.getByRole('menuitemradio', { name, exact: true }).click()
        await expect(shapeButton(page)).toHaveAccessibleName(`Shape: ${name}`)
      }
      const arrowheads = async (name: string) => {
        await page.getByRole('button', { name: 'Line style' }).click()
        await page.getByRole('menuitemradio', { name, exact: true }).click()
        await page.keyboard.press('Escape')
      }
      const lines = sessionShape(page, 'line')

      await kind('Line')
      await arrowheads('Arrowheads at both ends')
      await dragShape(page, [40, 30], [200, 100])
      await expect(lines).toHaveCount(1)
      await expect(lines.nth(0).locator('[data-ending]')).toHaveCount(2)

      await kind('Arrow')
      await page.keyboard.press('Escape')
      await arrowheads('No arrowheads')
      await dragShape(page, [260, 30], [400, 100])
      await expect(lines).toHaveCount(2)
      await expect(lines.nth(1).locator('[data-ending]')).toHaveCount(0)
    })

    test('type into a new text box', async ({ page }) => {
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      const text = page.getByRole('button', { name: 'Text box', exact: true })
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
      // toHaveText folds whitespace, so read the text to check the line break.
      expect(await created.locator('.ink-free-text').textContent()).toBe('Hello\nthere')
      // Creating and typing are one step: undo takes the whole box away.
      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(created).toHaveCount(0)
    })

    test('add a speech bubble with text', async ({ page }) => {
      await page.goto(`./#/${framework}/tour`)
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

    test('add a loupe', async ({ page }) => {
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      await page.getByRole('button', { name: 'Choose shape' }).click()
      await page.getByRole('menuitemradio', { name: 'Loupe', exact: true }).click()
      await expect(shapeButton(page)).toHaveAccessibleName('Shape: Loupe')
      await dragShape(page, [40, 30], [200, 100])
      const loupe = sessionShape(page, 'loupe')
      await expect(loupe).toHaveCount(1)
      await expect(loupe.locator('circle.ink-loupe-rim')).toHaveCount(1)
      // The magnified page lands in the lens canvas.
      await expect
        .poll(() =>
          loupe
            .locator('canvas[data-ink-loupe]')
            .evaluate((c: HTMLCanvasElement) => c.width)
        )
        .toBeGreaterThan(0)
    })

    test('add a mask', async ({ page }) => {
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      await page.getByRole('button', { name: 'Choose shape' }).click()
      await page.getByRole('menuitemradio', { name: 'Mask', exact: true }).click()
      await expect(shapeButton(page)).toHaveAccessibleName('Shape: Mask')
      await dragShape(page, [40, 30], [200, 100])
      const mask = sessionShape(page, 'mask')
      await expect(mask).toHaveCount(1)
      // The page is dimmed outside it, by an even-odd path under the annotations.
      const dim = page.locator('.ink-page[data-page="0"] svg[data-ink-mask-layer] path')
      await expect(dim).toHaveCount(1)
      await expect(dim).toHaveAttribute('fill-rule', 'evenodd')
      await expect(dim).toHaveAttribute('fill-opacity', '0.5')
      // A second mask replaces the first.
      await page.getByRole('button', { name: 'Choose shape' }).click()
      await page.getByRole('menuitemradio', { name: 'Oval mask', exact: true }).click()
      await dragShape(page, [60, 120], [220, 200])
      await expect(mask).toHaveCount(1)
      await expect(
        page.locator('.ink-page[data-page="0"] svg[data-ink-mask-layer]')
      ).toHaveCount(1)
      await expect(mask.locator('ellipse')).toHaveCount(1)
    })

    test('a click on a text box committed by focus leaving keeps the Text tool', async ({
      page,
    }) => {
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      const text = page.locator('[data-ink-tool-button][data-tool="freetext"]')
      await text.click()
      const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
      await page.mouse.click(box.x + 40, box.y + 30)
      const editor = page.getByRole('textbox', { name: 'Text box' })
      await expect(editor).toBeFocused()
      await page.keyboard.type('Hello')
      // Focus moving to the Text style control commits the box and keeps the tool.
      await page.getByRole('button', { name: 'Text style', exact: true }).focus()
      await expect(editor).toHaveCount(0)
      const created = sessionShape(page, 'freetext')
      await expect(created).toHaveCount(1)
      await expect(text).toHaveAttribute('aria-pressed', 'true')
      await created.click()
      await expect(created).toHaveAttribute('aria-pressed', 'true')
      await expect(text).toHaveAttribute('aria-pressed', 'true')
      await expect(created).toHaveCount(1)
    })

    test('a click elsewhere after placing a note drops it and switches to Select text', async ({
      page,
    }) => {
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      await page.getByRole('button', { name: 'Add note', exact: true }).click()
      const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
      await page.mouse.click(box.x + 40, box.y + 30)
      const notes = sessionShape(page, 'text')
      await expect(notes).toHaveCount(1)
      await expect(page.getByRole('dialog', { name: /note/i })).toBeVisible()
      // Beside the note, clear of its popover, which opens below it.
      await page.mouse.click(box.x + 500, box.y + 20)
      await expect(page.getByRole('dialog', { name: /note/i })).toHaveCount(0)
      await expect(notes).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: 'Select text', exact: true })
      ).toHaveAttribute('aria-pressed', 'true')
    })

    test('make a text box bold and centred', async ({ page }) => {
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      await page.getByRole('button', { name: 'Text box', exact: true }).click()
      const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
      await page.mouse.click(box.x + 40, box.y + 30)
      await expect(page.getByRole('textbox', { name: 'Text box' })).toBeFocused()
      await page.keyboard.type('Hello')
      await page.keyboard.press('Escape')
      const created = sessionShape(page, 'freetext')
      await expect(created).toHaveCount(1)
      // Escape commits the box and switches back to Select text, which the click then uses.
      await expect(
        page.getByRole('button', { name: 'Select text', exact: true })
      ).toHaveAttribute('aria-pressed', 'true')
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

    test('a click inside a text box edits it at the click, a drag on its edge moves it', async ({
      page,
    }) => {
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      await page.getByRole('button', { name: 'Text box', exact: true }).click()
      const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
      await page.mouse.click(box.x + 40, box.y + 30)
      const editor = page.getByRole('textbox', { name: 'Text box' })
      await expect(editor).toBeFocused()
      await page.keyboard.type('Hello')
      await page.keyboard.press('Escape')
      const created = sessionShape(page, 'freetext')
      const text = created.locator('.ink-free-text')
      await expect(text).toHaveText('Hello')
      // Just inside the left edge of the second "l".
      const at = await text.evaluate((el) => {
        const range = document.createRange()
        range.setStart(el.firstChild!, 3)
        range.setEnd(el.firstChild!, 4)
        const r = range.getBoundingClientRect()
        return { x: r.left + 1, y: r.top + r.height / 2 }
      })
      await page.mouse.click(at.x, at.y)
      await expect(editor).toBeFocused()
      await page.keyboard.type('X')
      await page.keyboard.press('Escape')
      await expect(editor).toHaveCount(0)
      await expect(text).toHaveText('HelXlo')
      // The cursor says which: text inside the box, move on the band along its edge.
      const cursorAt = (x: number, y: number) =>
        page.evaluate(
          ([px, py]) => getComputedStyle(document.elementFromPoint(px!, py!)!).cursor,
          [x, y]
        )
      expect(await cursorAt(at.x, at.y)).toBe('text')
      // The band along the text box's edge drags the box.
      const before = (await created.boundingBox())!
      const edge = (await text.boundingBox())!
      expect(await cursorAt(edge.x + 1, edge.y + edge.height / 2)).toBe('move')
      await page.mouse.move(edge.x + 1, edge.y + edge.height / 2)
      await page.mouse.down()
      await page.mouse.move(edge.x + 31, edge.y + edge.height / 2 + 20, { steps: 4 })
      await page.mouse.move(edge.x + 61, edge.y + edge.height / 2 + 40, { steps: 4 })
      await page.mouse.up()
      await expect(editor).toHaveCount(0)
      await expect
        .poll(async () => (await created.boundingBox())!.x - before.x)
        .toBeCloseTo(60, 0)
    })

    test('draw two joined strokes', async ({ page }) => {
      await page.goto(`./#/${framework}/tour`)
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
      await page.goto(`./#/${framework}/tour`)
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

    test('create and place a typed signature', async ({ page }) => {
      await page.goto(`./#/${framework}/tour`)
      await waitForFirstPage(page)
      await page.getByRole('button', { name: 'Choose signature' }).click()
      await page.getByRole('menuitem', { name: 'Create signature' }).click()
      const dialog = page.getByRole('dialog', { name: 'Create signature' })
      await dialog.getByRole('tab', { name: 'Type' }).click()
      await dialog.getByLabel('Name').fill('Ada Lovelace')
      // The sandbox's handwriting font is offered and loads.
      const font = dialog.getByRole('radio', { name: 'Dancing Script' })
      await expect(font).toHaveAttribute('aria-checked', 'true')
      await expect
        .poll(() => page.evaluate(() => document.fonts.check('16px "Dancing Script"')))
        .toBe(true)
      await dialog.getByRole('button', { name: 'Save' }).click()
      await expect(dialog).toHaveCount(0)
      const sign = page.getByRole('button', { name: 'Sign', exact: true })
      await expect(sign).toHaveAttribute('aria-pressed', 'true')
      const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
      await page.mouse.click(box.x + 150, box.y + 60)
      const stamp = sessionShape(page, 'stamp')
      await expect(stamp).toHaveCount(1)
      await expect(stamp).toHaveAccessibleName('Signature')
      await expect(stamp.locator('img.ink-stamp')).toHaveAttribute(
        'src',
        /^data:image\/png;base64,/
      )
      // The signature is kept for next time.
      await page.reload()
      await waitForFirstPage(page)
      await page.getByRole('button', { name: 'Choose signature' }).click()
      await expect(
        page.getByRole('menuitemradio', { name: 'Signature 1', exact: true })
      ).toBeVisible()
    })
  })
}
