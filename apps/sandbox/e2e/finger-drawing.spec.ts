import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type CDPSession, type Page } from '@playwright/test'

import { FRAMEWORK_ORDER } from '../src/shell/frameworks.ts'

import { touch } from './touch.ts'

guardConsole(test)

const viewer = (page: Page) => page.locator('[data-scenario-viewer]')
const firstPage = (page: Page) => viewer(page).locator('.ink-page[data-page="0"]')
const session = (page: Page, type: string) =>
  firstPage(page).locator(`.ink-annotation[data-type="${type}"][data-source="session"]`)
const sessionAll = (page: Page) =>
  viewer(page).locator('.ink-annotation[data-source="session"]')

/** The tour has every drawing tool in its toolbar. */
async function open(page: Page, framework: string): Promise<void> {
  await page.goto(`./#/${framework}/tour`)
  await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute(
    'data-state',
    'ready',
    { timeout: 20_000 }
  )
  await expect(firstPage(page).locator('canvas[data-ink-canvas]')).toBeVisible({
    timeout: 20_000,
  })
  // On a phone the viewer starts below the scenario's heading.
  await viewer(page).locator('[data-ink-viewport-root]').scrollIntoViewIfNeeded()
}

/** Where the viewer scrolls: the scroll element's offset. */
const scrollTop = (page: Page) =>
  viewer(page)
    .locator('[data-ink-scroll]')
    .evaluate((el) => el.scrollTop)

/** A spot in the visible part of page 1, clear of the tour's own marks: its top margin. */
async function start(page: Page): Promise<{ x: number; y: number }> {
  const box = (await firstPage(page).boundingBox())!
  const view = (await viewer(page).locator('[data-ink-scroll]').boundingBox())!
  return {
    x: Math.max(box.x, view.x) + 40,
    y: Math.max(box.y, view.y) + 30,
  }
}

/** A spot near the bottom of the visible viewport, with room above it for a drag up. */
async function lower(page: Page): Promise<{ x: number; y: number }> {
  const view = (await viewer(page).locator('[data-ink-scroll]').boundingBox())!
  return { x: view.x + 60, y: view.y + view.height - 40 }
}

/** One finger down, a straight drag of (dx, dy) in steps, up. */
async function drag(
  cdp: CDPSession,
  from: { x: number; y: number },
  dx: number,
  dy: number
): Promise<void> {
  await touch(cdp, 'touchStart', [{ ...from, id: 0 }])
  for (let step = 1; step <= 8; step++)
    await touch(cdp, 'touchMove', [
      { x: from.x + (dx * step) / 8, y: from.y + (dy * step) / 8, id: 0 },
    ])
  await touch(cdp, 'touchEnd', [])
}

/** After a settle, so a late scroll or annotation would show. */
const settle = (page: Page) => page.waitForTimeout(300)

for (const framework of FRAMEWORK_ORDER) {
  test.describe(`${framework} finger drawing`, () => {
    test(
      `${framework} finger: one finger draws with draw`,
      { tag: '@touch' },
      async ({ page }) => {
        await open(page, framework)
        await viewer(page).getByRole('button', { name: 'Draw', exact: true }).click()
        const before = await scrollTop(page)
        const from = await start(page)
        const cdp = await page.context().newCDPSession(page)
        await drag(cdp, from, 120, 0)

        await expect(session(page, 'ink')).toHaveCount(1)
        await settle(page)
        expect(await scrollTop(page)).toBe(before)
        await expect(sessionAll(page)).toHaveCount(1)
      }
    )

    test(
      `${framework} finger: one finger scrolls with select-text`,
      {
        tag: '@touch',
      },
      async ({ page }) => {
        await open(page, framework)
        const before = await scrollTop(page)
        const cdp = await page.context().newCDPSession(page)
        await drag(cdp, await lower(page), 0, -200)

        await expect.poll(() => scrollTop(page)).toBeGreaterThan(before + 50)
        await settle(page)
        await expect(sessionAll(page)).toHaveCount(0)
      }
    )

    test(
      `${framework} finger: two fingers scroll under draw`,
      { tag: '@touch' },
      async ({ page }) => {
        await open(page, framework)
        await viewer(page).getByRole('button', { name: 'Draw', exact: true }).click()
        const before = await scrollTop(page)
        const from = await lower(page)
        const y = from.y
        const cdp = await page.context().newCDPSession(page)
        const fingers = (dy: number, count: 1 | 2) =>
          [
            { x: from.x, y: y + dy, id: 0 },
            { x: from.x + 80, y: y + dy, id: 1 },
          ].slice(0, count)

        await touch(cdp, 'touchStart', fingers(0, 1))
        await page.waitForTimeout(60)
        await touch(cdp, 'touchStart', fingers(0, 2))
        for (let step = 1; step <= 10; step++)
          await touch(cdp, 'touchMove', fingers(-30 * step, 2))
        await touch(cdp, 'touchEnd', [])

        await expect(async () => {
          const moved = (await scrollTop(page)) - before
          expect(Math.abs(moved - 300)).toBeLessThanOrEqual(60)
        }).toPass({ timeout: 5_000 })
        await settle(page)
        await expect(sessionAll(page)).toHaveCount(0)
      }
    )

    test(
      `${framework} finger: a tap with draw draws nothing`,
      { tag: '@touch' },
      async ({ page }) => {
        await open(page, framework)
        await viewer(page).getByRole('button', { name: 'Draw', exact: true }).click()
        const from = await start(page)
        const cdp = await page.context().newCDPSession(page)
        await touch(cdp, 'touchStart', [{ ...from, id: 0 }])
        await touch(cdp, 'touchEnd', [])

        await settle(page)
        await expect(sessionAll(page)).toHaveCount(0)
      }
    )

    test(
      `${framework} finger: one finger draws a shape, then scrolls`,
      {
        tag: '@touch',
      },
      async ({ page }) => {
        await open(page, framework)
        await viewer(page)
          .getByRole('button', { name: /^Shape: / })
          .click()
        const from = await start(page)
        const cdp = await page.context().newCDPSession(page)
        const before = await scrollTop(page)
        await drag(cdp, from, 120, 80)

        await expect(session(page, 'square')).toHaveCount(1)
        expect(await scrollTop(page)).toBe(before)

        // The shape tool is spent, so the claim on one-finger drags is lifted.
        await drag(cdp, await lower(page), 0, -200)
        await expect.poll(() => scrollTop(page)).toBeGreaterThan(before + 50)
        await expect(sessionAll(page)).toHaveCount(1)
      }
    )
  })
}
