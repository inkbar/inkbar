import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type Page } from '@playwright/test'

import { FRAMEWORK_ORDER } from '../src/shell/frameworks.ts'
import { LONG_HITS, LONG_PAGES, SEARCH_WORD } from '../vite/documents/long-text.ts'

guardConsole(test)

const viewer = (page: Page) => page.locator('[data-scenario-viewer]')
const events = (page: Page) => page.locator('aside[aria-label="Events"] ol > li')
const named = (page: Page, name: string) =>
  events(page).filter({
    has: page.locator('[data-event-name]', { hasText: new RegExp(`^${name}$`) }),
  })

async function open(page: Page, framework: string): Promise<void> {
  await page.goto(`app.html#/${framework}/search`)
  await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute(
    'data-state',
    'ready',
    { timeout: 20_000 }
  )
  await expect(
    viewer(page).locator('.ink-page[data-page="0"] canvas[data-ink-canvas]')
  ).toBeVisible({ timeout: 20_000 })
}

/** Opens the find bar from the toolbar and searches for `SEARCH_WORD`. */
async function find(page: Page): Promise<void> {
  await viewer(page).getByRole('button', { name: 'Find', exact: true }).click()
  const field = viewer(page).getByRole('textbox', { name: 'Find in document' })
  await expect(field).toBeFocused()
  await field.fill(SEARCH_WORD)
}

const count = (page: Page) => viewer(page).locator('[data-ink-find-count]')

for (const framework of FRAMEWORK_ORDER) {
  test.describe(framework, () => {
    test(`${framework} search: logs the page count when ready`, async ({ page }) => {
      await open(page, framework)
      await expect(viewer(page).locator('[data-ink-page-count]')).toHaveText(
        `of ${LONG_PAGES}`
      )
      await expect(
        events(page).locator('.event-payload', { hasText: `{"pages":${LONG_PAGES}}` })
      ).toHaveCount(1)
    })

    test(`${framework} search: finds every hit across the long document`, async ({
      page,
    }) => {
      await open(page, framework)
      await find(page)
      await expect(count(page)).toHaveText(`1 of ${LONG_HITS}`, { timeout: 20_000 })
      await expect(named(page, 'search').first().locator('.event-payload')).toHaveText(
        JSON.stringify({ query: SEARCH_WORD, hits: LONG_HITS, current: 0 })
      )
    })

    test(`${framework} search: steps to a far hit`, async ({ page }) => {
      await open(page, framework)
      await find(page)
      await expect(count(page)).toHaveText(`1 of ${LONG_HITS}`, { timeout: 20_000 })
      // One step back from the first hit wraps round to the last, near the end.
      await viewer(page).getByRole('button', { name: 'Previous match' }).click()
      await expect(count(page)).toHaveText(`${LONG_HITS} of ${LONG_HITS}`)
      const pageInput = viewer(page).locator('input[aria-label="Page"]')
      let shown = 0
      await expect
        .poll(async () => (shown = Number(await pageInput.inputValue())))
        .toBeGreaterThanOrEqual(190)
      const far = viewer(page).locator(`.ink-page[data-page="${shown - 1}"]`)
      await expect(far).toBeInViewport()
      await expect(far.locator('canvas[data-ink-canvas]')).toBeVisible()
      await expect(named(page, 'search').first().locator('.event-payload')).toHaveText(
        JSON.stringify({ query: SEARCH_WORD, hits: LONG_HITS, current: LONG_HITS - 1 })
      )
    })

    test(`${framework} search: logs only settled searches when the query changes`, async ({
      page,
    }) => {
      await open(page, framework)
      await find(page)
      await expect(count(page)).toHaveText(`1 of ${LONG_HITS}`, { timeout: 20_000 })
      await viewer(page)
        .getByRole('textbox', { name: 'Find in document' })
        .fill('nowhere in this log')
      await expect(count(page)).toHaveText('No results', { timeout: 20_000 })
      // Newest first: the empty search's result, then the first search's. Nothing in between.
      await expect(named(page, 'search').locator('.event-payload')).toHaveText([
        JSON.stringify({ query: 'nowhere in this log', hits: 0, current: -1 }),
        JSON.stringify({ query: SEARCH_WORD, hits: LONG_HITS, current: 0 }),
      ])
    })
  })
}

test('the Svelte search Code tab lists its log component', async ({ page }) => {
  await open(page, 'svelte')
  await page.getByRole('tab', { name: 'Code' }).click()
  const files = page.getByRole('tablist', { name: 'Files' })
  await expect(files.getByRole('tab')).toHaveText(['svelte.svelte', 'SearchLog.svelte'])
  await files.getByRole('tab', { name: 'SearchLog.svelte' }).click()
  await expect(page.getByRole('tabpanel', { name: 'Code' })).toContainText('useSearch()')
})
