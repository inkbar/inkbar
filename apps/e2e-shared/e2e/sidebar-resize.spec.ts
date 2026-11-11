import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { guardConsole } from './console-guard'

guardConsole(test)

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const KEY = 'inkbar-e2e:sidebar.left.width'

const handle = (page: Page) =>
  page.getByRole('separator', { name: 'Resize left sidebar' })
const sidebar = (page: Page) => page.locator('.ink-sidebar').first()
const valueNow = async (page: Page) =>
  Number(await handle(page).getAttribute('aria-valuenow'))
const widthOf = async (page: Page) =>
  Math.round((await sidebar(page).boundingBox())!.width)

async function open(page: Page): Promise<void> {
  await page.goto('/?doc=outline')
  // Each test starts with nothing saved; the reload then reads a clean store.
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('[data-ink-root]')).toHaveAttribute('data-state', 'ready', {
    timeout: 15_000,
  })
  await expect(handle(page)).toBeVisible()
}

test('drag the sidebar wider and it stays after reload', async ({ page }) => {
  await open(page)
  expect(await valueNow(page)).toBe(320)
  const box = (await handle(page).boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 60, y, { steps: 5 })
  await page.mouse.move(x + 100, y, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => valueNow(page)).toBeGreaterThan(380)
  const dragged = await valueNow(page)
  expect(await widthOf(page)).toBeCloseTo(dragged, -1)
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k), KEY))
    .not.toBeNull()

  await page.reload()
  await expect(handle(page)).toBeVisible()
  await expect.poll(() => valueNow(page)).toBe(dragged)
  expect(await widthOf(page)).toBeCloseTo(dragged, -1)
})

test('arrow keys resize and End stops at the max', async ({ page }) => {
  await open(page)
  await handle(page).focus()
  await page.keyboard.press('ArrowRight')
  expect(await valueNow(page)).toBe(336)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  expect(await valueNow(page)).toBe(304)
  await page.keyboard.press('Home')
  expect(await valueNow(page)).toBe(240)
  await page.keyboard.press('End')
  const max = Number(await handle(page).getAttribute('aria-valuemax'))
  expect(await valueNow(page)).toBe(max)
  expect(max).toBeLessThanOrEqual(480)
})

test('Enter resets to 320', async ({ page }) => {
  await open(page)
  await handle(page).focus()
  await page.keyboard.press('End')
  expect(await valueNow(page)).not.toBe(320)
  await page.keyboard.press('Enter')
  expect(await valueNow(page)).toBe(320)
  // The box includes the sidebar border.
  expect(Math.abs((await widthOf(page)) - 320)).toBeLessThanOrEqual(4)
})

test.describe('touch', () => {
  test.use({ hasTouch: true })

  test('touch drag resizes without scrolling the page', async ({ page }) => {
    await open(page)
    const scrollBefore = await page.evaluate(() => window.scrollY)
    const box = (await handle(page).boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    const cdp = await page.context().newCDPSession(page)
    const touch = (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      px: number,
      points = true
    ) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points ? [{ x: px, y }] : [],
      })
    await touch('touchStart', x)
    for (let i = 1; i <= 8; i++) await touch('touchMove', x + i * 10)
    await touch('touchEnd', x + 80, false)
    await expect.poll(() => valueNow(page)).toBeGreaterThan(360)
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('')
  })
})

test('axe has no violations on the sidebar', async ({ page }) => {
  await open(page)
  const results = await new AxeBuilder({ page })
    .include('.ink-sidebar')
    .withTags(WCAG_22_AA)
    .analyze()
  expect(results.violations).toEqual([])
})
