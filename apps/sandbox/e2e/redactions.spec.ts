import { fileURLToPath } from 'node:url'

// eslint-disable-next-line import-x/no-named-as-default
import AxeBuilder from '@axe-core/playwright'
import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type Page } from '@playwright/test'

import { FRAMEWORK_ORDER } from '../src/shell/frameworks.ts'

guardConsole(test)

/**
 * The redactions document's three records hold two NI numbers, five emails and four phone
 * numbers, counting the ones their call notes repeat.
 */
const FOUND = '11 suggestions'
const COUNT = 11

/** One page and no annotations, unlike the redactions document, so a swap is unmistakable. */
const onePage = fileURLToPath(
  new URL('../../../fixtures/pdf/text-cjk.pdf', import.meta.url)
)

const viewer = (page: Page) => page.locator('[data-scenario-viewer]')
const events = (page: Page) => page.locator('aside[aria-label="Events"] ol > li')

/** A suggestion still to review: the plugin draws each as a mark in its page layer. */
const SUGGESTED = '[data-record][data-plugin="sandbox"]'

/** Where Suggest redactions reports what it found: its command's status. */
const RESULT = '.ink-command-status'

const suggestButton = (page: Page) =>
  viewer(page).getByRole('button', { name: 'Suggest redactions' })

const suggestionCard = (page: Page) =>
  page.getByRole('dialog', { name: 'Suggested redaction' })

const mark = (page: Page, id: string) =>
  page.locator(`[data-record="${id}"][data-plugin="sandbox"]`)

const redactions = (page: Page) =>
  page.locator('.ink-page[data-page="0"] .ink-annotation[data-type="redact"]')

async function open(page: Page, framework: string): Promise<void> {
  await page.goto(`./#/${framework}/redactions`)
  await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute(
    'data-state',
    'ready',
    { timeout: 20_000 }
  )
  await expect(
    viewer(page).locator('.ink-page[data-page="0"] canvas[data-ink-canvas]')
  ).toBeVisible({ timeout: 20_000 })
}

/** Opens the scenario and runs Suggest redactions. */
async function suggest(page: Page, framework: string): Promise<void> {
  await open(page, framework)
  await suggestButton(page).click()
  await expect(page.locator(RESULT)).toHaveText(FOUND)
  await expect(page.locator(SUGGESTED)).toHaveCount(COUNT)
}

for (const framework of FRAMEWORK_ORDER) {
  test.describe(framework, () => {
    test(`${framework} redactions: suggests every kind of personal data`, async ({
      page,
    }) => {
      await suggest(page, framework)
      for (const reason of ['National Insurance number', 'Email address', 'Phone number'])
        await expect(
          page.getByRole('button', { name: `Suggested redaction: ${reason}` }).first()
        ).toBeVisible()
    })

    test(`${framework} redactions: suggests once, then finds nothing new`, async ({
      page,
    }) => {
      await suggest(page, framework)
      await suggestButton(page).click()
      await expect(page.locator(RESULT)).toHaveText('0 suggestions')
      await expect(page.locator(SUGGESTED)).toHaveCount(COUNT)
    })

    test(`${framework} redactions: ignores a suggestion run that a new file interrupts`, async ({
      page,
    }) => {
      await open(page, framework)
      await suggestButton(page).click()
      // Straight away, inside the run's delay: the old document is destroyed under it.
      await page.locator('input[type=file]').setInputFiles(onePage)
      await expect(viewer(page).locator('[data-ink-page-count]')).toHaveText('of 1')
      // Let the interrupted run's 400 ms delay end, so a rejection would reach the console guard.
      await page.waitForTimeout(800)
      await expect(page.locator(RESULT)).not.toHaveText('Could not check this document.')
    })

    test(`${framework} redactions: logs the command's status`, async ({ page }) => {
      await suggest(page, framework)
      const commands = events(page).filter({
        has: page.locator('[data-event-name]', { hasText: /^command$/ }),
      })
      await expect(commands.first().locator('.event-payload')).toHaveText(FOUND)
    })

    test(`${framework} redactions: undo removes a whole suggestion run, redo restores it`, async ({
      page,
    }) => {
      await open(page, framework)
      const undo = viewer(page).getByRole('button', { name: 'Undo' })
      const redo = viewer(page).getByRole('button', { name: 'Redo' })
      await expect(undo).toBeDisabled()
      await suggestButton(page).click()
      await expect(page.locator(RESULT)).toHaveText(FOUND)
      await expect(page.locator(SUGGESTED)).toHaveCount(COUNT)
      await undo.click()
      await expect(page.locator(SUGGESTED)).toHaveCount(0)
      await redo.click()
      await expect(page.locator(SUGGESTED)).toHaveCount(COUNT)
    })

    test(`${framework} redactions: Suggest scrolls to the first suggestion, leaving focus on the button`, async ({
      page,
    }) => {
      await open(page, framework)
      const button = suggestButton(page)
      await button.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator(RESULT)).toHaveText(FOUND)
      await expect(mark(page, 'ni-number')).toBeInViewport()
      await expect(button).toBeFocused()
      await expect(suggestionCard(page)).toHaveCount(0)
    })

    test(`${framework} redactions: accept adds a redaction and moves focus to the next suggestion`, async ({
      page,
    }) => {
      await suggest(page, framework)
      const first = mark(page, 'ni-number')
      await expect(first).toHaveAccessibleName(
        'Suggested redaction: National Insurance number'
      )
      await first.click()
      const card = suggestionCard(page)
      await expect(card).toBeVisible()
      await expect(card).toContainText('National Insurance number')
      await expect(card).toContainText('High confidence')
      await expect(card.getByRole('button', { name: 'Accept' })).toBeFocused()
      await card.getByRole('button', { name: 'Accept' }).click()
      await expect(card).toBeHidden()
      await expect(page.locator(SUGGESTED)).toHaveCount(COUNT - 1)
      await expect(first).toHaveCount(0)
      await expect(redactions(page)).toHaveCount(1)
      await expect(mark(page, 'email')).toBeFocused()
    })

    test(`${framework} redactions: dismiss sets a suggestion aside and moves focus to the next`, async ({
      page,
    }) => {
      await suggest(page, framework)
      await mark(page, 'ni-number').click()
      await suggestionCard(page).getByRole('button', { name: 'Dismiss' }).click()
      await expect(suggestionCard(page)).toBeHidden()
      await expect(page.locator(SUGGESTED)).toHaveCount(COUNT - 1)
      await expect(redactions(page)).toHaveCount(0)
      await expect(mark(page, 'email')).toBeFocused()
    })

    test(`${framework} redactions: undo restores an accepted suggestion`, async ({
      page,
    }) => {
      await suggest(page, framework)
      await mark(page, 'ni-number').click()
      await suggestionCard(page).getByRole('button', { name: 'Accept' }).click()
      await expect(redactions(page)).toHaveCount(1)
      await viewer(page).getByRole('button', { name: 'Undo' }).click()
      await expect(redactions(page)).toHaveCount(0)
      await expect(page.locator(SUGGESTED)).toHaveCount(COUNT)
      await mark(page, 'ni-number').click()
      await expect(suggestionCard(page)).toContainText('National Insurance number')
    })

    test(`${framework} redactions: deleting an accepted redaction restores its suggestion`, async ({
      page,
    }) => {
      await suggest(page, framework)
      await mark(page, 'ni-number').click()
      await suggestionCard(page).getByRole('button', { name: 'Accept' }).click()
      await expect(mark(page, 'ni-number')).toHaveCount(0)
      // As a keyboard user would: Accept moves focus to the next mark, and the page's own
      // annotations come before the marks, so Shift+Tab reaches the redaction.
      await expect(mark(page, 'email')).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      await expect(redactions(page)).toBeFocused()
      await page.keyboard.press('Delete')
      await expect(redactions(page)).toHaveCount(0)
      await expect(mark(page, 'ni-number')).toHaveCount(1)
      await expect(page.locator(SUGGESTED)).toHaveCount(COUNT)
      // One step put back both: Undo restores the redaction and takes the mark away again.
      await viewer(page).getByRole('button', { name: 'Undo' }).click()
      await expect(redactions(page)).toHaveCount(1)
      await expect(mark(page, 'ni-number')).toHaveCount(0)
      await expect(page.locator(SUGGESTED)).toHaveCount(COUNT - 1)
    })

    test(`${framework} redactions: Tab reaches the marks after the page annotations, and Enter opens the card`, async ({
      page,
    }) => {
      await suggest(page, framework)
      // Accept one, so the page has an annotation of its own ahead of the marks.
      await mark(page, 'ni-number').click()
      await suggestionCard(page).getByRole('button', { name: 'Accept' }).click()
      await expect(redactions(page)).toHaveCount(1)
      await redactions(page).focus()
      await page.keyboard.press('Tab')
      await expect(mark(page, 'email')).toBeFocused()
      await page.keyboard.press('Enter')
      const card = suggestionCard(page)
      await expect(card).toBeVisible()
      await expect(card).toContainText('Email address')
      await expect(card.getByRole('button', { name: 'Accept' })).toBeFocused()
    })

    test(`${framework} redactions: Escape closes the card and returns focus to the mark`, async ({
      page,
    }) => {
      await suggest(page, framework)
      const first = mark(page, 'ni-number')
      await first.click()
      const card = suggestionCard(page)
      await expect(card.getByRole('button', { name: 'Accept' })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(card).toBeHidden()
      await expect(first).toBeFocused()
      await expect(page.locator(SUGGESTED)).toHaveCount(COUNT)
      await expect(page.locator('.ink-annotation[data-state="selected"]')).toHaveCount(0)
    })

    test(`${framework} redactions: a press on a mark keeps the selection`, async ({
      page,
    }) => {
      await suggest(page, framework)
      await mark(page, 'ni-number').click()
      await suggestionCard(page).getByRole('button', { name: 'Accept' }).click()
      await redactions(page).click()
      await expect(redactions(page)).toHaveAttribute('data-state', 'selected')
      await mark(page, 'email').click()
      await expect(suggestionCard(page)).toContainText('Email address')
      await expect(redactions(page)).toHaveAttribute('data-state', 'selected')
    })

    test(`${framework} redactions: has no axe violations with the marks and the card open`, async ({
      page,
    }) => {
      await suggest(page, framework)
      await mark(page, 'ni-number').click()
      await expect(suggestionCard(page)).toBeVisible()
      const { violations } = await new AxeBuilder({ page }).analyze()
      expect(violations).toEqual([])
    })

    test(`${framework} redactions: Code tab shows the plugin source`, async ({
      page,
    }) => {
      await open(page, framework)
      await page.getByRole('tab', { name: 'Code' }).click()
      const files = page.getByRole('tablist', { name: 'Files' })
      // Svelte adds the component that logs the command's status.
      await expect(files.getByRole('tab')).toHaveCount(framework === 'svelte' ? 3 : 2)
      await files.getByRole('tab', { name: 'suggestions.ts' }).click()
      await expect(page.getByRole('tabpanel', { name: 'Code' })).toContainText(
        "definePlugin<SuggestionsOptions>('sandbox'"
      )
    })
  })
}
