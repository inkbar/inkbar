import { guardConsole } from '@inkbar/e2e-shared/console-guard'
import { expect, test, type Page } from '@playwright/test'

guardConsole(test)

const viewer = (page: Page) => page.locator('[data-scenario-viewer]')
const toggle = (page: Page) =>
  page.getByRole('checkbox', { name: 'Draw pages with the engine (preview)' })
/** The engine's WebAssembly binary in the build. */
const ENGINE_BINARY = /\/inkbar-pdfium-[\w-]+\.wasm$/

async function firstPage(page: Page): Promise<void> {
  await expect(viewer(page).locator('[data-ink-root]')).toHaveAttribute(
    'data-state',
    'ready',
    { timeout: 30_000 }
  )
  await expect(
    viewer(page).locator('.ink-page[data-page="0"] canvas[data-ink-canvas]')
  ).toBeVisible()
}

const reader = (page: Page) =>
  page.evaluate(() => (globalThis as { __INKBAR_READER__?: unknown }).__INKBAR_READER__)

test('the engine toggle reopens the document and stays in the address', async ({
  page,
}) => {
  const binary: string[] = []
  page.on('request', (r) => {
    if (ENGINE_BINARY.test(new URL(r.url()).pathname)) binary.push(r.url())
  })
  await page.goto('./#/vanilla/tour')
  await firstPage(page)
  // Off, nothing changes: the engine is not fetched to open the document.
  await expect(toggle(page)).not.toBeChecked()
  expect(binary).toEqual([])

  await toggle(page).check()
  await expect(page).toHaveURL(/\?reader=engine#\/vanilla\/tour$/)
  await firstPage(page)
  expect(await reader(page)).toBe('engine')
  await expect.poll(() => binary.length).toBeGreaterThan(0)

  // Another scenario, then back: the parameter and the switch stay.
  await page.evaluate(() => (location.hash = '#/react/search'))
  await firstPage(page)
  await page.goBack()
  await expect(page).toHaveURL(/\?reader=engine#\/vanilla\/tour$/)
  await expect(toggle(page)).toBeChecked()

  await page.reload()
  await firstPage(page)
  await expect(toggle(page)).toBeChecked()
  expect(await reader(page)).toBe('engine')

  await toggle(page).uncheck()
  await expect(page).toHaveURL(/\/#\/vanilla\/tour$/)
  await firstPage(page)
  expect(await reader(page)).toBeUndefined()
})
