import { expect, test, type Page } from '@playwright/test'

import type { SandboxMetrics } from '../src/metrics'

/** Waits for the document to be ready and page 1 to have a rendered canvas. */
export async function waitForFirstPage(page: Page, timeout = 15_000): Promise<void> {
  await expect(page.locator('[data-ink-root]')).toHaveAttribute('data-state', 'ready', {
    timeout,
  })
  await expect(
    page.locator('.ink-page[data-page="0"] canvas[data-ink-canvas]')
  ).toBeVisible({
    timeout,
  })
  await expect(page.getByTestId('status')).toContainText(/ready|saved/)
}

/** The readers a scenario runs with: PDF.js, and the engine through the engine-reader route. */
export const READERS = ['pdfjs', 'engine'] as const
export type Reader = (typeof READERS)[number]

/** `path`, a URL with a query, asking for the engine-reader route when `reader` is the engine. */
export const withReader = (path: string, reader: Reader): string =>
  reader === 'engine' ? `${path}&reader=engine` : path

/** Fails unless `reader` opened the document, so a scenario cannot pass on the other reader. */
export async function expectReader(page: Page, reader: Reader): Promise<void> {
  await expect(page.getByTestId('status')).toHaveAttribute('data-reader', reader)
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
