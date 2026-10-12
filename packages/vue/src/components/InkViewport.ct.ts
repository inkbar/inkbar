import { computeCssLayout, mostVisiblePageCss, visibleRangeCss } from '@inkbar/core/dom'
import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import ViewportHarness from '../../playwright/harness/ViewportHarness.vue'

import type { PageInfo } from '@inkbar/core'
import type { ZoomValue } from '@inkbar/core/dom'

const assets = browserAssets()
const GAP = 16

/** `text-simple`: three US Letter pages. */
const letter = (index: number): PageInfo => ({
  index,
  box: { x: 0, y: 0, width: 612, height: 792 },
  rotate: 0,
  userUnit: 1,
  width: 612,
  height: 792,
})
const textSimple = [letter(0), letter(1), letter(2)]

function layoutAt(zoom: number, containerWidth: number) {
  return computeCssLayout({
    pages: textSimple,
    zoom,
    rotation: 0,
    gap: GAP,
    mode: 'continuous',
    current: 0,
    containerWidth,
  })
}

type DocHandle = {
  annotations: {
    add(i: unknown): { id: string }
    get(id: string): { origin?: string } | undefined
  }
}
type RootEl = HTMLElement & { __inkDocument?: DocHandle }

// Vue warnings and runtime errors fail the test instead of scrolling past in the output.
let consoleProblems: string[] = []
test.beforeEach(({ page }) => {
  consoleProblems = []
  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error') consoleProblems.push(m.text())
  })
  page.on('pageerror', (e) => consoleProblems.push(e.message))
})
test.afterEach(() => {
  expect(consoleProblems).toEqual([])
})

test('renders pages with canvas, text layer and overlay, virtualises them and drives the zoom and page models', async ({
  mount,
  page,
}) => {
  const zooms: ZoomValue[] = []
  const pages: number[] = []
  // `update` replaces the listeners, so every call passes them again.
  const on = {
    'update:zoom': (z: ZoomValue) => zooms.push(z),
    'update:page': (p: number) => pages.push(p),
  }
  const cmp = await mount(ViewportHarness, {
    props: { src: fixtureUrl('text-simple'), assets, zoom: 1, buffer: 0 },
    on,
  })
  const first = cmp.locator('.ink-page[data-page="0"]')
  await expect(first.locator('canvas[data-ink-canvas]')).toBeVisible()
  await expect(first.locator('[data-ink-text-layer] span').first()).toBeAttached()
  await expect(first.locator('[data-ink-overlay]')).toBeAttached()
  await expect(cmp.locator('[data-ink-viewport-root]')).toHaveAttribute(
    'data-state',
    'ready'
  )
  expect(zooms).toEqual([])

  await cmp.update({
    props: { src: fixtureUrl('text-simple'), assets, zoom: 2, buffer: 0 },
    on,
  })
  await expect(first).toHaveCSS('width', `${612 * 2}px`)
  // The prop applied to the viewport is reported back once, and the echo does not loop.
  await expect.poll(() => zooms).toEqual([2])

  const scroll = page.locator('[data-ink-scroll]')
  const target = 3000
  const size = await scroll.evaluate((el, top) => {
    el.scrollTop = top
    return { height: el.clientHeight, width: el.clientWidth }
  }, target)
  const layout = layoutAt(2, size.width)
  expect(layout.boxes.map((b) => b.top)).toEqual([16, 1616, 3216])
  const expectedPage = mostVisiblePageCss(layout, target, size.height)
  const expectedMounted = visibleRangeCss(layout, target, size.height, 0)
  expect(expectedPage).toBe(2)
  await expect.poll(() => pages.at(-1)).toBe(expectedPage)
  await expect
    .poll(() =>
      cmp
        .locator('.ink-page')
        .evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.page)))
    )
    .toEqual(expectedMounted)
  expect(expectedMounted).not.toContain(0)
  expect(zooms).toEqual([2])
})

test('shows the loading slot while the document opens', async ({ mount, page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/fixtures/text-simple.pdf', async (route) => {
    await gate
    await route.continue()
  })
  const cmp = await mount(ViewportHarness, {
    props: { src: fixtureUrl('text-simple'), assets, customLoading: true },
  })
  const root = cmp.locator('[data-ink-viewport-root]')
  await expect(root).toHaveAttribute('data-state', 'loading')
  const status = cmp.locator('[role="status"]')
  await expect(status).toHaveAttribute('aria-live', 'polite')
  await expect(status.getByTestId('custom-loading')).toHaveText('Opening the file')
  await expect(cmp.locator('.ink-page')).toHaveCount(0)
  release()
  await expect(root).toHaveAttribute('data-state', 'ready')
  await expect(status).toHaveCount(0)
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
})

test('shows the error slot with the code and stays interactive (Review Focus 5)', async ({
  mount,
  page,
}) => {
  const cmp = await mount(ViewportHarness, {
    props: { src: fixtureUrl('malformed-truncated'), assets, zoom: 1 },
  })
  const alert = cmp.locator('[role="alert"]')
  await expect(alert).toBeVisible()
  await expect(alert).toBeInViewport()
  await expect(alert).toContainText('InvalidPdf')
  await expect(cmp.locator('[data-ink-root]')).toHaveAttribute('data-state', 'error')
  await expect(cmp.locator('.ink-page')).toHaveCount(0)
  // The PDF parser reports what it tried on the broken file; nothing else may warn.
  expect(consoleProblems).toEqual([
    'Warning: Indexing all PDF objects',
    'Warning: Unterminated hex string',
  ])
  consoleProblems = []

  // Nothing covers or blocks the page around the viewport.
  const outside = cmp.getByTestId('outside')
  await outside.click()
  await expect(outside).toHaveText('Outside 1')
  const scroll = page.locator('[data-ink-scroll]')
  await scroll.focus()
  await expect(scroll).toBeFocused()

  await cmp.update({ props: { src: fixtureUrl('text-simple'), assets, zoom: 1 } })
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  await expect(alert).toHaveCount(0)
})

test('shows the PasswordRequired code for an encrypted file', async ({ mount }) => {
  const cmp = await mount(ViewportHarness, {
    props: { src: fixtureUrl('encrypted-aes'), assets, zoom: 1 },
  })
  const alert = cmp.locator('[role="alert"]')
  await expect(alert).toBeVisible()
  await expect(alert.locator('.ink-error-code')).toHaveText('PasswordRequired')
  await expect(cmp.locator('.ink-page')).toHaveCount(0)
})

test('renders custom annotation slot content inside the overlay element', async ({
  mount,
}) => {
  const cmp = await mount(ViewportHarness, {
    props: {
      src: fixtureUrl('annotated-notes-threaded'),
      assets,
      zoom: 1,
      customAnnotations: true,
    },
  })
  const custom = cmp.locator('[data-annotation][data-custom] > .my-pin')
  await expect(custom.first()).toBeVisible()
  await expect(custom).toHaveCount(4)
  await expect(custom.first()).toHaveAttribute('data-pin-state', 'idle')
  // `locked` mirrors the overlay's own `data-locked` flag (embedded notes arrive locked).
  const pairs = await cmp
    .locator('[data-annotation][data-custom]')
    .evaluateAll((els) =>
      els.map((e) => [
        e.querySelector<HTMLElement>('.my-pin')?.dataset.pinLocked,
        String(e.hasAttribute('data-locked')),
      ])
    )
  expect(pairs).toHaveLength(4)
  for (const [pin, overlay] of pairs) expect(pin).toBe(overlay)
  // The overlay draws nothing of its own into a custom element.
  await expect(cmp.locator('[data-annotation][data-custom] svg')).toHaveCount(0)
})

test('without the slot, the overlay draws the default visual once', async ({ mount }) => {
  const cmp = await mount(ViewportHarness, {
    props: { src: fixtureUrl('annotated-notes-threaded'), assets, zoom: 1 },
  })
  const elements = cmp.locator('[data-annotation]')
  await expect(elements).toHaveCount(4)
  await expect(cmp.locator('[data-annotation][data-custom]')).toHaveCount(0)
  for (const el of await elements.all()) await expect(el.locator('> svg')).toHaveCount(1)
  await expect(cmp.locator('.my-pin')).toHaveCount(0)
})

test('slot props follow the annotation: select, accept and dismiss a suggested redaction', async ({
  mount,
}) => {
  const cmp = await mount(ViewportHarness, {
    props: { src: fixtureUrl('text-simple'), assets, zoom: 1, customAnnotations: true },
  })
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const root = cmp.locator('[data-ink-root]')
  const add = () =>
    root.evaluate(
      (el) =>
        (el as RootEl).__inkDocument!.annotations.add({
          type: 'redact',
          origin: 'suggested',
          suggestion: { confidence: 0.9 },
          page: 0,
          rect: { x: 72, y: 600, width: 200, height: 40 },
        }).id
    )

  const first = await add()
  const el = cmp.locator(`[data-annotation="${first}"]`)
  await expect(el).toHaveAttribute('data-custom', '')
  await expect(el).toHaveAttribute('data-origin', 'suggested')
  await el.locator('.my-pin').click()
  await expect(el.locator('.my-pin')).toHaveAttribute('data-pin-state', 'selected')
  await el.getByTestId('accept').click()
  await expect(el).toHaveAttribute('data-origin', 'user')
  await expect(el.getByTestId('accept')).toHaveCount(0)
  expect(
    await root.evaluate(
      (r, id) => (r as RootEl).__inkDocument!.annotations.get(id)?.origin,
      first
    )
  ).toBe('user')

  const second = await add()
  const el2 = cmp.locator(`[data-annotation="${second}"]`)
  await el2.getByTestId('dismiss').click()
  await expect(el2).toHaveCount(0)
  await expect(cmp.locator('[data-annotation]')).toHaveCount(1)
})

test('keyboard zoom and page navigation on the focused scroll element', async ({
  mount,
  page,
}) => {
  const zooms: ZoomValue[] = []
  const pages: number[] = []
  const cmp = await mount(ViewportHarness, {
    props: { src: fixtureUrl('text-simple'), assets, zoom: 1 },
    on: {
      'update:zoom': (z: ZoomValue) => zooms.push(z),
      'update:page': (p: number) => pages.push(p),
    },
  })
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const scroll = page.locator('[data-ink-scroll]')
  await expect(scroll).toHaveAttribute('tabindex', '0')
  await expect(scroll).toHaveAttribute('role', 'document')
  await expect(scroll).toHaveAttribute('aria-label', 'Document')
  await scroll.focus()

  await page.keyboard.press('+')
  await expect(cmp.locator('.ink-page[data-page="0"]')).toHaveCSS(
    'width',
    `${612 * 1.25}px`
  )
  await expect.poll(() => zooms).toEqual([1.25])

  await page.keyboard.press('End')
  const size = await scroll.evaluate((el) => ({
    height: el.clientHeight,
    width: el.clientWidth,
    max: el.scrollHeight - el.clientHeight,
  }))
  const layout = layoutAt(1.25, size.width)
  const last = layout.boxes.at(-1)!
  const expectedTop = Math.min(size.max, last.top - GAP)
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(expectedTop)
  await expect.poll(() => pages.at(-1)).toBe(2)

  await page.keyboard.press('Home')
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(0)
  await expect.poll(() => pages.at(-1)).toBe(0)

  await page.keyboard.press('PageDown')
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollTop))
    .toBe(layout.boxes[1]!.top - GAP)
  await expect.poll(() => pages.at(-1)).toBe(1)
})

test('applies the tool to the scroll element', async ({ mount, page }) => {
  const cmp = await mount(ViewportHarness, {
    props: { src: fixtureUrl('text-simple'), assets, zoom: 1 },
  })
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  await expect(page.locator('[data-ink-scroll]')).toHaveAttribute('data-ink-tool', 'view')
})
