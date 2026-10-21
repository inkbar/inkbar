import { computeCssLayout, mostVisiblePageCss, visibleRangeCss } from '@inkbar/core/dom'
import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import { guardConsole } from '../../playwright/console-guard'
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

function layoutAt(zoom: number, containerWidth: number, gap = GAP) {
  return computeCssLayout({
    pages: textSimple,
    zoom,
    rotation: 0,
    gap,
    mode: 'continuous',
    current: 0,
    containerWidth,
  })
}

type DocHandle = {
  annotations: {
    add(i: unknown): { id: string }
    update(id: string, patch: unknown): unknown
    get(
      id: string
    ): { rect: { x: number; y: number; width: number; height: number } } | undefined
    selection: { get(): string[] }
  }
}
type RootEl = HTMLElement & { __inkDocument?: DocHandle }

const consoleGuard = guardConsole(test)

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
  // The engine's own message is on the code's tooltip, never in the visible copy.
  const message = await alert.locator('code.ink-error-code').getAttribute('title')
  expect(message).toBeTruthy()
  expect(await alert.innerText()).not.toContain(message!)
  await expect(alert.locator('.ink-error-message')).toHaveCount(0)
  await expect(cmp.locator('[data-ink-root]')).toHaveAttribute('data-state', 'error')
  await expect(cmp.locator('.ink-page')).toHaveCount(0)
  // The PDF parser reports what it tried on the broken file; nothing else may warn.
  expect(consoleGuard.problems).toEqual([
    'Warning: Indexing all PDF objects',
    'Warning: Unterminated hex string',
  ])
  consoleGuard.clear()

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

test('a page that fails to render shows the page-error slot; the rest stays usable and a remount retries', async ({
  mount,
  page,
}) => {
  const props = { src: fixtureUrl('text-simple'), assets, zoom: 0.5, failPage: 1 }
  const cmp = await mount(ViewportHarness, { props })
  const first = cmp.locator('.ink-page[data-page="0"]')
  const second = cmp.locator('.ink-page[data-page="1"]')
  await expect(first.locator('canvas[data-ink-canvas]')).toBeVisible()
  await expect(second).toHaveAttribute('data-state', 'error')
  const pageError = second.locator('[data-ink-page-error]')
  await expect(pageError).toBeVisible()
  await expect(pageError).toHaveAttribute('role', 'alert')
  await expect(pageError).toContainText('Page 2 could not be shown.')
  await expect(pageError.locator('code')).toHaveText('InvalidPdf')
  await expect(pageError).not.toContainText('engine')
  await expect(second.locator('canvas[data-ink-canvas]')).toHaveCount(0)
  await expect(first).not.toHaveAttribute('data-state', 'error')
  await expect(cmp.locator('[data-ink-viewport-root]')).toHaveAttribute(
    'data-state',
    'ready'
  )

  // The document stays usable: keyboard zoom works and nothing blocks the page around it.
  const scroll = page.locator('[data-ink-scroll]')
  await scroll.focus()
  await page.keyboard.press('+')
  await expect(first).toHaveCSS('width', `${612 * 0.625}px`)
  await expect(pageError).toBeVisible()
  const outside = cmp.getByTestId('outside')
  await outside.click()
  await expect(outside).toHaveText('Outside 1')

  // Once the page can be drawn, the next mount (a rebuild here) renders it.
  await cmp.getByTestId('heal').click()
  await cmp.update({ props: { ...props, gap: 24 } })
  await expect(second.locator('canvas[data-ink-canvas]')).toBeVisible()
  await expect(second.locator('[data-ink-page-error]')).toHaveCount(0)
  await expect(second).not.toHaveAttribute('data-state', 'error')
})

test('a page error clears when a later render of the same mount succeeds', async ({
  mount,
  page,
}) => {
  const cmp = await mount(ViewportHarness, {
    props: { src: fixtureUrl('text-simple'), assets, zoom: 0.5, failPage: 1 },
  })
  const second = cmp.locator('.ink-page[data-page="1"]')
  await expect(second.locator('[data-ink-page-error]')).toBeVisible()
  await expect(second).toHaveAttribute('data-state', 'error')
  // The page can be drawn again; a zoom change re-renders it without remounting.
  await cmp.getByTestId('heal').click()
  await page.locator('[data-ink-scroll]').focus()
  await page.keyboard.press('+')
  await expect(second.locator('canvas[data-ink-canvas]')).toBeVisible()
  await expect(second.locator('[data-ink-page-error]')).toHaveCount(0)
  await expect(second).not.toHaveAttribute('data-state', 'error')
})

test('a text layer failure keeps the page error even though the canvas renders', async ({
  mount,
  page,
}) => {
  const cmp = await mount(ViewportHarness, {
    props: { src: fixtureUrl('text-simple'), assets, zoom: 0.5, failText: 1 },
  })
  const second = cmp.locator('.ink-page[data-page="1"]')
  await expect(second.locator('canvas[data-ink-canvas]')).toBeVisible()
  await expect(second.locator('[data-ink-page-error]')).toBeVisible()
  await expect(second).toHaveAttribute('data-state', 'error')
  // A canvas re-render succeeds; the text layer has not recovered, so the error stays.
  await page.locator('[data-ink-scroll]').focus()
  await page.keyboard.press('+')
  await expect(second).toHaveCSS('width', `${612 * 0.625}px`)
  await expect(second.locator('canvas[data-ink-canvas]')).toBeVisible()
  await page.waitForTimeout(300)
  await expect(second.locator('[data-ink-page-error]')).toBeVisible()
  await expect(second).toHaveAttribute('data-state', 'error')
  await expect(cmp.locator('.ink-page[data-page="0"]')).not.toHaveAttribute(
    'data-state',
    'error'
  )
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
  await expect(custom).toHaveCount(2)
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
  expect(pairs).toHaveLength(2)
  for (const [pin, overlay] of pairs) expect(pin).toBe(overlay)
  // The overlay draws nothing of its own into a custom element.
  await expect(cmp.locator('[data-annotation][data-custom] svg')).toHaveCount(0)
})

test('without the slot, the overlay draws the default visual once', async ({ mount }) => {
  const cmp = await mount(ViewportHarness, {
    props: { src: fixtureUrl('annotated-notes-threaded'), assets, zoom: 1 },
  })
  const elements = cmp.locator('[data-annotation]')
  await expect(elements).toHaveCount(2)
  await expect(cmp.locator('[data-annotation][data-custom]')).toHaveCount(0)
  for (const el of await elements.all()) await expect(el.locator('> svg')).toHaveCount(1)
  await expect(cmp.locator('.my-pin')).toHaveCount(0)
})

test('slot props follow the annotation: select and remove a redaction', async ({
  mount,
  page,
}) => {
  const cmp = await mount(ViewportHarness, {
    props: {
      src: fixtureUrl('text-simple'),
      assets,
      zoom: 1,
      customAnnotations: true,
      tool: 'select',
    },
  })
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const root = cmp.locator('[data-ink-root]')
  const id = await root.evaluate(
    (el) =>
      (el as RootEl).__inkDocument!.annotations.add({
        type: 'redact',
        page: 0,
        rect: { x: 72, y: 600, width: 200, height: 40 },
      }).id
  )
  const el = cmp.locator(`[data-annotation="${id}"]`)
  await expect(el).toHaveAttribute('data-custom', '')
  // A press on slot content belongs to that content: it does not select. The pointer is
  // still over the element, so the overlay's hover state comes through.
  await el.locator('.my-pin').click()
  await expect(el.locator('.my-pin')).toHaveAttribute('data-pin-state', 'hover')
  expect(
    await root.evaluate((r) => (r as RootEl).__inkDocument!.annotations.selection.get())
  ).toEqual([])
  await el.getByTestId('select').click()
  await expect(el.locator('.my-pin')).toHaveAttribute('data-pin-state', 'selected')
  // With the select tool, dragging a slot control does not move the annotation.
  const rectOf = () =>
    root.evaluate((r, a) => (r as RootEl).__inkDocument!.annotations.get(a)?.rect, id)
  const rectBefore = await rectOf()
  const remove = await el.getByTestId('remove').boundingBox()
  await page.mouse.move(remove!.x + 5, remove!.y + 5)
  await page.mouse.down()
  await page.mouse.move(remove!.x + 65, remove!.y + 45, { steps: 5 })
  await page.mouse.up()
  expect(await rectOf()).toEqual(rectBefore)
  await el.getByTestId('remove').click()
  await expect(el).toHaveCount(0)
  expect(await rectOf()).toBeUndefined()
})

test('keys on slot controls reach the controls, not the annotation', async ({
  mount,
}) => {
  const cmp = await mount(ViewportHarness, {
    props: { src: fixtureUrl('text-simple'), assets, zoom: 1, customAnnotations: true },
  })
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const root = cmp.locator('[data-ink-root]')
  const id = await root.evaluate(
    (el) =>
      (el as RootEl).__inkDocument!.annotations.add({
        type: 'redact',
        page: 0,
        rect: { x: 72, y: 600, width: 200, height: 40 },
      }).id
  )
  const el = cmp.locator(`[data-annotation="${id}"]`)
  const present = () =>
    root.evaluate(
      (r, a) => (r as RootEl).__inkDocument!.annotations.get(a) !== undefined,
      id
    )

  // Backspace on the annotation would remove it; in the input it edits the text.
  const input = el.getByTestId('slot-input')
  await input.fill('ab')
  await input.press('Backspace')
  await expect(input).toHaveValue('a')
  expect(await present()).toBe(true)

  const select = el.getByTestId('select')
  await select.focus()
  await select.press('Enter')
  // Enter reached the button, and the button selected the annotation.
  await expect(el.locator('.my-pin')).toHaveAttribute('data-pin-state', 'selected')
  await expect(select).toBeFocused()
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
  await expect(page.locator('[data-ink-scroll]')).toHaveAttribute(
    'data-ink-tool',
    'select-text'
  )
})

test('keeps the page and zoom when a gap change rebuilds the viewport', async ({
  mount,
  page,
}) => {
  const zooms: ZoomValue[] = []
  const pages: number[] = []
  const on = {
    'update:zoom': (z: ZoomValue) => zooms.push(z),
    'update:page': (p: number) => pages.push(p),
  }
  const props = { src: fixtureUrl('text-simple'), assets, zoom: 1.5 }
  const cmp = await mount(ViewportHarness, { props, on })
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const scroll = page.locator('[data-ink-scroll]')
  await scroll.focus()
  await page.keyboard.press('End')
  await expect.poll(() => pages.at(-1)).toBe(2)
  const before = pages.length

  // Twice: every rebuild must remember the document, not only the first.
  for (const gap of [40, 24]) {
    await cmp.update({ props: { ...props, gap }, on })
    const size = await scroll.evaluate((el) => ({
      width: el.clientWidth,
      max: el.scrollHeight - el.clientHeight,
    }))
    const layout = layoutAt(1.5, size.width, gap)
    // The rebuilt layout is in place: page 2 sits where the new gap puts it.
    await expect(cmp.locator('.ink-page[data-page="2"]')).toHaveCSS(
      'top',
      `${layout.boxes[2]!.top}px`
    )
    await expect
      .poll(() => scroll.evaluate((el) => el.scrollTop))
      .toBe(Math.min(size.max, layout.boxes[2]!.top - gap))
    await expect(cmp.locator('.ink-page[data-page="2"]')).toHaveCSS(
      'width',
      `${612 * 1.5}px`
    )
    // Each page remounted against its new host: every live host holds attached layers.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const hosts = [...document.querySelectorAll<HTMLElement>('.ink-page')]
          return (
            hosts.length > 0 &&
            hosts.every(
              (host) =>
                !!host.querySelector('[data-ink-canvas]') &&
                !!host.querySelector('[data-ink-text-layer]')
            )
          )
        })
      )
      .toBe(true)
    // Nothing changed for the host, so nothing is reported: no jump to page 0, no zoom echo.
    expect(pages.slice(before)).toEqual([])
    expect(zooms).toEqual([])
  }
})

test('toggling the annotation slot keeps the scroll position and swaps the custom content', async ({
  mount,
  page,
}) => {
  const props = { src: fixtureUrl('text-simple'), assets, zoom: 1 }
  const cmp = await mount(ViewportHarness, { props })
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  await page.locator('[data-ink-root]').evaluate((el) => {
    ;(el as RootEl).__inkDocument!.annotations.add({
      type: 'text',
      page: 1,
      rect: { x: 72, y: 600, width: 24, height: 24 },
    })
  })
  const scroll = page.locator('[data-ink-scroll]')
  const width = await scroll.evaluate((el) => el.clientWidth)
  const target = layoutAt(1, width).boxes[1]!.top + 300
  await scroll.evaluate((el, top) => {
    el.scrollTop = top
  }, target)
  const second = cmp.locator('.ink-page[data-page="1"]')
  await expect(second.locator('[data-annotation]')).toHaveCount(1)
  const before = await scroll.evaluate((el) => el.scrollTop)
  expect(Math.abs(before - target)).toBeLessThanOrEqual(1)

  await cmp.update({ props: { ...props, customAnnotations: true } })
  await expect(second.locator('[data-annotation][data-custom] > .my-pin')).toHaveCount(1)
  expect(
    Math.abs((await scroll.evaluate((el) => el.scrollTop)) - before)
  ).toBeLessThanOrEqual(2)

  await cmp.update({ props: { ...props, customAnnotations: false } })
  await expect(cmp.locator('.my-pin')).toHaveCount(0)
  await expect(second.locator('[data-annotation]:not([data-custom])')).toHaveCount(1)
  expect(
    Math.abs((await scroll.evaluate((el) => el.scrollTop)) - before)
  ).toBeLessThanOrEqual(2)
})

test('a gap change and a slot toggle in one tick rebuild the viewport once', async ({
  mount,
  page,
}) => {
  const props = { src: fixtureUrl('text-simple'), assets, zoom: 1 }
  const cmp = await mount(ViewportHarness, { props })
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  await page.locator('[data-ink-root]').evaluate((el) => {
    ;(el as RootEl).__inkDocument!.annotations.add({
      type: 'text',
      page: 1,
      rect: { x: 72, y: 600, width: 24, height: 24 },
    })
  })
  const scroll = page.locator('[data-ink-scroll]')
  const width = await scroll.evaluate((el) => el.clientWidth)
  const target = layoutAt(1, width).boxes[1]!.top + 300
  await scroll.evaluate((el, top) => {
    el.scrollTop = top
  }, target)
  const second = cmp.locator('.ink-page[data-page="1"]')
  await expect(second.locator('[data-annotation]')).toHaveCount(1)
  const before = await scroll.evaluate((el) => el.scrollTop)
  expect(Math.abs(before - target)).toBeLessThanOrEqual(1)

  // Counts every page host the viewer creates from here on: one rebuild makes one set.
  await page.evaluate(() => {
    const w = window as unknown as { __hosts: number }
    w.__hosts = 0
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (n instanceof HTMLElement && n.classList.contains('ink-page')) w.__hosts += 1
    }).observe(document.body, { childList: true, subtree: true })
  })
  const gap = 40
  await cmp.update({ props: { ...props, gap, customAnnotations: true } })
  await expect(second.locator('[data-annotation][data-custom] > .my-pin')).toHaveCount(1)
  await expect(cmp.locator('.ink-page[data-page="2"]')).toHaveCSS(
    'top',
    `${layoutAt(1, width, gap).boxes[2]!.top}px`
  )
  // Let a second rebuild, had there been one, finish mounting.
  await page.waitForTimeout(500)
  expect(
    await page.evaluate(() => (window as unknown as { __hosts: number }).__hosts)
  ).toBe(textSimple.length)
  await expect(cmp.locator('.my-pin')).toHaveCount(1)
  await expect(cmp.locator('[data-annotation]:not([data-custom])')).toHaveCount(0)
  const top = await scroll.evaluate((el) => el.scrollTop)
  // Still 300px into the second page, wherever the new gap puts it.
  const expected = layoutAt(1, width, gap).boxes[1]!.top + 300
  expect(Math.abs(top - expected)).toBeLessThanOrEqual(2)
})

test('decorateAnnotation reaches the annotation elements', async ({ mount, page }) => {
  const props = {
    src: fixtureUrl('text-simple'),
    assets,
    zoom: 1,
    decorateMark: 'note',
  }
  const cmp = await mount(ViewportHarness, { props })
  await expect(cmp.locator('.ink-page[data-page="0"] canvas')).toBeVisible()
  const id = await page.locator('[data-ink-root]').evaluate(
    (el) =>
      (el as RootEl).__inkDocument!.annotations.add({
        type: 'text',
        page: 0,
        rect: { x: 72, y: 600, width: 24, height: 24 },
      }).id
  )
  const note = cmp.locator(`.ink-annotation[data-annotation="${id}"]`)
  await expect(note).toHaveAttribute('data-test-mark', 'note')

  // A new function identity applies on the next render, without a rebuild.
  await cmp.update({ props: { ...props, decorateMark: 'other' } })
  await page.locator('[data-ink-root]').evaluate(
    (el, annotationId) =>
      (el as RootEl).__inkDocument!.annotations.update(annotationId, {
        rect: { x: 100, y: 600, width: 24, height: 24 },
      }),
    id
  )
  await expect(note).toHaveAttribute('data-test-mark', 'other')
})
