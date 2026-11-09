import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type CDPSession, type Page } from '@playwright/test'

import { FRAMEWORK_ORDER } from '../src/shell/frameworks.ts'
import { H as PAGE_HEIGHT, W as PAGE_WIDTH } from '../vite/documents/layout.ts'

guardConsole(test)

/** `a` is within `px` of `b`. */
const near = (a: number, b: number, px: number) =>
  expect(Math.abs(a - b), `${a} is within ${px} of ${b}`).toBeLessThanOrEqual(px)

const viewer = (page: Page) => page.locator('[data-scenario-viewer]')
const named = (page: Page, name: string) =>
  page.locator('aside[aria-label="Events"] ol > li').filter({
    has: page.locator('[data-event-name]', { hasText: new RegExp(`^${name}$`) }),
  })
const firstPage = (page: Page) => viewer(page).locator('.ink-page[data-page="0"]')
const markers = (page: Page) => viewer(page).locator('.presses-marker')

async function open(page: Page, framework: string): Promise<void> {
  await page.goto(`./#/${framework}/events`)
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

/** The newest payload logged under `name`, parsed. */
async function newest(page: Page, name: string): Promise<unknown> {
  const text = await named(page, name).first().locator('.event-payload').textContent()
  return JSON.parse(text ?? 'null')
}

/** The zoom the viewer shows in its zoom select, as a fraction: 1 for 100%. */
async function shownZoom(page: Page): Promise<number> {
  const text = await viewer(page)
    .getByRole('combobox', { name: 'Zoom' })
    // A native select in TypeScript, a button that shows the value in the bindings.
    .evaluate((el) =>
      el instanceof HTMLSelectElement
        ? (el.selectedOptions[0]?.textContent ?? '')
        : (el.textContent ?? '')
    )
  return Number.parseFloat(text) / 100
}

type TouchPoint = { x: number; y: number; id: number }

const touch = (
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  touchPoints: TouchPoint[]
) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints })

for (const framework of FRAMEWORK_ORDER) {
  test.describe(framework, () => {
    test(`${framework} events: a click on the page logs onPress and shows a marker`, async ({
      page,
    }) => {
      await open(page, framework)
      const box = (await firstPage(page).boundingBox())!
      const zoom = box.width / PAGE_WIDTH
      // The top-left margin: blank, so nothing else takes the press.
      await page.mouse.click(box.x + 20, box.y + 20)

      await expect(named(page, 'onPress')).toHaveCount(1)
      const logged = (await newest(page, 'onPress')) as {
        page: number
        point: { x: number; y: number }
        pointerType: string
      }
      expect(logged.page).toBe(0)
      expect(logged.pointerType).toBe('mouse')
      near(logged.point.x, 20 / zoom, 2)
      near(logged.point.y, PAGE_HEIGHT - 20 / zoom, 2)

      const marker = firstPage(page).locator('.presses-marker[data-kind="press"]')
      await expect(marker).toBeVisible()
      const at = (await marker.boundingBox())!
      near(at.x + at.width / 2, box.x + 20, 2)
      near(at.y + at.height / 2, box.y + 20, 2)
      // It goes after a moment.
      await expect(markers(page)).toHaveCount(0, { timeout: 3_000 })
    })

    test(
      `${framework} events: a pinch zooms the document, not the page`,
      { tag: '@touch' },
      async ({ page }) => {
        await open(page, framework)
        const startWidth = (await firstPage(page).boundingBox())!.width
        const startZoom = startWidth / PAGE_WIDTH
        const box = (await viewer(page)
          .locator('[data-ink-viewport-root]')
          .boundingBox())!
        const cx = box.x + box.width / 2
        const cy = box.y + box.height / 2

        // Two fingers 100 px apart spread to 200 px apart.
        const cdp = await page.context().newCDPSession(page)
        const fingers = (half: number): TouchPoint[] => [
          { x: cx - half, y: cy, id: 0 },
          { x: cx + half, y: cy, id: 1 },
        ]
        await touch(cdp, 'touchStart', fingers(50))
        for (let step = 1; step <= 5; step++)
          await touch(cdp, 'touchMove', fingers(50 + step * 10))
        await touch(cdp, 'touchEnd', [])

        // The browser did not zoom the page itself.
        expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1)
        await expect.poll(() => shownZoom(page)).toBeCloseTo(startZoom * 2, 1)

        // Every visible page re-renders sharp at the new size.
        await expect
          .poll(
            () =>
              viewer(page)
                .locator('.ink-page')
                .evaluateAll((pages) => {
                  const dpr = window.devicePixelRatio
                  const visible = pages.filter((p) => {
                    const r = p.getBoundingClientRect()
                    return r.bottom > 0 && r.top < window.innerHeight
                  })
                  return (
                    visible.length > 0 &&
                    visible.every((p) => {
                      const canvas = p.querySelector('canvas[data-ink-canvas]')
                      if (!(canvas instanceof HTMLCanvasElement)) return false
                      const width = p.getBoundingClientRect().width
                      return Math.abs(canvas.width - width * dpr) <= 2
                    })
                  )
                }),
            { timeout: 10_000 }
          )
          .toBe(true)
        const endWidth = (await firstPage(page).boundingBox())!.width
        expect(endWidth / startWidth).toBeCloseTo(2, 1)
      }
    )

    test(
      `${framework} events: a 600 ms hold logs onLongPress`,
      { tag: '@touch' },
      async ({ page }) => {
        await open(page, framework)
        const box = (await firstPage(page).boundingBox())!
        const cdp = await page.context().newCDPSession(page)
        const finger = [{ x: box.x + 20, y: box.y + 20, id: 0 }]
        await touch(cdp, 'touchStart', finger)
        await page.waitForTimeout(600)
        await touch(cdp, 'touchEnd', [])

        await expect(named(page, 'onLongPress')).toHaveCount(1)
        const logged = (await newest(page, 'onLongPress')) as {
          page: number
          pointerType: string
        }
        expect(logged.page).toBe(0)
        expect(logged.pointerType).toBe('touch')
        // The release after a long press is not also a press.
        await expect(named(page, 'onPress')).toHaveCount(0)
        await expect(
          firstPage(page).locator('.presses-marker[data-kind="long-press"]')
        ).toBeVisible()
      }
    )
  })
}
