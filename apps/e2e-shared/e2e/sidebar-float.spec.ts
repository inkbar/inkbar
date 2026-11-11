import { expect, test, type Page } from '@playwright/test'

import { guardConsole } from './console-guard'

guardConsole(test)

const sidebar = (page: Page) => page.locator('.ink-sidebar').first()
const outlineTab = (page: Page) => sidebar(page).getByRole('tab', { name: 'Outline' })
const actions = (page: Page) =>
  page.evaluate(() => (window as unknown as { __actions?: unknown[] }).__actions ?? [])

// The page has one left sidebar, a rail with an Outline panel, at its default 320px width
// beside a document that wants 480px. Its viewer area is the whole window, so the sidebar sits
// beside the pages from about 900px up and floats below that.
async function open(page: Page, doc: 'outline' | 'links'): Promise<void> {
  await page.goto(`/?doc=${doc}`)
  // Each test starts with nothing saved; the reload then reads a clean store.
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('[data-ink-root]')).toHaveAttribute('data-state', 'ready', {
    timeout: 15_000,
  })
  await expect(page.getByTestId('status')).toHaveText('ready')
  await expect(sidebar(page)).toBeVisible()
}

/** Taps the first page near its right edge, inside the window, clear of the floating panel. */
async function tapPage(page: Page): Promise<void> {
  const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
  const right = Math.min(box.x + box.width, page.viewportSize()!.width)
  await page.mouse.click(right - 40, box.y + 120)
}

test.describe('narrow window', () => {
  test.use({ viewport: { width: 700, height: 800 } })

  test('the panel floats, and a tap on the page closes it', async ({ page }) => {
    await open(page, 'links')
    // Too narrow for the panel beside the pages, so it starts closed.
    await expect(outlineTab(page)).toHaveAttribute('aria-selected', 'false')
    await expect(sidebar(page)).not.toHaveAttribute('data-overlay')

    await outlineTab(page).click()
    await expect(outlineTab(page)).toHaveAttribute('aria-selected', 'true')
    await expect(sidebar(page)).toHaveAttribute('data-overlay', '')
    const panel = sidebar(page).getByRole('tabpanel', { name: 'Outline' })
    await expect(panel).toBeVisible()

    // Tap the page, to the right of the panel, which covers the page's links.
    await tapPage(page)

    await expect(outlineTab(page)).toHaveAttribute('aria-selected', 'false')
    await expect(sidebar(page)).not.toHaveAttribute('data-overlay')
    expect(await actions(page)).toEqual([])
    await expect(page.locator('[data-annotation]')).toHaveCount(0)
  })

  // The page offers only text tools, so this checks the closing tap leaves the tool's state
  // alone: a tap that reached a drawing tool would be the case to catch.
  test('with the highlight tool on, the closing tap adds no annotation', async ({
    page,
  }) => {
    await open(page, 'outline')
    await page.getByRole('button', { name: 'Highlight' }).click()
    await outlineTab(page).click()
    await expect(sidebar(page)).toHaveAttribute('data-overlay', '')

    await tapPage(page)
    await expect(outlineTab(page)).toHaveAttribute('aria-selected', 'false')
    await expect(page.locator('[data-annotation]')).toHaveCount(0)
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the left sidebar starts closed after a reload', async ({ page }) => {
    await open(page, 'outline')
    await expect(outlineTab(page)).toHaveAttribute('aria-selected', 'false')
    await page.reload()
    await expect(page.locator('[data-ink-root]')).toHaveAttribute('data-state', 'ready', {
      timeout: 15_000,
    })
    await expect(sidebar(page)).toBeVisible()
    await expect(outlineTab(page)).toHaveAttribute('aria-selected', 'false')
  })
})
