import { expect, test, type Locator, type Page } from '@playwright/test'

import { guardConsole } from './console-guard'
import { waitForFirstPage } from './helpers'

guardConsole(test)

/** The engine's WebAssembly binary, under its built name or its own. */
const ENGINE_BINARY = /\/inkbar-pdfium[^/]*\.wasm(\?|$)/

/**
 * How many sampled pixels of a canvas are darker than paper; 0 while it has no size. Read
 * through a copy, so polling never reads the same canvas back twice (Chrome warns of that).
 */
function inked(canvas: Locator): Promise<number> {
  return canvas.evaluate((c: HTMLCanvasElement) => {
    if (c.width === 0 || c.height === 0) return 0
    const copy = document.createElement('canvas')
    copy.width = c.width
    copy.height = c.height
    const context = copy.getContext('2d', { willReadFrequently: true })!
    context.drawImage(c, 0, 0)
    const { data } = context.getImageData(0, 0, c.width, c.height)
    let count = 0
    for (let i = 0; i < data.length; i += 4 * 7)
      if (data[i]! < 200 || data[i + 1]! < 200 || data[i + 2]! < 200) count++
    return count
  })
}

const pageCanvas = (page: Page) =>
  page.locator('.ink-page[data-page="0"] canvas[data-ink-canvas]')

/** Page 1's canvas width, once the canvas on screen is a new one at least `than` wide. */
async function widerCanvas(page: Page, than: number): Promise<number> {
  let width = 0
  await expect
    .poll(
      async () =>
        (width = await pageCanvas(page).evaluate((c: HTMLCanvasElement) => c.width))
    )
    .toBeGreaterThan(than)
  return width
}

/** Drags a shape over page 1, centred on its third line of text, clear of the page's edges. */
async function dragOverText(page: Page): Promise<void> {
  const word = page
    .locator('.ink-page[data-page="0"] [data-ink-text-layer] span')
    .filter({ hasText: 'National Insurance' })
    .first()
  // Zoomed in, the top of the page may be out of view.
  await word.scrollIntoViewIfNeeded()
  const box = (await word.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x - 60, y - 40)
  await page.mouse.down()
  await page.mouse.move(x + 60, y + 40, { steps: 6 })
  await page.mouse.up()
}

test('the engine draws the pages, the thumbnails and a loupe, and search paints a hit', async ({
  page,
}) => {
  const binary: string[] = []
  page.on('request', (r) => {
    if (ENGINE_BINARY.test(r.url())) binary.push(r.url())
  })
  await page.goto('/?doc=text-simple&reader=engine')
  await waitForFirstPage(page)
  // The reader that drew them, so a page PDF.js drew fails here.
  await expect(page.getByTestId('status')).toHaveAttribute('data-reader', 'engine')
  await expect.poll(() => inked(pageCanvas(page))).toBeGreaterThan(50)
  expect(binary.length).toBeGreaterThan(0)

  // Each step of Zoom in draws a new, larger canvas.
  let width = await pageCanvas(page).evaluate((c: HTMLCanvasElement) => c.width)
  for (let step = 0; step < 2; step++) {
    await page.getByRole('button', { name: 'Zoom in' }).click()
    width = await widerCanvas(page, width)
    await expect.poll(() => inked(pageCanvas(page))).toBeGreaterThan(50)
  }

  await page.getByRole('tab', { name: 'Thumbnails' }).click()
  const thumbnail = page.locator('[data-ink-thumbnails] canvas[data-ink-canvas]').first()
  await expect(thumbnail).toBeVisible()
  await expect.poll(() => inked(thumbnail)).toBeGreaterThan(10)

  await page.getByRole('button', { name: 'Choose shape' }).click()
  await page.getByRole('menuitemradio', { name: 'Loupe', exact: true }).click()
  await dragOverText(page)
  const lens = page.locator(
    '.ink-page[data-page="0"] .ink-annotation[data-type="loupe"] canvas[data-ink-loupe]'
  )
  await expect(lens).toHaveCount(1)
  await expect.poll(() => inked(lens)).toBeGreaterThan(10)

  // The find bar searches the engine's text and paints the hit over page 1.
  await page.locator('[data-ink-scroll]').focus()
  await page.keyboard.press('Control+f')
  const field = page.getByRole('textbox', { name: 'Find in document' })
  await expect(field).toBeFocused()
  await page.keyboard.type('QQ123456C')
  await expect(page.locator('[data-ink-find-count]')).toHaveText('1 of 3')
  await expect(
    page.locator('.ink-page[data-page="0"] [data-search-hit]').first()
  ).toBeVisible()
})

test('a link the engine reads takes the reader to its page', async ({ page }) => {
  await page.goto('/?doc=links&reader=engine')
  await waitForFirstPage(page)
  await expect(page.getByTestId('status')).toHaveAttribute('data-reader', 'engine')
  // The thumbnails mark the page in view: the page input is not on this page.
  await page.getByRole('tab', { name: 'Thumbnails' }).click()
  const current = page.locator('[data-ink-thumbnails] [aria-current="page"]')
  await expect(current).toHaveAttribute('data-ink-thumbnail-item', '0')
  // The first link on page 1 goes to page 2. Link elements never take the pointer, so the
  // page is clicked at the link's middle.
  const link = page
    .locator('.ink-page[data-page="0"] [data-ink-link-layer] [data-ink-link]')
    .first()
  await link.scrollIntoViewIfNeeded()
  const box = (await link.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(current).toHaveAttribute('data-ink-thumbnail-item', '1')
})
