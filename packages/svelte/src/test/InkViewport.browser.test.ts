import { computeCssLayout, mostVisiblePageCss, visibleRangeCss } from '@inkbar/core/dom'
import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { describe, expect, it } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import { attr, count, cssOf, gateFetch, q, qa, scrollTopOf, sleep } from './dom.js'
import BoundViewportHost from './harness/BoundViewportHost.svelte'
import ViewportHarness from './harness/ViewportHarness.svelte'

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
    get(
      id: string
    ):
      | { origin?: string; rect: { x: number; y: number; width: number; height: number } }
      | undefined
    selection: { get(): string[] }
  }
}
type RootEl = HTMLElement & { __inkDocument?: DocHandle }
const doc = () => document.querySelector<RootEl>('[data-ink-root]')!.__inkDocument!
const scroll = () => document.querySelector<HTMLElement>('[data-ink-scroll]')!
const SCROLL = '[data-ink-scroll]'
const FIRST = '.ink-page[data-page="0"]'
const SECOND = '.ink-page[data-page="1"]'

const consoleGuard = guardConsole()

/** A pointer drag on `el` by (dx, dy), the way the select tool sees one. */
async function drag(el: Element, dx: number, dy: number): Promise<void> {
  const r = el.getBoundingClientRect()
  const x = r.x + 5
  const y = r.y + 5
  const opts = (cx: number, cy: number) => ({
    bubbles: true,
    cancelable: true,
    clientX: cx,
    clientY: cy,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    buttons: 1,
  })
  el.dispatchEvent(new PointerEvent('pointerdown', opts(x, y)))
  for (let i = 1; i <= 5; i++) {
    el.dispatchEvent(
      new PointerEvent('pointermove', opts(x + (dx * i) / 5, y + (dy * i) / 5))
    )
    await sleep(10)
  }
  el.dispatchEvent(new PointerEvent('pointerup', { ...opts(x + dx, y + dy), buttons: 0 }))
}

describe('InkViewport', () => {
  // React: 'renders pages with canvas, text layer and overlay, virtualises them and drives the zoom and page models'
  it('renders pages with canvas, text layer and overlay, virtualises them and drives the zoom and page models', async () => {
    const zooms: ZoomValue[] = []
    const pages: number[] = []
    const screen = await render(ViewportHarness, {
      src: fixtureUrl('text-simple'),
      assets,
      zoom: 1,
      buffer: 0,
      onZoomChange: (z: ZoomValue) => zooms.push(z),
      onPageChange: (p: number) => pages.push(p),
    })
    await q(`${FIRST} canvas[data-ink-canvas]`)
    await q(`${FIRST} [data-ink-text-layer] span`)
    await q(`${FIRST} [data-ink-overlay]`)
    await expect.poll(attr('[data-ink-viewport-root]', 'data-state')).toBe('ready')
    expect(zooms).toEqual([])

    await screen.rerender({ zoom: 2 })
    await expect.poll(cssOf(FIRST, 'width')).toBe(`${612 * 2}px`)
    // The prop applied to the viewport is reported back once, and the echo does not loop.
    await expect.poll(() => zooms).toEqual([2])

    const target = 3000
    scroll().scrollTop = target
    const size = { height: scroll().clientHeight, width: scroll().clientWidth }
    const layout = layoutAt(2, size.width)
    expect(layout.boxes.map((b) => b.top)).toEqual([16, 1616, 3216])
    const expectedPage = mostVisiblePageCss(layout, target, size.height)
    const expectedMounted = visibleRangeCss(layout, target, size.height, 0)
    expect(expectedPage).toBe(2)
    await expect.poll(() => pages.at(-1)).toBe(expectedPage)
    await expect
      .poll(() => qa('.ink-page').map((e) => Number(e.dataset.page)))
      .toEqual(expectedMounted)
    expect(expectedMounted).not.toContain(0)
    expect(zooms).toEqual([2])
  })

  // React: 'shows the loading slot while the document opens'
  it('shows the loading snippet while the document opens', async () => {
    const gate = gateFetch('text-simple.pdf')
    try {
      const screen = await render(ViewportHarness, {
        src: fixtureUrl('text-simple'),
        assets,
        customLoading: true,
      })
      await expect.poll(attr('[data-ink-viewport-root]', 'data-state')).toBe('loading')
      const status = await q('[role="status"]')
      expect(status.getAttribute('aria-live')).toBe('polite')
      await expect
        .element(screen.getByTestId('custom-loading'))
        .toHaveTextContent('Opening the file')
      expect(count('.ink-page')()).toBe(0)
      gate.release()
      await expect.poll(attr('[data-ink-viewport-root]', 'data-state')).toBe('ready')
      await expect.poll(count('[role="status"]')).toBe(0)
      await q(`${FIRST} canvas`)
    } finally {
      gate.restore()
    }
  })

  // React: 'shows the error slot with the code and stays interactive'
  it('shows the error block with the code and stays interactive', async () => {
    const screen = await render(ViewportHarness, {
      src: fixtureUrl('malformed-truncated'),
      assets,
      zoom: 1,
    })
    const alert = await q('[role="alert"]')
    await expect.element(browserPage.elementLocator(alert)).toBeVisible()
    await expect.element(browserPage.elementLocator(alert)).toBeInViewport()
    expect(alert.textContent).toContain('InvalidPdf')
    // The engine's own message is on the code's tooltip, never in the visible copy.
    const message = alert.querySelector('code.ink-error-code')!.getAttribute('title')
    expect(message).toBeTruthy()
    expect(alert.innerText).not.toContain(message!)
    expect(alert.querySelectorAll('.ink-error-message').length).toBe(0)
    await expect.poll(attr('[data-ink-root]', 'data-state')).toBe('error')
    expect(count('.ink-page')()).toBe(0)
    // The engine's recovery warnings come from its worker and never reach this console.
    expect(consoleGuard.problems).toEqual([])

    // Nothing covers or blocks the page around the viewport.
    await screen.getByTestId('outside').click()
    await expect.element(screen.getByTestId('outside')).toHaveTextContent('Outside 1')
    scroll().focus()
    expect(document.activeElement).toBe(scroll())

    await screen.rerender({ src: fixtureUrl('text-simple') })
    await q(`${FIRST} canvas`)
    expect(count('[role="alert"]')()).toBe(0)
  })

  // React: 'a page that fails to render shows the page-error slot; the rest stays usable and a remount retries'
  it('a page that fails to render shows the page-error snippet; the rest stays usable and a remount retries', async () => {
    const screen = await render(ViewportHarness, {
      src: fixtureUrl('text-simple'),
      assets,
      zoom: 0.5,
      failPage: 1,
    })
    await q(`${FIRST} canvas[data-ink-canvas]`)
    await expect.poll(attr(SECOND, 'data-state')).toBe('error')
    const pageError = await q(`${SECOND} [data-ink-page-error]`)
    await expect.element(browserPage.elementLocator(pageError)).toBeVisible()
    expect(pageError.getAttribute('role')).toBe('alert')
    expect(pageError.textContent).toContain('Page 2 could not be shown.')
    expect(pageError.querySelector('code')!.textContent).toBe('InvalidPdf')
    expect(pageError.textContent).not.toContain('engine')
    expect(count(`${SECOND} canvas[data-ink-canvas]`)()).toBe(0)
    expect(attr(FIRST, 'data-state')()).not.toBe('error')
    await expect.poll(attr('[data-ink-viewport-root]', 'data-state')).toBe('ready')

    // The document stays usable: keyboard zoom works and nothing blocks the page around it.
    scroll().focus()
    await userEvent.keyboard('+')
    await expect.poll(cssOf(FIRST, 'width')).toBe(`${612 * 0.625}px`)
    await expect.element(browserPage.elementLocator(pageError)).toBeVisible()
    await screen.getByTestId('outside').click()
    await expect.element(screen.getByTestId('outside')).toHaveTextContent('Outside 1')

    // Once the page can be drawn, the next mount (a rebuild here) renders it.
    await screen.getByTestId('heal').click()
    await screen.rerender({ gap: 24 })
    await q(`${SECOND} canvas[data-ink-canvas]`)
    await expect.poll(count(`${SECOND} [data-ink-page-error]`)).toBe(0)
    await expect.poll(attr(SECOND, 'data-state')).not.toBe('error')
  })

  // React: 'a page error clears when a later render of the same mount succeeds'
  it('a page error clears when a later render of the same mount succeeds', async () => {
    const screen = await render(ViewportHarness, {
      src: fixtureUrl('text-simple'),
      assets,
      zoom: 0.5,
      failPage: 1,
    })
    await q(`${SECOND} [data-ink-page-error]`)
    await expect.poll(attr(SECOND, 'data-state')).toBe('error')
    // The page can be drawn again; a zoom change re-renders it without remounting.
    await screen.getByTestId('heal').click()
    scroll().focus()
    await userEvent.keyboard('+')
    await q(`${SECOND} canvas[data-ink-canvas]`)
    await expect.poll(count(`${SECOND} [data-ink-page-error]`)).toBe(0)
    await expect.poll(attr(SECOND, 'data-state')).not.toBe('error')
  })

  // React: 'a text layer failure keeps the page error even though the canvas renders'
  it('a text layer failure keeps the page error even though the canvas renders', async () => {
    await render(ViewportHarness, {
      src: fixtureUrl('text-simple'),
      assets,
      zoom: 0.5,
      failText: 1,
    })
    await q(`${SECOND} canvas[data-ink-canvas]`)
    await q(`${SECOND} [data-ink-page-error]`)
    await expect.poll(attr(SECOND, 'data-state')).toBe('error')
    // A canvas re-render succeeds; the text layer has not recovered, so the error stays.
    scroll().focus()
    await userEvent.keyboard('+')
    await expect.poll(cssOf(SECOND, 'width')).toBe(`${612 * 0.625}px`)
    await q(`${SECOND} canvas[data-ink-canvas]`)
    await sleep(300)
    expect(count(`${SECOND} [data-ink-page-error]`)()).toBe(1)
    expect(attr(SECOND, 'data-state')()).toBe('error')
    expect(attr(FIRST, 'data-state')()).not.toBe('error')
  })

  // React: 'shows the PasswordRequired code for an encrypted file'
  it('shows the PasswordRequired code for an encrypted file', async () => {
    await render(ViewportHarness, { src: fixtureUrl('encrypted-aes'), assets, zoom: 1 })
    const alert = await q('[role="alert"]')
    await expect.element(browserPage.elementLocator(alert)).toBeVisible()
    expect(alert.querySelector('.ink-error-code')!.textContent).toBe('PasswordRequired')
    expect(count('.ink-page')()).toBe(0)
  })

  // React: 'renders custom annotation slot content inside the overlay element'
  it('renders the annotation snippet inside the overlay element', async () => {
    await render(ViewportHarness, {
      src: fixtureUrl('annotated-notes-threaded'),
      assets,
      zoom: 1,
      customAnnotations: true,
    })
    const CUSTOM = '[data-annotation][data-custom] > .my-pin'
    await q(CUSTOM)
    await expect.poll(count(CUSTOM)).toBe(4)
    await expect.poll(attr(CUSTOM, 'data-pin-state')).toBe('idle')
    // `locked` mirrors the overlay's own `data-locked` flag (embedded notes arrive locked).
    const pairs = qa('[data-annotation][data-custom]').map((e) => [
      e.querySelector<HTMLElement>('.my-pin')?.dataset.pinLocked,
      String(e.hasAttribute('data-locked')),
    ])
    expect(pairs).toHaveLength(4)
    for (const [pin, overlay] of pairs) expect(pin).toBe(overlay)
    // The overlay draws nothing of its own into a custom element, and no wrapper came along.
    expect(count('[data-annotation][data-custom] svg')()).toBe(0)
    expect(count('[data-annotation][data-custom] > div[hidden]')()).toBe(0)
  })

  // React: 'without the slot, the overlay draws the default visual once'
  it('without the snippet, the overlay draws the default visual once', async () => {
    await render(ViewportHarness, {
      src: fixtureUrl('annotated-notes-threaded'),
      assets,
      zoom: 1,
    })
    await expect.poll(count('[data-annotation]')).toBe(4)
    expect(count('[data-annotation][data-custom]')()).toBe(0)
    for (const el of qa('[data-annotation]'))
      expect(el.querySelectorAll(':scope > svg').length).toBe(1)
    expect(count('.my-pin')()).toBe(0)
  })

  // React: 'slot props follow the annotation: select, accept and dismiss a suggested redaction'
  it('snippet props follow the annotation: select, accept and dismiss a suggested redaction (Review Focus 4)', async () => {
    await render(ViewportHarness, {
      src: fixtureUrl('text-simple'),
      assets,
      zoom: 1,
      customAnnotations: true,
      tool: 'select',
    })
    await q(`${FIRST} canvas`)
    const add = () =>
      doc().annotations.add({
        type: 'redact',
        origin: 'suggested',
        suggestion: { confidence: 0.9 },
        page: 0,
        rect: { x: 72, y: 600, width: 200, height: 40 },
      }).id

    const first = add()
    const sel = `[data-annotation="${first}"]`
    const el = await q(sel)
    await expect.poll(attr(sel, 'data-custom')).toBe('')
    expect(el.getAttribute('data-origin')).toBe('suggested')
    // A press on snippet content belongs to that content: it does not select. The pointer is
    // still over the element, so the overlay's hover state comes through.
    const pin = browserPage.elementLocator(await q(`${sel} .my-pin`))
    await pin.click()
    await expect.poll(attr(`${sel} .my-pin`, 'data-pin-state')).toBe('hover')
    expect(doc().annotations.selection.get()).toEqual([])
    await browserPage.elementLocator(el.querySelector('[data-testid="select"]')!).click()
    await expect.poll(attr(`${sel} .my-pin`, 'data-pin-state')).toBe('selected')
    // With the select tool, dragging a snippet control does not move the annotation.
    const rectOf = () => doc().annotations.get(first)?.rect
    const rectBefore = rectOf()
    await drag(el.querySelector('[data-testid="accept"]')!, 60, 40)
    expect(rectOf()).toEqual(rectBefore)
    expect(el.getAttribute('data-origin')).toBe('suggested')
    await browserPage.elementLocator(el.querySelector('[data-testid="accept"]')!).click()
    await expect.poll(attr(sel, 'data-origin')).toBe('user')
    await expect.poll(count(`${sel} [data-testid="accept"]`)).toBe(0)
    expect(doc().annotations.get(first)?.origin).toBe('user')

    const second = add()
    const sel2 = `[data-annotation="${second}"]`
    const el2 = await q(sel2)
    await browserPage
      .elementLocator(el2.querySelector('[data-testid="dismiss"]')!)
      .click()
    await expect.poll(count(sel2)).toBe(0)
    await expect.poll(count('[data-annotation]')).toBe(1)
    // The portal content came back out of a target core had removed, with nothing logged.
    expect(consoleGuard.problems).toEqual([])
  })

  // React: 'keys on slot controls reach the controls, not the annotation'
  it('keys on snippet controls reach the controls, not the annotation', async () => {
    const screen = await render(ViewportHarness, {
      src: fixtureUrl('text-simple'),
      assets,
      zoom: 1,
      customAnnotations: true,
    })
    await q(`${FIRST} canvas`)
    // Every case shares one page, and the last one left the pointer where this annotation
    // appears: park it, so the state below is the keyboard's doing and not a hover.
    await screen.getByTestId('outside').hover()
    const id = doc().annotations.add({
      type: 'redact',
      origin: 'suggested',
      suggestion: { confidence: 0.9 },
      page: 0,
      rect: { x: 72, y: 600, width: 200, height: 40 },
    }).id
    const sel = `[data-annotation="${id}"]`
    const el = await q(sel)
    const stored = () => doc().annotations.get(id)?.origin ?? 'gone'

    const input = browserPage.elementLocator(await q(`${sel} [data-testid="slot-input"]`))
    await input.fill('ab')
    await userEvent.keyboard('{Backspace}')
    await expect.element(input).toHaveValue('a')
    expect(stored()).toBe('suggested')

    const accept = el.querySelector<HTMLElement>('[data-testid="accept"]')!
    accept.focus()
    await userEvent.keyboard('{Enter}')
    await expect.poll(attr(sel, 'data-origin')).toBe('user')
    expect(stored()).toBe('user')
    // Enter reached the button: it accepted, rather than selecting the annotation.
    expect(attr(`${sel} .my-pin`, 'data-pin-state')()).toBe('idle')
  })

  // React: 'keyboard zoom and page navigation on the focused scroll element'
  it('keyboard zoom and page navigation on the focused scroll element', async () => {
    const zooms: ZoomValue[] = []
    const pages: number[] = []
    await render(ViewportHarness, {
      src: fixtureUrl('text-simple'),
      assets,
      zoom: 1,
      onZoomChange: (z: ZoomValue) => zooms.push(z),
      onPageChange: (p: number) => pages.push(p),
    })
    await q(`${FIRST} canvas`)
    expect(scroll().getAttribute('tabindex')).toBe('0')
    expect(scroll().getAttribute('role')).toBe('document')
    expect(scroll().getAttribute('aria-label')).toBe('Document')
    scroll().focus()

    await userEvent.keyboard('+')
    await expect.poll(cssOf(FIRST, 'width')).toBe(`${612 * 1.25}px`)
    await expect.poll(() => zooms).toEqual([1.25])

    await userEvent.keyboard('{End}')
    const size = {
      height: scroll().clientHeight,
      width: scroll().clientWidth,
      max: scroll().scrollHeight - scroll().clientHeight,
    }
    const layout = layoutAt(1.25, size.width)
    const last = layout.boxes.at(-1)!
    const expectedTop = Math.min(size.max, last.top - GAP)
    await expect.poll(scrollTopOf(SCROLL)).toBe(expectedTop)
    await expect.poll(() => pages.at(-1)).toBe(2)

    await userEvent.keyboard('{Home}')
    await expect.poll(scrollTopOf(SCROLL)).toBe(0)
    await expect.poll(() => pages.at(-1)).toBe(0)

    await userEvent.keyboard('{PageDown}')
    await expect.poll(scrollTopOf(SCROLL)).toBe(layout.boxes[1]!.top - GAP)
    await expect.poll(() => pages.at(-1)).toBe(1)
  })

  // React: 'applies the tool to the scroll element'
  it('applies the tool to the scroll element', async () => {
    await render(ViewportHarness, { src: fixtureUrl('text-simple'), assets, zoom: 1 })
    await q(`${FIRST} canvas`)
    await expect.poll(attr(SCROLL, 'data-ink-tool')).toBe('view')
  })

  // React: 'keeps the page and zoom when a gap change rebuilds the viewport'
  it('keeps the page and zoom when a gap change rebuilds the viewport', async () => {
    const zooms: ZoomValue[] = []
    const pages: number[] = []
    const screen = await render(ViewportHarness, {
      src: fixtureUrl('text-simple'),
      assets,
      zoom: 1.5,
      onZoomChange: (z: ZoomValue) => zooms.push(z),
      onPageChange: (p: number) => pages.push(p),
    })
    await q(`${FIRST} canvas`)
    scroll().focus()
    await userEvent.keyboard('{End}')
    await expect.poll(() => pages.at(-1)).toBe(2)
    const before = pages.length

    // Twice: every rebuild must remember the document, not only the first.
    for (const gap of [40, 24]) {
      await screen.rerender({ gap })
      const size = {
        width: scroll().clientWidth,
        max: scroll().scrollHeight - scroll().clientHeight,
      }
      const layout = layoutAt(1.5, size.width, gap)
      const third = '.ink-page[data-page="2"]'
      // The rebuilt layout is in place: page 2 sits where the new gap puts it.
      await expect.poll(cssOf(third, 'top')).toBe(`${layout.boxes[2]!.top}px`)
      await expect
        .poll(scrollTopOf(SCROLL))
        .toBe(Math.min(size.max, layout.boxes[2]!.top - gap))
      await expect.poll(cssOf(third, 'width')).toBe(`${612 * 1.5}px`)
      // Each page remounted against its new host: every live host holds attached layers.
      await expect
        .poll(() => {
          const hosts = qa('.ink-page')
          return (
            hosts.length > 0 &&
            hosts.every(
              (host) =>
                !!host.querySelector('[data-ink-canvas]') &&
                !!host.querySelector('[data-ink-text-layer]')
            )
          )
        })
        .toBe(true)
      // Nothing changed for the host, so nothing is reported: no jump to page 0, no zoom echo.
      expect(pages.slice(before)).toEqual([])
      expect(zooms).toEqual([])
    }
  })

  // No React counterpart: a prop read in an effect re-runs it whenever the host's expression
  // is invalidated, changed or not, so the build reads `gap` and `buffer` through deriveds.
  it('does not rebuild when the host restates the same gap and buffer', async () => {
    const zooms: ZoomValue[] = []
    const pages: number[] = []
    const screen = await render(ViewportHarness, {
      src: fixtureUrl('text-simple'),
      assets,
      zoom: 1,
      onZoomChange: (z: ZoomValue) => zooms.push(z),
      onPageChange: (p: number) => pages.push(p),
    })
    const canvas = await q(`${FIRST} canvas[data-ink-canvas]`)
    await q(`${FIRST} [data-ink-text-layer] span`)
    const hosts = qa('.ink-page')
    expect(hosts.length).toBeGreaterThan(0)
    const host = document.querySelector(FIRST)!

    for (const presses of [1, 2]) {
      await screen.getByTestId('restate').click()
      await expect
        .element(screen.getByTestId('restate'))
        .toHaveTextContent(`Restated ${presses}`)
      // A rebuild would have replaced the hosts within this flush; the wait covers the
      // remount of their layers.
      await sleep(200)
      expect(document.querySelector(FIRST)).toBe(host)
      expect(qa('.ink-page')).toEqual(hosts)
      expect(host.isConnected).toBe(true)
      expect(document.querySelector(`${FIRST} canvas[data-ink-canvas]`)).toBe(canvas)
      expect(canvas.isConnected).toBe(true)
    }
    expect(zooms).toEqual([])
    expect(pages).toEqual([])

    // Control: the same harness does rebuild when the gap really changes.
    await screen.rerender({ gap: 24 })
    await expect.poll(() => document.querySelector(FIRST) !== host).toBe(true)
    expect(host.isConnected).toBe(false)
  })

  // No React counterpart: the helper above has to be able to move an annotation, or the
  // 'does not move' assertion in the snippet case proves nothing.
  it('the select tool drags a plain annotation', async () => {
    await render(ViewportHarness, {
      src: fixtureUrl('text-simple'),
      assets,
      zoom: 1,
      tool: 'select',
    })
    await q(`${FIRST} canvas`)
    const id = doc().annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 72, y: 600, width: 200, height: 40 },
    }).id
    const el = await q(`[data-annotation="${id}"]`)
    expect(el.hasAttribute('data-custom')).toBe(false)
    await drag(el, 60, 40)
    // Zoom 1: CSS pixels are points, and y runs up the page.
    await expect
      .poll(() => doc().annotations.get(id)?.rect)
      .toEqual({ x: 132, y: 560, width: 200, height: 40 })
  })

  // No React counterpart: `bind:zoom` and `bind:page` are Svelte's two-way models.
  it('a host that binds zoom and page sees them follow the viewport', async () => {
    const screen = await render(BoundViewportHost, {
      src: fixtureUrl('text-simple'),
      assets,
    })
    await q(`${FIRST} canvas`)
    await expect.element(screen.getByTestId('bound-zoom')).toHaveTextContent('1')
    await expect.element(screen.getByTestId('bound-page')).toHaveTextContent('0')
    scroll().focus()
    await userEvent.keyboard('+')
    await expect.element(screen.getByTestId('bound-zoom')).toHaveTextContent('1.25')
    await userEvent.keyboard('{End}')
    await expect.element(screen.getByTestId('bound-page')).toHaveTextContent('2')

    // The other direction: the host's own write reaches the viewport.
    await screen.getByTestId('set-zoom-2').click()
    await expect.poll(cssOf(FIRST, 'width')).toBe(`${612 * 2}px`)
    await expect.element(screen.getByTestId('bound-zoom')).toHaveTextContent('2')
    await expect.element(screen.getByTestId('bound-page')).toHaveTextContent('2')
  })

  // No React counterpart: a function binding can refuse what the viewport reports.
  it('a host zoom outside the range is clamped and settles when the host withholds the report', async () => {
    const withheld: (ZoomValue | undefined)[] = []
    const screen = await render(BoundViewportHost, {
      src: fixtureUrl('text-simple'),
      assets,
      initialZoom: 10,
      withhold: true,
      onWithheld: (z: ZoomValue | undefined) => withheld.push(z),
    })
    await q(`${FIRST} canvas`)
    // The viewport opens at its maximum. Where it opens is not reported, only later changes.
    await expect.poll(cssOf(FIRST, 'width')).toBe(`${612 * 8}px`)
    await sleep(300)
    expect(withheld).toEqual([])
    // Applying the host's value again and again would end in an effect depth error.
    expect(consoleGuard.problems).toEqual([])
    expect(cssOf(FIRST, 'width')()).toBe(`${612 * 8}px`)
    await expect.element(screen.getByTestId('bound-zoom')).toHaveTextContent('10')

    // Back in range and out again after opening: now the clamped value is reported, once,
    // and the host still holds a value the viewport cannot take.
    await screen.getByTestId('set-zoom-2').click()
    await expect.poll(cssOf(FIRST, 'width')).toBe(`${612 * 2}px`)
    await screen.getByTestId('set-zoom-10').click()
    await expect.poll(cssOf(FIRST, 'width')).toBe(`${612 * 8}px`)
    await expect.poll(() => withheld).toEqual([2, 8])
    await sleep(300)
    expect(withheld).toEqual([2, 8])
    expect(consoleGuard.problems).toEqual([])
    expect(cssOf(FIRST, 'width')()).toBe(`${612 * 8}px`)
    await expect.element(screen.getByTestId('bound-zoom')).toHaveTextContent('10')
  })
})
