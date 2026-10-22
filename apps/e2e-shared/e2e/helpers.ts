import { expect, test, type Page } from '@playwright/test'

import type { SandboxMetrics } from '../src/metrics'

/** Waits for the document to be ready and page 1 to have a rendered canvas. */
export async function waitForFirstPage(page: Page, timeout = 15_000): Promise<void> {
  await expect(page.locator('[data-ink-root]')).toHaveAttribute('data-state', 'ready', {
    timeout,
  })
  // A page with form fields has a second canvas under its fields, for their appearances.
  await expect(
    page.locator('.ink-page[data-page="0"] canvas[data-ink-canvas]').first()
  ).toBeVisible({
    timeout,
  })
  await expect(page.getByTestId('status')).toContainText(/ready|saved/)
}

export async function readyCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__inkbarMetrics?.ready.length ?? 0)
}

export async function metrics(page: Page): Promise<SandboxMetrics | undefined> {
  return page.evaluate(() => window.__inkbarMetrics)
}

/**
 * Records, before any page script runs, the frame after page 1's first canvas appears with a
 * non-zero size: the first frame that can show the page.
 */
export async function recordFirstPaint(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const hasCanvas = () => {
      const c = document.querySelector<HTMLCanvasElement>(
        '.ink-page[data-page="0"] canvas[data-ink-canvas]'
      )
      return !!c && c.width > 0 && c.height > 0 && c.getBoundingClientRect().width > 0
    }
    const observer = new MutationObserver(() => {
      if (!hasCanvas()) return
      observer.disconnect()
      requestAnimationFrame(() => {
        const m = (window.__inkbarMetrics ??= { ready: [] })
        m.firstPaint = performance.now()
      })
    })
    observer.observe(document, { childList: true, subtree: true })
  })
}

/** Adds a measurement to the test's report. */
export function report(type: string, value: unknown): void {
  const description = typeof value === 'string' ? value : JSON.stringify(value)
  test.info().annotations.push({ type, description })
}
