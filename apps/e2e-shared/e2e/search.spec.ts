import { expect, test, type Page } from '@playwright/test'

import { guardConsole } from './console-guard'
import { report, waitForFirstPage } from './helpers'

guardConsole(test)

const NI_NUMBER = 'QQ123456C'

const findButton = (page: Page) => page.getByRole('button', { name: 'Find', exact: true })
const field = (page: Page) => page.getByRole('textbox', { name: 'Find in document' })
const count = (page: Page) => page.locator('[data-ink-find-count]')

test('finds, steps and closes with focus returned', async ({ page }) => {
  await page.goto('/')
  await waitForFirstPage(page)
  const bar = page.locator('[data-ink-find-bar]')
  await expect(bar).toBeHidden()
  // The bar sits in the viewport root, which positions it over the pages.
  await expect(page.locator('[data-ink-viewport-root] [data-ink-find-bar]')).toHaveCount(
    1
  )

  await findButton(page).click()
  await expect(bar).toBeVisible()
  await expect(field(page)).toBeFocused()
  await expect(findButton(page)).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.type(NI_NUMBER)
  await expect(count(page)).toHaveText('1 of 3')
  await page.keyboard.press('Enter')
  await expect(count(page)).toHaveText('2 of 3')
  await expect(page.locator('[data-ink-find-status]')).toHaveText('Match 2 of 3, page 2')
  await page.keyboard.press('Shift+Enter')
  await expect(count(page)).toHaveText('1 of 3')
  await page.getByRole('button', { name: 'Next match' }).click()
  await expect(count(page)).toHaveText('2 of 3')

  await page.keyboard.press('Escape')
  await expect(bar).toBeHidden()
  await expect(findButton(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(findButton(page)).toBeFocused()
})

test('draws the matches on the pages and clears them on close', async ({ page }) => {
  await page.goto('/')
  await waitForFirstPage(page)
  await findButton(page).click()
  await page.keyboard.type(NI_NUMBER)
  await expect(count(page)).toHaveText('1 of 3')
  const first = page.locator('.ink-page[data-page="0"]')
  await expect(first.locator('[data-search-hit]').first()).toBeVisible()
  await expect(first.locator('[data-search-hit][data-current]').first()).toBeVisible()
  // Only the current hit's boxes are marked: stepping on moves the mark off this page.
  await page.keyboard.press('Enter')
  await expect(count(page)).toHaveText('2 of 3')
  await expect(first.locator('[data-search-hit][data-current]')).toHaveCount(0)
  await expect(first.locator('[data-search-hit]').first()).toBeAttached()
  await expect(page.locator('[data-search-hit][data-current]').first()).toBeAttached()

  await page.keyboard.press('Escape')
  await expect(page.locator('[data-search-hit]')).toHaveCount(0)
})

test('shows "No results" for a query that is not in the document', async ({ page }) => {
  await page.goto('/')
  await waitForFirstPage(page)
  await findButton(page).click()
  await page.keyboard.type('zzzzzz')
  await expect(count(page)).toHaveText('No results')
})

test('Ctrl+F opens the bar from the document and is left to the browser elsewhere', async ({
  page,
}) => {
  await page.goto('/')
  await waitForFirstPage(page)
  await findButton(page).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-ink-find-bar]')).toBeHidden()

  // Outside the viewer's root the browser keeps the key.
  const prevented = await page.evaluate(() => {
    const e = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    document.body.dispatchEvent(e)
    return e.defaultPrevented
  })
  expect(prevented).toBe(false)
  await expect(page.locator('[data-ink-find-bar]')).toBeHidden()

  await page.locator('[data-ink-scroll]').focus()
  await page.keyboard.press('Control+f')
  await expect(field(page)).toBeFocused()
})

test('searching a 300-page document keeps the main thread responsive', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto('/?large=300')
  await waitForFirstPage(page, 60_000)
  await page.evaluate(() => {
    const w = window as unknown as { __longTasks: number[] }
    w.__longTasks = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__longTasks.push(entry.duration)
    }).observe({ type: 'longtask', buffered: false })
  })

  await findButton(page).click()
  await page.keyboard.type('Page 299')
  await expect(count(page)).toHaveText('1 of 1', { timeout: 60_000 })

  const longest = await page.evaluate(() =>
    Math.max(0, ...(window as unknown as { __longTasks: number[] }).__longTasks)
  )
  // GitHub's runners are not a timing environment (see large.spec.ts): the budget is asserted
  // locally and only reported on CI.
  report('longest task', { ms: Math.round(longest) })
  if (!process.env.CI) expect(longest).toBeLessThanOrEqual(200)
})

test('a one-letter search of a 300-page document keeps the main thread responsive', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto('/?large=300')
  await waitForFirstPage(page, 60_000)
  await page.evaluate(() => {
    const w = window as unknown as { __longTasks: number[] }
    w.__longTasks = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__longTasks.push(entry.duration)
    }).observe({ type: 'longtask', buffered: false })
  })

  await findButton(page).click()
  // Thousands of hits: every page has a score of them.
  await page.keyboard.type('e')
  await expect(count(page)).toHaveText(/^1 of \d{4,}$/, { timeout: 60_000 })

  const longest = await page.evaluate(() =>
    Math.max(0, ...(window as unknown as { __longTasks: number[] }).__longTasks)
  )
  report('longest task, one letter', { ms: Math.round(longest) })
  if (!process.env.CI) expect(longest).toBeLessThanOrEqual(200)
})
