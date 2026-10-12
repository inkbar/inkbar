import { expect, test } from '@playwright/test'

import { guardConsole } from './console-guard'
import { report, waitForFirstPage } from './helpers'

guardConsole(test)

const PAGES = 1000
const MB = 1024 * 1024

test('1,000 pages: bounded mounts, bounded memory and smooth frames end to end', async ({
  page,
}) => {
  // Generating the file in the browser takes a few seconds; scrolling it takes about a minute.
  test.setTimeout(240_000)
  await page.goto(`/?large=${PAGES}`)
  await waitForFirstPage(page, 90_000)
  await expect(page.locator('[data-ink-root]')).toHaveAttribute('data-state', 'ready')

  // Collect garbage before each reading, so the numbers compare live objects only.
  const cdp = await page.context().newCDPSession(page)
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage')
    return page.evaluate(
      () =>
        (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
          ?.usedJSHeapSize
    )
  }
  const before = await heap()
  expect(before, 'performance.memory needs --enable-precise-memory-info').toBeDefined()

  const result = await page.locator('[data-ink-scroll]').evaluate(async (el) => {
    const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve))
    const end = () => el.scrollHeight - el.clientHeight
    const mountedSamples: number[] = []
    const deltas: number[] = []
    let last = await frame()
    while (el.scrollTop < end() - 1) {
      el.scrollTop = Math.min(end(), el.scrollTop + el.clientHeight)
      const now = await frame()
      deltas.push(now - last)
      last = now
      mountedSamples.push(el.querySelectorAll('.ink-page').length)
    }
    // Let the last pages mount and render.
    for (let i = 0; i < 30; i++) {
      const now = await frame()
      deltas.push(now - last)
      last = now
      mountedSamples.push(el.querySelectorAll('.ink-page').length)
    }
    const pages = [...el.querySelectorAll<HTMLElement>('.ink-page')].map((p) =>
      Number(p.dataset.page)
    )
    return {
      mountedSamples,
      deltas,
      lastPage: Math.max(...pages),
      atEnd: el.scrollTop >= end() - 1,
    }
  })

  await expect(
    page.locator(`.ink-page[data-page="${PAGES - 1}"] canvas[data-ink-canvas]`)
  ).toBeVisible()
  const after = await heap()
  const growthMb = (after! - before!) / MB
  const slow = result.deltas.filter((d) => d > 16.7)
  const slowShare = slow.length / result.deltas.length
  const worst = Math.max(...result.deltas)
  const maxMounted = Math.max(...result.mountedSamples)
  report('large document', {
    frames: result.deltas.length,
    maxMounted,
    heapBeforeMb: +(before! / MB).toFixed(1),
    heapAfterMb: +(after! / MB).toFixed(1),
    growthMb: +growthMb.toFixed(1),
    slowFramePercent: +(slowShare * 100).toFixed(2),
    worstFrameMs: +worst.toFixed(1),
  })

  expect(result.atEnd).toBe(true)
  expect(result.lastPage).toBe(PAGES - 1)
  expect(result.mountedSamples.filter((n) => n > 12)).toEqual([])
  expect(growthMb).toBeLessThan(150)
  expect(slowShare).toBeLessThanOrEqual(0.05)
  expect(worst).toBeLessThanOrEqual(100)
})
