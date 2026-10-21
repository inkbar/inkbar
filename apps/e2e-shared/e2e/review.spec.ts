import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

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

const suggested = (page: Page) =>
  page.locator('[data-annotation][data-origin="suggested"]')

test.describe('accessibility', () => {
  test('the review page with its toolbar has no WCAG 2.2 AA violations', async ({
    page,
  }) => {
    await page.goto('/?doc=annotated-notes-threaded')
    await waitForFirstPage(page)
    await expect(page.getByTestId('embedded-banner')).toContainText('4 annotations')
    expect(await axe(page)).toEqual([])
  })

  test('an open suggestion card has no WCAG 2.2 AA violations', async ({ page }) => {
    await page.goto('/?doc=text-simple')
    await waitForFirstPage(page)
    await page.getByRole('button', { name: 'Suggest redactions' }).click()
    await expect(suggested(page)).toHaveCount(3)
    await suggested(page).first().click()
    await expect(page.locator('[data-ink-suggestion-card]')).toBeVisible()
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

test('suggested redactions can be accepted and dismissed', async ({ page }) => {
  await page.goto('/?doc=text-simple')
  await waitForFirstPage(page)
  await page.getByRole('button', { name: 'Suggest redactions' }).click()
  await expect(page.getByTestId('suggest-result')).toHaveText('3 suggested redactions')
  await expect(suggested(page)).toHaveCount(3)
  // One per page, on the line holding the number.
  const pages = await suggested(page).evaluateAll((els) =>
    els.map((el) => el.closest<HTMLElement>('.ink-page')!.dataset.page).sort()
  )
  expect(pages).toEqual(['0', '1', '2'])

  // A second run finds the same matches and adds nothing.
  await page.getByRole('button', { name: 'Suggest redactions' }).click()
  await expect(page.getByTestId('suggest-result')).toHaveText('0 suggested redactions')
  await expect(suggested(page)).toHaveCount(3)

  const card = page.locator('[data-ink-suggestion-card]')
  await suggested(page).first().click()
  await expect(card).toContainText('National Insurance number')
  await card.getByRole('button', { name: 'Accept' }).click()
  await expect(
    page.locator('[data-annotation][data-type="redact"][data-origin="user"]')
  ).toHaveCount(1)
  await expect(suggested(page)).toHaveCount(2)

  await suggested(page).first().click()
  await card.getByRole('button', { name: 'Dismiss' }).click()
  await expect(suggested(page)).toHaveCount(1)
  await expect(page.locator('[data-annotation][data-type="redact"]')).toHaveCount(2)
  await expect(page.getByTestId('status')).toContainText('saved · 2 annotations')
})

test('the banner counts annotations embedded in the file', async ({ page }) => {
  await page.goto('/?doc=annotated-redact')
  // PDF.js draws Redact annotations itself but logs that it has no dedicated renderer for them.
  const pdfjsRedact = /^Warning: Unimplemented annotation type "Redact"/
  await waitForFirstPage(page)
  const banner = page.getByTestId('embedded-banner')
  await expect(banner).toContainText('2 annotations')
  await expect(banner).toContainText('2 Redact')
  expect(consoleGuard.take(pdfjsRedact)).toHaveLength(2)
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
  // PDF.js's own diagnostics while it tries to recover the truncated file.
  expect(
    consoleGuard.take(/^Warning: (Indexing all PDF objects|Unterminated hex string)$/)
  ).toHaveLength(2)
})
