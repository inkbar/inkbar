import { readFile } from 'node:fs/promises'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { guardConsole } from './console-guard'
import { waitForFirstPage } from './helpers'

// Served by the `policy` project's preview server, under the content security policy in
// `../policy.ts`: what the core README tells a host to send.

const consoleGuard = guardConsole(test)

interface Violation {
  directive: string
  blocked: string
  source: string
}

declare global {
  interface Window {
    __policyViolations?: Violation[]
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const seen: Violation[] = (window.__policyViolations = [])
    document.addEventListener('securitypolicyviolation', (e) => {
      seen.push({
        directive: e.effectiveDirective,
        blocked: e.blockedURI,
        source: `${e.sourceFile}:${e.lineNumber}`,
      })
    })
  })
})

test.afterEach(async ({ page }) => {
  const seen = (
    await page.evaluate(() => window.__policyViolations ?? []).catch(() => [])
  ).filter(
    // The schema library checks once whether it may compile with `Function`, which the policy
    // refuses, and then validates without compiling.
    (v) => !(v.directive === 'script-src' && v.blocked === 'eval')
  )
  // Chrome also reports a violation in the console, a worker's among them.
  const said = consoleGuard.take(/Content Security Policy/i)
  expect(
    seen.map((v) => `${v.directive} blocked ${v.blocked || '(inline)'} from ${v.source}`),
    'violations of the content security policy'
  ).toEqual([])
  expect(said, 'console messages about the content security policy').toEqual([])
})

/** How many sampled pixels of a canvas are darker than paper, read through a copy. */
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

const firstPage = (page: Page) =>
  page.locator('.ink-page[data-page="0"] canvas[data-ink-canvas]')

/** A form field's box in the form layer; its control is inside it. */
const field = (page: Page, name: string) =>
  page.locator(`[data-ink-field="${name}"]`).first()

/** Whether `bytes` hold an annotation Inkbar wrote: its `/INKB_Gloss` entry. */
const holdsGloss = (bytes: Uint8Array): boolean =>
  Buffer.from(bytes).toString('latin1').includes('/INKB_Gloss')

test.describe('under the documented content security policy', () => {
  test('the engine starts and draws page 1', async ({ page }) => {
    const binary = page.waitForResponse(/\/inkbar-pdfium[^/]*\.wasm(\?|$)/)
    await page.goto('/?doc=text-simple')
    expect((await binary).ok()).toBe(true)
    await waitForFirstPage(page)
    await expect.poll(() => inked(firstPage(page))).toBeGreaterThan(50)
  })

  test('a fallback font is fetched for text the file does not embed', async ({
    page,
  }) => {
    const font = page.waitForResponse(/\/NotoSansJP-Regular\.otf(\?|$)/)
    await page.goto('/?doc=unembedded-japanese')
    expect((await font).ok()).toBe(true)
    await waitForFirstPage(page)
    await expect.poll(() => inked(firstPage(page))).toBeGreaterThan(50)
  })

  test("a form's calculation script runs", async ({ page }) => {
    const sandbox = page.waitForResponse(/\/quickjs-eval\.wasm(\?|$)/)
    await page.goto('/?doc=form-scripted')
    await waitForFirstPage(page)
    const qty = field(page, 'qty').locator('input')
    const price = field(page, 'price').locator('input')
    await expect(qty).toBeVisible()
    await price.fill('12.5')
    await price.press('Enter')
    await qty.fill('2')
    await qty.press('Enter')
    await expect(field(page, 'total').locator('input')).toHaveValue('£25.00')
    expect((await sandbox).ok()).toBe(true)
  })

  test('a note is added, downloaded and printed', async ({ page }) => {
    await page.goto('/?doc=text-simple')
    await waitForFirstPage(page)
    await page.locator('[data-tool="note"]').click()
    const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
    await page.mouse.click(box.x + 300, box.y + 300)
    const popover = page.locator('[data-ink-thread-popover]')
    await popover.getByRole('textbox', { name: 'Comment' }).fill('Check this paragraph')
    await popover.getByRole('button', { name: 'Comment' }).click()
    await page.keyboard.press('Escape')

    const saving = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download' }).click()
    const file = await saving
    expect(holdsGloss(new Uint8Array(await readFile(await file.path())))).toBe(true)

    // Print loads the copy into a frame from a blob: URL; the dialog itself is the browser's.
    await page.evaluate(() => {
      window.print = () => undefined
    })
    await page.getByRole('button', { name: 'Print' }).click()
    const frame = page.locator('[data-ink-print-frame]')
    await expect(frame).toHaveAttribute('src', /^blob:/)
    await expect
      .poll(() =>
        frame.evaluate((f: HTMLIFrameElement) => {
          try {
            // A frame the policy blocked holds Chrome's error page, of another origin.
            return f.contentDocument?.contentType ?? 'blocked'
          } catch {
            return 'blocked'
          }
        })
      )
      .not.toBe('blocked')
  })
})
