import { readFile } from 'node:fs/promises'

import { expect, test, type Locator, type Page, type Worker } from '@playwright/test'

import { CONTENT_SECURITY_POLICY } from '../policy'

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

/** Records the violations a document or a worker reports, in `__policyViolations`. */
function watchViolations(): void {
  const scope = globalThis as unknown as {
    __policyViolations?: Violation[]
    addEventListener(
      type: string,
      listener: (e: SecurityPolicyViolationEvent) => void
    ): void
  }
  if (scope.__policyViolations) return
  const seen: Violation[] = (scope.__policyViolations = [])
  scope.addEventListener('securitypolicyviolation', (e) => {
    seen.push({
      directive: e.effectiveDirective,
      blocked: e.blockedURI,
      source: `${e.sourceFile}:${e.lineNumber}`,
    })
  })
}

/** The workers each test's page started, while they run. */
const workers = new Set<Worker>()
/** The responses that must carry the policy: each page's document and the engine's worker. */
let served: { url: string; policy: string | undefined }[] = []

test.beforeEach(async ({ page }) => {
  workers.clear()
  served = []
  await page.addInitScript(watchViolations)
  page.on('worker', (worker) => {
    workers.add(worker)
    worker.on('close', () => workers.delete(worker))
    // A violation before this runs still reaches the console, which the checks below read.
    void worker.evaluate(watchViolations).catch(() => undefined)
  })
  page.on('response', (response) => {
    const request = response.request()
    // A blob: document, such as Print's frame, carries no headers: it takes its creator's policy.
    if (!response.url().startsWith('http')) return
    if (
      request.resourceType() === 'document' ||
      /\/worker\.mjs(\?|$)/.test(response.url())
    )
      served.push({
        url: response.url(),
        policy: response.headers()['content-security-policy'],
      })
  })
})

test.afterEach(async ({ page }) => {
  // The policy was sent with the page and with the worker's script, which runs under its own.
  expect(served.some(({ url }) => /\/worker\.mjs(\?|$)/.test(url))).toBe(true)
  expect(served.filter(({ policy }) => policy !== CONTENT_SECURITY_POLICY)).toEqual([])
  const seen: string[] = []
  for (const frame of page.frames()) {
    const found = await frame.evaluate(() => window.__policyViolations)
    if (!found)
      throw new Error(`No violations were watched in the frame at ${frame.url()}`)
    seen.push(
      ...found.map(
        (v) => `${v.directive} blocked ${v.blocked || '(inline)'} from ${v.source}`
      )
    )
  }
  for (const worker of workers) {
    const found = await worker.evaluate(
      () => (globalThis as { __policyViolations?: Violation[] }).__policyViolations
    )
    if (!found)
      throw new Error(`No violations were watched in the worker at ${worker.url()}`)
    seen.push(
      ...found.map((v) => `${v.directive} blocked ${v.blocked || '(inline)'} in a worker`)
    )
  }
  // Chrome also reports a violation in the console, a worker's among them.
  const said = consoleGuard.take(/Content Security Policy/i)
  expect(seen, 'violations of the content security policy').toEqual([])
  expect(said, 'console messages about the content security policy').toEqual([])
})

/** A one-pixel PNG, as an image stamp or signature keeps its image. */
const STAMP =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

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

/**
 * The drawn elements on the page, by tag, and those whose `fill`, `stroke` or `opacity` attribute
 * is not also inline style with priority important, as Inkbar sets it so page CSS cannot change
 * a drawing. A style the policy refused leaves the element without it.
 */
function drawnStyles(page: Page): Promise<{ tags: string[]; unstyled: string[] }> {
  return page.evaluate(() => {
    const tags = new Set<string>()
    const unstyled = new Set<string>()
    for (const el of document.querySelectorAll<SVGElement>('.ink-annotation svg *')) {
      tags.add(el.localName)
      for (const name of ['fill', 'stroke', 'opacity'])
        if (el.hasAttribute(name) && el.style.getPropertyPriority(name) !== 'important')
          unstyled.add(`${el.localName} ${name}`)
    }
    return { tags: [...tags].sort(), unstyled: [...unstyled].sort() }
  })
}

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
    await expect(
      page.locator('.ink-annotation svg .ink-note-icon').first()
    ).toBeAttached()
    expect((await drawnStyles(page)).unstyled).toEqual([])

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

  test('a speech bubble and its text are drawn with their styles', async ({ page }) => {
    await page.goto('/?doc=text-simple&view=drawing')
    await waitForFirstPage(page)
    await page.getByRole('button', { name: 'Choose shape' }).click()
    await page.getByRole('menuitemradio', { name: 'Speech bubble', exact: true }).click()
    const box = (await page.locator('.ink-page[data-page="0"]').boundingBox())!
    await page.mouse.move(box.x + 60, box.y + 60)
    await page.mouse.down()
    await page.mouse.move(box.x + 260, box.y + 140, { steps: 6 })
    await page.mouse.up()
    await expect(page.getByRole('textbox', { name: 'Text box' })).toBeFocused()
    await page.keyboard.type('Hello')
    await page.keyboard.press('Escape')
    await expect(page.locator('.ink-annotation svg text').first()).toHaveText('Hello')
    const drawn = await drawnStyles(page)
    expect(drawn.unstyled).toEqual([])
  })

  test("the theme draws a native select's chevron", async ({ page }) => {
    await page.goto('/?doc=text-simple')
    await waitForFirstPage(page)
    // A native select as core's zoom select is, styled by the theme: its chevron is a data: URL.
    const select = page.locator('select.ink-select')
    await page.evaluate(() => {
      const el = document.createElement('select')
      el.className = 'ink-select'
      el.setAttribute('aria-label', 'Zoom')
      el.append(new Option('100%'))
      document.querySelector('[data-ink-root]')!.append(el)
    })
    await expect(select).toBeVisible()
    expect(await select.evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(
      /^url\("data:image\/svg\+xml,/
    )
    // Let it paint, which is when a blocked image would be reported.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    )
  })

  test('an image stamp is drawn from its data: URL', async ({ page }) => {
    // The review page loads its annotations from the stand-in server, in session storage.
    await page.addInitScript(
      ([key, stamp]) => {
        sessionStorage.setItem(
          key,
          JSON.stringify({ format: 'gloss', version: 1, annotations: [stamp] })
        )
      },
      [
        'inkbar-sandbox:annotations:case-1:v1',
        {
          id: 'stamp-1',
          type: 'stamp',
          page: 0,
          rect: { x: 300, y: 600, width: 120, height: 40 },
          color: '#000000',
          opacity: 1,
          createdAt: '2026-11-27T00:00:00.000Z',
          modifiedAt: '2026-11-27T00:00:00.000Z',
          source: 'session',
          imagedata: STAMP,
        },
      ] as const
    )
    await page.goto('/?doc=text-simple')
    await waitForFirstPage(page)
    const image = page.locator('.ink-annotation svg image').first()
    await expect(image).toHaveAttribute('href', STAMP)
    // Drawn: the image loaded and has a size on screen.
    await expect
      .poll(() => image.evaluate((el: SVGImageElement) => el.getBBox().width))
      .toBeGreaterThan(0)
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    )
  })

  for (const doc of ['annotated-shapes', 'annotated-markup', 'freetext-fonts']) {
    test(`the annotations of ${doc} are drawn with their styles`, async ({ page }) => {
      await page.goto(`/?doc=${doc}`)
      await waitForFirstPage(page)
      await expect(page.locator('.ink-annotation svg *').first()).toBeAttached()
      const drawn = await drawnStyles(page)
      expect(drawn.unstyled).toEqual([])
    })
  }
})
