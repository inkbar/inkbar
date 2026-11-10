import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { guardConsole } from './console-guard'

guardConsole(test)

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const pageInput = (page: Page) => page.getByRole('spinbutton', { name: 'Page' })
const back = (page: Page) => page.getByRole('button', { name: 'Back' })
const forward = (page: Page) => page.getByRole('button', { name: 'Forward' })
const treeItem = (page: Page, name: string) =>
  page.getByRole('treeitem', { name, exact: true })
const actions = (page: Page) =>
  page.evaluate(() => (window as unknown as { __actions?: unknown[] }).__actions ?? [])

async function open(page: Page, doc: 'outline' | 'links'): Promise<void> {
  await page.goto(`/?doc=${doc}`)
  await expect(page.locator('[data-ink-root]')).toHaveAttribute('data-state', 'ready', {
    timeout: 15_000,
  })
  await expect(page.getByTestId('status')).toHaveText('ready')
  await expect(pageInput(page)).toHaveValue('1')
}

/** The element's box once it has stopped moving: scrolled into view, then two reads that match. */
async function settledBox(page: Page, selector: string) {
  const el = page.locator(selector).first()
  await el.scrollIntoViewIfNeeded()
  let last = ''
  await expect
    .poll(async () => {
      const now = JSON.stringify(await el.boundingBox())
      const same = now === last
      last = now
      return same
    })
    .toBe(true)
  return (await el.boundingBox())!
}

/** Clicks the page at the middle of a link's box; link elements never take the pointer. */
async function clickLink(page: Page, selector: string): Promise<void> {
  const box = await settledBox(page, selector)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

const link = (n: number) =>
  `.ink-page[data-page="0"] [data-ink-link-layer] [data-ink-link]:nth-child(${n})`

test('outline item jumps and becomes current', async ({ page }) => {
  await open(page, 'outline')
  await expect(treeItem(page, 'Part Two')).toBeVisible()
  // Part Two is open; Section A is its first child, on the fourth page.
  await treeItem(page, 'Section A').locator('.ink-outline-row').first().click()
  await expect(pageInput(page)).toHaveValue('4')
  // The item jumped to stays current until the reader scrolls away.
  await expect(treeItem(page, 'Section A')).toHaveAttribute('aria-current', 'location')
  await expect(page.locator('[aria-current="location"]')).toHaveCount(1)
})

test('Back returns to where you were', async ({ page }) => {
  await open(page, 'outline')
  await expect(back(page)).toBeDisabled()
  await treeItem(page, 'Appendix').locator('.ink-outline-row').first().click()
  await expect(pageInput(page)).toHaveValue('5')
  await expect(back(page)).toBeEnabled()
  await back(page).click()
  await expect(pageInput(page)).toHaveValue('1')
  await expect(back(page)).toBeDisabled()
  await expect(forward(page)).toBeEnabled()
  await forward(page).click()
  await expect(pageInput(page)).toHaveValue('5')
})

test('clicking a link lands at its destination', async ({ page }) => {
  await open(page, 'links')
  await expect(page.locator(link(1))).toBeAttached()
  await clickLink(page, link(1))
  await expect(pageInput(page)).toHaveValue('2')
  await expect(back(page)).toBeEnabled()
})

test('external link reports and does not navigate', async ({ page }) => {
  await open(page, 'links')
  const before = page.url()
  const anchor = 'a[href="https://example.com/a"]'
  await expect(page.locator(anchor)).toBeAttached()
  await clickLink(page, anchor)
  await expect.poll(() => actions(page)).toHaveLength(1)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))
  expect(await actions(page)).toEqual([
    expect.objectContaining({ kind: 'open-url', url: 'https://example.com/a' }),
  ])
  expect(page.url()).toBe(before)
  await expect(pageInput(page)).toHaveValue('1')
})

test('a highlight over a link does not follow it', async ({ page }) => {
  await open(page, 'links')
  await expect(page.locator(link(1))).toBeAttached()
  const marks = page.locator('[data-annotation][data-type="highlight"]')
  await expect(marks).toHaveCount(0)
  await page.locator('[data-tool="highlight"]').click()
  // Link 1 covers the line "Chapter 2"; drag across that text, which lies under the link.
  const text = '.ink-page[data-page="0"] [data-ink-text-layer] span:text-is("Chapter 2")'
  const box = await settledBox(page, text)
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + 1, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 1, y, { steps: 8 })
  await page.mouse.up()
  // The drag made a highlight, and did not follow the link.
  await expect(marks).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()
  await expect(pageInput(page)).toHaveValue('1')
  await expect(back(page)).toBeDisabled()
  expect(await actions(page)).toEqual([])
})

test('Tab reaches links and Enter follows', async ({ page }) => {
  await open(page, 'links')
  await expect(page.locator(link(1))).toBeAttached()
  let reached = false
  for (let i = 0; i < 60 && !reached; i++) {
    await page.keyboard.press('Tab')
    reached = await page.evaluate(
      () => !!document.activeElement?.closest('[data-ink-link-layer] [data-ink-link]')
    )
  }
  expect(reached).toBe(true)
  // The first link in the layer: the one that goes to page 2.
  expect(
    await page.evaluate(() => {
      const first = document.querySelector('[data-ink-link-layer] [data-ink-link]')
      return document.activeElement === first
    })
  ).toBe(true)
  await page.keyboard.press('Enter')
  await expect(pageInput(page)).toHaveValue('2')
  await expect(back(page)).toBeEnabled()
})

test('opening another document clears Back and the outline', async ({ page }) => {
  await open(page, 'outline')
  await treeItem(page, 'Appendix').locator('.ink-outline-row').first().click()
  await expect(back(page)).toBeEnabled()
  await page.getByTestId('swap').click()
  await expect(page.getByTestId('status')).toHaveText('ready')
  await expect(back(page)).toBeDisabled()
  await expect(forward(page)).toBeDisabled()
  await expect(page.getByRole('treeitem')).toHaveCount(0)
  await expect(page.getByText('This document has no outline')).toBeVisible()
  // The document now open is `links`: its first page has link elements.
  await expect(page.locator(link(1))).toBeAttached()
})

test('the outline panel has no axe violations', async ({ page }) => {
  await open(page, 'outline')
  await expect(treeItem(page, 'Part Two')).toBeVisible()
  const results = await new AxeBuilder({ page })
    .include('[data-ink-outline]')
    .withTags(WCAG_22_AA)
    .analyze()
  expect(
    results.violations.map((v) => ({
      id: v.id,
      help: v.help,
      targets: v.nodes.map((n) => n.target.join(' ')),
    }))
  ).toEqual([])
})
