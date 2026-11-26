import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

import { guardConsole } from './console-guard'
import {
  metrics,
  readyCount,
  recordFirstPaint,
  report,
  waitForFirstPage,
} from './helpers'

const consoleGuard = guardConsole(test)

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze()
  report('axe rules passed', results.passes.map((r) => r.id).join(' '))
  return results.violations.map((v) => ({
    id: v.id,
    help: v.help,
    targets: v.nodes.map((n) => n.target.join(' ')),
  }))
}

/** Adds a note on page 1 with the note tool, writes its text and posts one reply; leaves the popover open. */
async function addNote(page: Page, text: string): Promise<void> {
  await page.locator('[data-tool="note"]').click()
  const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
  await page.mouse.click(box.x + 300, box.y + 300)
  const popover = page.locator('[data-ink-thread-popover]')
  await expect(popover).toBeVisible()
  // A new note takes its own text first; replies come once the root has some.
  await popover.getByRole('textbox', { name: 'Comment' }).fill(text)
  await popover.getByRole('button', { name: 'Comment' }).click()
  await popover.getByRole('textbox', { name: 'Reply' }).fill('Noted')
  await popover.getByRole('button', { name: 'Reply' }).click()
  await expect(popover.locator('[data-ink-thread-item]')).toHaveCount(2)
}

test.describe('accessibility', () => {
  // The banner lists the file's own annotations.
  test('the review page with its toolbar has no WCAG 2.2 AA violations', async ({
    page,
  }) => {
    await page.goto('/?doc=annotated-notes-threaded')
    await waitForFirstPage(page)
    const banner = page.getByTestId('embedded-banner')
    await expect(banner).toContainText('4 annotations')
    await expect(banner).toContainText('(4 Text)')
    expect(await axe(page)).toEqual([])
  })

  test('an open note popover has no WCAG 2.2 AA violations', async ({ page }) => {
    await page.goto('/?doc=text-simple')
    await waitForFirstPage(page)
    await addNote(page, 'Check this paragraph')
    expect(await axe(page)).toEqual([])
  })
})

test('the first page paints within 500 ms of ready', async ({ page }) => {
  await recordFirstPaint(page)
  await page.goto('/?doc=text-simple')
  await waitForFirstPage(page)
  await expect.poll(async () => (await metrics(page))?.firstPaint).toBeDefined()
  const m = (await metrics(page))!
  expect(m.ready).toHaveLength(1)
  const ms = m.firstPaint! - m.ready[0]!
  report('first paint after ready (ms)', ms.toFixed(1))
  expect(ms).toBeGreaterThanOrEqual(0)
  expect(ms).toBeLessThanOrEqual(500)
})

test('zooming from fit width to 400% never shows a blank frame', async ({ page }) => {
  await page.goto('/?doc=text-simple')
  await waitForFirstPage(page)
  const zoom = page.getByRole('combobox', { name: 'Zoom' })
  await expect(zoom).toHaveText('Fit width')
  // Open the list first, so the sampling below covers only the zoom.
  await zoom.click()
  const level = page.getByRole('option', { name: '400%', exact: true })
  await expect(level).toBeVisible()
  // Every frame until the 400% bitmap lands, then a few more: some canvas in the visible area
  // of the scroller must hold page pixels (opaque paper and dark text).
  const sampling = page.evaluate(
    () =>
      new Promise<{ frames: number; blank: number[]; finalWidth: number }>((resolve) => {
        const scroller = document.querySelector<HTMLElement>('[data-ink-scroll]')!
        const scratch = document.createElement('canvas')
        scratch.width = 96
        scratch.height = 124
        const g = scratch.getContext('2d', { willReadFrequently: true })!
        const visible = (c: HTMLCanvasElement) => {
          const r = c.getBoundingClientRect()
          const s = scroller.getBoundingClientRect()
          return r.width > 0 && r.bottom > s.top && r.top < s.bottom
        }
        const painted = (c: HTMLCanvasElement) => {
          if (c.width === 0 || c.height === 0) return false
          g.clearRect(0, 0, scratch.width, scratch.height)
          g.drawImage(c, 0, 0, scratch.width, scratch.height)
          const data = g.getImageData(0, 0, scratch.width, scratch.height).data
          let opaque = 0
          let ink = 0
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 255) opaque++
            if (data[i + 3]! > 0 && data[i]! < 240) ink++
          }
          return opaque > (data.length / 4) * 0.9 && ink > 0
        }
        const target = Math.round(612 * 4 * devicePixelRatio)
        const blank: number[] = []
        let frames = 0
        let after = 0
        const frame = () => {
          frames++
          const canvases = [
            ...scroller.querySelectorAll<HTMLCanvasElement>('canvas[data-ink-canvas]'),
          ].filter(visible)
          if (!canvases.some(painted)) blank.push(frames)
          const done = canvases.some((c) => c.width === target)
          if (done) after++
          if (after > 10 || frames > 600) {
            const finalWidth = Math.max(0, ...canvases.map((c) => c.width))
            resolve({ frames, blank, finalWidth })
          } else requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      })
  )
  await level.click()
  const result = await sampling
  report('zoom frames sampled', String(result.frames))
  expect(result.blank).toEqual([])
  expect(result.finalWidth).toBe(
    Math.round(612 * 4 * (await page.evaluate(() => devicePixelRatio)))
  )
})

test('host-owned annotations survive a re-signed URL and a reload, and a new version reloads', async ({
  page,
}) => {
  const fetched: string[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (url.pathname.endsWith('.pdf')) fetched.push(url.pathname + url.search)
  })
  await page.goto('/?doc=text-simple')
  await waitForFirstPage(page)
  expect(await readyCount(page)).toBe(1)

  await addNote(page, 'Keep across re-signing')
  await page
    .locator('[data-ink-thread-popover]')
    .getByRole('button', { name: 'Close' })
    .click()
  const status = page.getByTestId('status')
  await expect(status).toContainText('saved · 2 annotations')

  await page.getByRole('button', { name: 'Re-sign' }).click()
  await expect(status).toHaveAttribute('data-signature', '2')
  // Give a reload, were one to start, time to fetch and open.
  await page.waitForTimeout(500)
  expect(await readyCount(page)).toBe(1)
  expect(fetched).toEqual(['/fixtures/text-simple.pdf?sig=1'])
  await expect(page.locator('[data-annotation][data-type="text"]')).not.toHaveCount(0)
  await expect(status).toContainText('2 annotations')

  // A full reload starts a fresh page: the annotations come back from the fake server.
  const stored = await page.evaluate(() =>
    sessionStorage.getItem('inkbar-sandbox:annotations:case-1:v1')
  )
  expect(stored).not.toBeNull()
  const saved = JSON.parse(stored!) as {
    format: string
    documentKey: string
    annotations: { contents?: string }[]
  }
  expect(saved.format).toBe('gloss')
  expect(saved.documentKey).toBe('case-1:v1')
  expect(saved.annotations.map((a) => a.contents)).toContain('Keep across re-signing')
  await page.reload()
  await waitForFirstPage(page)
  await expect(status).toContainText('2 annotations')
  const note = page.locator('[data-annotation][data-type="text"]').first()
  await note.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-ink-thread-popover]')).toContainText(
    'Keep across re-signing'
  )
  await page.keyboard.press('Escape')

  // A new version is a new key: the viewer reloads and the new version has no annotations yet.
  await page.getByRole('button', { name: 'New version' }).click()
  await expect.poll(() => readyCount(page)).toBe(2)
  await waitForFirstPage(page)
  await expect(status).toContainText('0 annotations')
  await expect(page.locator('[data-annotation][data-type="text"]')).toHaveCount(0)
})

test("another program's redaction marks open as marks, and the banner leaves them out", async ({
  page,
}) => {
  await page.goto('/?doc=annotated-redact')
  await waitForFirstPage(page)
  const marks = page.locator(
    '[data-annotation][data-type="redact"][data-source="session"]'
  )
  await expect(marks).toHaveCount(2)
  // The file holds nothing else, so there is no banner.
  await expect(page.getByTestId('embedded-banner')).toHaveCount(0)
})

test('a broken file shows its error code and the page stays usable', async ({ page }) => {
  await page.goto('/?doc=malformed-truncated')
  await expect(page.locator('[data-ink-root]')).toHaveAttribute('data-state', 'error')
  await expect(page.getByRole('alert')).toContainText('InvalidPdf')
  const note = page.locator('[data-tool="note"]')
  await note.click()
  await expect(note).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Re-sign' }).click()
  await expect(page.getByTestId('status')).toHaveAttribute('data-signature', '2')
  // The broken file is refused with nothing written to the console.
  expect(consoleGuard.problems).toEqual([])
})

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

test('the drawing page draws the pages at each zoom, the thumbnails and a loupe', async ({
  page,
}) => {
  const binary: string[] = []
  page.on('request', (r) => {
    if (ENGINE_BINARY.test(r.url())) binary.push(r.url())
  })
  await page.goto('/?doc=text-simple&view=drawing')
  await waitForFirstPage(page)
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
})
