/*
 * One session per target: the smoke page's checks through each front end in turn (plain DOM,
 * Vue, React, Svelte: four page loads in the one session), then, on the phones and tablets,
 * real gestures, once, on the plain DOM page. A gesture the platform's automation cannot make is recorded as not supported,
 * never faked with events made up in the page.
 *
 * - Android: Chrome's touch input over CDP (`Input.dispatchTouchEvent`), the same input the
 *   sandbox's own touch tests use. Taps, one-finger drags and two-finger pinches.
 * - iOS: BrowserStack drives Safari through XCUITest. A tap on an element is a real tap.
 *   Coordinate drags arrive as mouse events made up in the page, without touch events, and
 *   there is no multi-touch, so drawing and pinching are not supported there.
 */
import { expect, test, type Remote } from './session.ts'

import type { CDPSession, Page } from '@playwright/test'

interface SmokeState {
  front: string
  done: boolean
  results: {
    name: string
    ok: boolean
    status: 'pass' | 'fail' | 'skip'
    error?: string
    stack?: string
    ms: number
  }[]
  userAgent: string
}

/** The front ends, as the smoke page names them in `?front=`. */
const FRONTS = ['vanilla', 'vue', 'react', 'svelte'] as const

const WORD = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP' } as const

const firstPage = (page: Page) => page.locator('.ink-page[data-page="0"]')
const inks = (page: Page) =>
  page.locator('.ink-annotation[data-type="ink"][data-source="session"]')

/** Reads the page's results until it says it is done. One read takes about a second on iOS. */
async function smokeResults(
  page: Page,
  front: string,
  timeout: number
): Promise<SmokeState> {
  const name = `${test.info().project.name} ${front}`
  const end = Date.now() + timeout
  let seen = -1
  for (;;) {
    // As a string: a plain value crosses every platform's bridge the same way.
    const json = await page.evaluate(() =>
      JSON.stringify((window as { __inkbarSmoke?: SmokeState }).__inkbarSmoke ?? null)
    )
    const parsed = JSON.parse(json) as SmokeState | null
    // The state of this page, not of the one before it.
    const state = parsed?.front === front ? parsed : null
    if (state?.done) return state
    const count = state ? state.results.length : -1
    if (count !== seen) {
      seen = count
      console.log(
        `${name}: ${state ? `${count} checks done` : 'the page has not started'}`
      )
    }
    if (Date.now() > end) {
      // Say where it stopped: the page's own text, and a picture of it.
      const text = await page
        .locator('body')
        .innerText()
        .catch((error: unknown) => `could not read the page: ${String(error)}`)
      console.log(`${name}: ${page.url()}\n${text}`)
      await page
        .screenshot({ path: test.info().outputPath(`timeout-${front}.png`) })
        .catch(() => undefined)
      throw new Error(`the smoke page did not finish within ${timeout} ms`)
    }
    await page.waitForTimeout(2_000)
  }
}

type Point = { x: number; y: number; id: number }
const touch = (
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  touchPoints: Point[]
) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints })

function notSupported(gesture: string, why: string): void {
  test
    .info()
    .annotations.push({ type: 'not supported', description: `${gesture}: ${why}` })
  console.log(`${test.info().project.name}: ${gesture} not supported: ${why}`)
}

async function gestures({ page, target }: Remote): Promise<void> {
  const draw = page.locator('button[data-tool="draw"]')

  await test.step('a tap selects the Draw tool', async () => {
    await draw.scrollIntoViewIfNeeded()
    await draw.tap()
    await expect(draw).toHaveAttribute('aria-pressed', 'true')
  })

  if (target.kind === 'ios') {
    notSupported(
      'drawing with a finger',
      'BrowserStack iOS has no touch drag, only made-up mouse events'
    )
    notSupported('pinch', 'BrowserStack iOS has no multi-touch')
    return
  }

  const cdp = await page.context().newCDPSession(page)
  // The pages sit under the results: bring them into view, where the fingers land.
  await page.locator('[data-ink-scroll]').scrollIntoViewIfNeeded()
  const view = (await page.locator('[data-ink-scroll]').boundingBox())!
  const sheet = (await firstPage(page).boundingBox())!
  const left = Math.max(sheet.x, view.x) + 30
  const top = Math.max(sheet.y, view.y) + 30

  await test.step('a finger drag draws an ink stroke', async () => {
    await expect(inks(page)).toHaveCount(0)
    await touch(cdp, 'touchStart', [{ x: left, y: top, id: 0 }])
    for (let step = 1; step <= 8; step++)
      await touch(cdp, 'touchMove', [{ x: left + step * 15, y: top + step * 6, id: 0 }])
    await touch(cdp, 'touchEnd', [])
    await expect(inks(page)).toHaveCount(1)
  })

  await test.step('a pinch zooms the document', async () => {
    const before = (await firstPage(page).boundingBox())!.width
    const cx = view.x + view.width / 2
    const cy = view.y + view.height / 2
    const fingers = (half: number): Point[] => [
      { x: cx - half, y: cy, id: 0 },
      { x: cx + half, y: cy, id: 1 },
    ]
    await touch(cdp, 'touchStart', fingers(40))
    for (let step = 1; step <= 5; step++)
      await touch(cdp, 'touchMove', fingers(40 + step * 12))
    await touch(cdp, 'touchEnd', [])
    await expect
      .poll(async () => (await firstPage(page).boundingBox())!.width)
      .toBeGreaterThan(before * 1.3)
  })
}

test('smoke page', async ({ remote }) => {
  const { page, target } = remote
  for (const front of FRONTS) {
    await test.step(`${front}: every check on the page passes`, async () => {
      // A page that never finishes is reported, and the next front end still runs.
      let results: SmokeState
      try {
        await page.goto(`smoke/?front=${front}`)
        results = await smokeResults(page, front, 150_000)
      } catch (error) {
        expect.soft(String(error), `${front} did not finish`).toBe('')
        return
      }
      if (front === FRONTS[0]) console.log(`${target.name}: ${results.userAgent}`)
      for (const r of results.results)
        console.log(
          `${target.name} ${front}: ${WORD[r.status]}  ${r.name}  ${Math.round(r.ms)} ms${r.error ? `  ${r.error}` : ''}${r.stack ? `\n${r.stack}` : ''}`
        )
      expect.soft(results.results.length, `${front} ran no checks`).toBeGreaterThan(0)
      expect
        .soft(
          results.results.filter((r) => !r.ok),
          front
        )
        .toEqual([])
    })
    // Real gestures once, on the plain DOM page, while it is open.
    if (front === 'vanilla' && target.kind !== 'desktop') await gestures(remote)
  }
})
