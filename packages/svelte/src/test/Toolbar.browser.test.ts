import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { describe, expect, it } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import { attr, cssOf, focused, q, scrollTopOf, sleep } from './dom.js'
import LineStyleHarness from './harness/LineStyleHarness.svelte'
import ToolbarHarness from './harness/ToolbarHarness.svelte'
import ZoomClickHarness from './harness/ZoomClickHarness.svelte'

const assets = browserAssets()
guardConsole()

/** Toolbar buttons carry `data-tool`; scope to the toolbar so nothing else can match. */
const toolButton = (id: string) => `[data-ink-toolbar] [data-tool="${id}"]`
const FIRST = '.ink-page[data-page="0"]'
const SCROLL = '[data-ink-scroll]'
const toolbar = () => browserPage.getByRole('toolbar', { name: 'Document tools' })
const statusBar = () => browserPage.getByRole('toolbar', { name: 'Page and zoom' })
const zoomSelect = () => browserPage.getByRole('combobox', { name: 'Zoom' })
/** Opens the zoom select and clicks an option, as a reader would. */
async function choose(name: string): Promise<void> {
  await zoomSelect().click()
  await browserPage.getByRole('option', { name, exact: true }).click()
}

describe('toolbar', () => {
  // React: 'tool buttons reflect and set the active tool with aria-pressed and onToolChange'
  it('tool buttons reflect and set the active tool with aria-pressed and onToolChange', async () => {
    const tools: string[] = []
    await render(ToolbarHarness, {
      src: fixtureUrl('text-simple'),
      assets,
      onToolChange: (t: string) => tools.push(t),
    })
    await q(`${SCROLL} .ink-page canvas`)
    await expect.element(toolbar()).toBeVisible()
    await expect.poll(attr(toolButton('select-text'), 'aria-pressed')).toBe('true')
    expect(attr(toolButton('select-text'), 'data-state')()).toBe('on')
    expect(attr(toolButton('highlight'), 'aria-pressed')()).toBe('false')
    expect(attr(toolButton('highlight'), 'data-state')()).toBe('off')
    await browserPage.elementLocator(await q(toolButton('highlight'))).click()
    await expect.poll(attr(toolButton('highlight'), 'aria-pressed')).toBe('true')
    expect(attr(toolButton('highlight'), 'data-state')()).toBe('on')
    expect(attr(toolButton('select-text'), 'aria-pressed')()).toBe('false')
    expect(tools).toEqual(['highlight'])
    await expect.poll(attr(SCROLL, 'data-ink-tool')).toBe('highlight')
  })

  // React: 'every toolbar control has an accessible name'
  it('every toolbar control has an accessible name', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
    for (const name of [
      'Select text',
      'Rectangle select',
      'Highlight',
      'Mark for redaction',
      'Add note',
      'Line style',
      'Undo',
      'Redo',
    ])
      expect(
        toolbar().getByRole('button', { name, exact: true }).elements()
      ).toHaveLength(1)
    for (const name of ['Previous page', 'Next page', 'Zoom out', 'Zoom in'])
      expect(
        statusBar().getByRole('button', { name, exact: true }).elements()
      ).toHaveLength(1)
    expect(statusBar().getByRole('combobox', { name: 'Zoom' }).elements()).toHaveLength(1)
    expect(statusBar().getByRole('spinbutton', { name: 'Page' }).elements()).toHaveLength(
      1
    )
    // Icons are decoration: the button's name comes from its label.
    for (const bar of [toolbar(), statusBar()])
      expect(
        bar.element().querySelectorAll('svg:not([aria-hidden="true"])')
      ).toHaveLength(0)
    // Without children a button shows its icon: an SVG drawn from path elements.
    const icon = toolbar()
      .getByRole('button', { name: 'Undo', exact: true })
      .element().firstElementChild
    expect(icon).toBeInstanceOf(SVGSVGElement)
    expect(icon!.children.length).toBeGreaterThan(0)
    for (const child of icon!.children) expect(child).toBeInstanceOf(SVGPathElement)
  })

  // React: 'zoom controls change the scale and the select reflects it'
  it('zoom controls change the scale and the select reflects it', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q(`${FIRST} canvas`)
    const select = zoomSelect()
    await expect.element(select).toHaveTextContent('100%')
    await choose('200%')
    await expect.poll(cssOf(FIRST, 'width')).toBe('1224px')
    await browserPage.getByRole('button', { name: 'Zoom out' }).click()
    // 2 x 0.8: 979.2px, which layout stores to 1/64 px.
    await expect
      .poll(() => document.querySelector(FIRST)!.getBoundingClientRect().width)
      .toBeCloseTo(612 * 1.6, 1)
    await expect.element(select).toHaveTextContent('160%')
    await browserPage.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(cssOf(FIRST, 'width')).toBe('1224px')
    await expect.element(select).toHaveTextContent('200%')
    await choose('Fit width')
    await expect.element(select).toHaveTextContent('Fit width')
  })

  // React: 'the zoom select opens from the keyboard'
  it('the zoom select opens from the keyboard', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q(`${FIRST} canvas`)
    const select = zoomSelect()
    ;(select.element() as HTMLElement).focus()
    await userEvent.keyboard('{Enter}')
    await expect
      .element(browserPage.getByRole('option', { name: '100%' }))
      .toHaveAttribute('data-highlighted')
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')
    await expect.element(select).toHaveTextContent('125%')
    await expect.poll(focused).toBe(select.element())
  })

  // React: 'previous and next page buttons move one page and stop at the ends'
  it('previous and next page buttons move one page and stop at the ends', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
    const prev = browserPage.getByRole('button', { name: 'Previous page' })
    const next = browserPage.getByRole('button', { name: 'Next page' })
    const input = browserPage.getByRole('spinbutton', { name: 'Page' })
    await expect.element(prev).toBeDisabled()
    await next.click()
    await expect.element(input).toHaveValue(2)
    await next.click()
    await expect.element(input).toHaveValue(3)
    await expect.element(next).toBeDisabled()
    await prev.click()
    await expect.element(input).toHaveValue(2)
  })

  // React: 'a host onClick on the zoom button runs and the zoom still changes'
  it('a host onclick on the zoom button runs, the zoom still changes, and the toolbar renders through child', async () => {
    let clicks = 0
    await render(ZoomClickHarness, {
      src: fixtureUrl('text-simple'),
      assets,
      onHostClick: () => (clicks += 1),
    })
    await expect.poll(cssOf(FIRST, 'width')).toBe('612px')
    const nav = await q('nav.host-toolbar[data-ink-toolbar]')
    expect(nav.getAttribute('role')).toBe('toolbar')
    await browserPage.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(() => clicks).toBe(1)
    await expect.poll(cssOf(FIRST, 'width')).not.toBe('612px')
  })

  // React: 'page input navigates and the count shows the total'
  it('page input navigates and the count shows the total', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
    await expect
      .poll(() => document.querySelector('[data-ink-page-count]')?.textContent)
      .toBe('of 3')
    // A number input's value is a number to the matcher.
    const input = browserPage.getByRole('spinbutton', { name: 'Page' })
    await expect.element(input).toHaveValue(1)
    await input.fill('3')
    await userEvent.keyboard('{Enter}')
    await expect.poll(scrollTopOf(SCROLL)).toBeGreaterThan(1500)
    await expect.element(input).toHaveValue(3)
    // Out of range: the input goes back to the current page and nothing moves.
    await input.fill('9')
    await userEvent.keyboard('{Enter}')
    await expect.element(input).toHaveValue(3)
  })

  // No React counterpart as a test; the React input replaces its draft the same way.
  it('an uncommitted page draft gives way when the page changes from outside', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
    const input = browserPage.getByRole('spinbutton', { name: 'Page' })
    await expect.element(input).toHaveValue(1)
    // Typed, with no Enter and no blur: a draft the viewport has not been asked to follow.
    const el = input.element() as HTMLInputElement
    el.focus()
    el.select()
    await userEvent.keyboard('3')
    await expect.element(input).toHaveValue(3)
    await sleep(100)
    expect(scrollTopOf(SCROLL)()).toBe(0)
    expect(focused()).toBe(el)

    // The reader scrolls to page 2 instead (zoom 1: 16 + 792 + 16 is the top of its box).
    document.querySelector<HTMLElement>(SCROLL)!.scrollTop = 824
    await expect.element(input).toHaveValue(2)
    // Nothing committed the draft on the way: the viewport is where the reader put it.
    expect(scrollTopOf(SCROLL)()).toBe(824)
    expect(focused()).toBe(el)
  })

  // React: 'toolbar is keyboard operable'
  it('toolbar is keyboard operable', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
    ;(await q(toolButton('select-text'))).focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect.poll(focused).toBe(document.querySelector(toolButton('select')))
    await userEvent.keyboard('{Enter}')
    await expect.poll(attr(toolButton('select'), 'aria-pressed')).toBe('true')
    await expect.poll(attr(SCROLL, 'data-ink-tool')).toBe('select')
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.keyboard('{ArrowRight}')
    await expect.poll(focused).toBe(document.querySelector(toolButton('redact-area')))
    await userEvent.keyboard('[Space]')
    await expect.poll(attr(toolButton('redact-area'), 'aria-pressed')).toBe('true')
    await expect.poll(attr(SCROLL, 'data-ink-tool')).toBe('redact-area')
    await userEvent.keyboard('{ArrowLeft}')
    await expect.poll(focused).toBe(document.querySelector(toolButton('highlight')))
  })

  // React: 'blurring an untouched page input does not move the viewport'
  it('blurring an untouched page input does not move the viewport', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
    const input = browserPage.getByRole('spinbutton', { name: 'Page' })
    await input.fill('2')
    await userEvent.keyboard('{Enter}')
    await expect.element(input).toHaveValue(2)
    await expect.poll(scrollTopOf(SCROLL)).toBeGreaterThan(500)
    document.querySelector<HTMLElement>(SCROLL)!.scrollTop += 200
    await expect.element(input).toHaveValue(2)
    const before = scrollTopOf(SCROLL)()
    ;(input.element() as HTMLInputElement).focus()
    // Zoom out would rescale the scroll position; clicking a non-zooming control isolates the blur.
    await browserPage.elementLocator(await q(toolButton('select'))).click()
    await expect.poll(attr(toolButton('select'), 'aria-pressed')).toBe('true')
    expect(scrollTopOf(SCROLL)()).toBe(before)
  })

  // React: 'stepping the page input with the arrow keys moves the viewport'
  it('stepping the page input with the arrow keys moves the viewport', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
    const input = browserPage.getByRole('spinbutton', { name: 'Page' })
    ;(input.element() as HTMLInputElement).focus()
    // A step commits through the native change event, with no Enter and no blur.
    await userEvent.keyboard('{ArrowUp}')
    await expect.element(input).toHaveValue(2)
    await expect.poll(scrollTopOf(SCROLL)).toBeGreaterThan(500)
    await userEvent.keyboard('{ArrowDown}')
    await expect.element(input).toHaveValue(1)
    await expect.poll(scrollTopOf(SCROLL)).toBe(0)
  })

  // Vue: 'undo and redo follow the history; the separator divides the toolbar'
  it('undo and redo follow the history; the separator divides the toolbar', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
    const separator = toolbar().getByRole('separator')
    await expect.element(separator).toHaveAttribute('aria-orientation', 'vertical')
    const undo = toolbar().getByRole('button', { name: 'Undo', exact: true })
    const redo = toolbar().getByRole('button', { name: 'Redo', exact: true })
    const probe = browserPage.getByTestId('probe')
    await expect.element(undo).toBeDisabled()
    await expect.element(redo).toBeDisabled()
    await browserPage.getByTestId('add').click()
    await expect.element(undo).toBeEnabled()
    await undo.click()
    await expect.element(probe).toHaveAttribute('data-annotations', '0')
    await expect.element(undo).toBeDisabled()
    await expect.element(redo).toBeEnabled()
    await redo.click()
    await expect.element(probe).toHaveAttribute('data-annotations', '1')
    await expect.element(redo).toBeDisabled()
  })

  describe('line style menu', () => {
    const trigger = () => browserPage.getByRole('button', { name: 'Line style' })
    const menu = () => browserPage.getByRole('menu', { name: 'Line style' })
    const item = (name: string) =>
      menu().getByRole('menuitemradio', { name, exact: true })
    const probe = (name: string) => attr('[data-testid="probe"]', name)
    const click = (id: string) => browserPage.getByTestId(id).click()

    it('line style menu sets width on the selected line', async () => {
      await render(LineStyleHarness, { src: fixtureUrl('text-simple'), assets })
      await q('.ink-page canvas')
      await expect.element(trigger()).toBeDisabled()
      await click('add-line-1')
      await click('select-all')
      await expect.element(trigger()).toBeEnabled()
      await trigger().click()
      await expect.element(item('1 pt')).toHaveAttribute('aria-checked', 'true')
      await item('4 pt').click()
      await expect.poll(probe('data-widths')).toBe('4')
      await expect.element(item('4 pt')).toHaveAttribute('aria-checked', 'true')
      await item('Dashed').click()
      await expect.poll(probe('data-dashes')).toBe('3/3')
      await item('Arrowhead at end').click()
      await expect.poll(probe('data-tails')).toBe('openArrow')
      await item('Solid').click()
      await expect.poll(probe('data-dashes')).toBe('-')
    })

    it('arrowheads section is disabled for a selected square', async () => {
      await render(LineStyleHarness, { src: fixtureUrl('text-simple'), assets })
      await q('.ink-page canvas')
      await click('add-square')
      await click('select-all')
      await trigger().click()
      const arrows = menu().getByRole('group', { name: 'Arrowheads' })
      await expect.element(arrows).toHaveAttribute('aria-disabled', 'true')
      await expect.element(item('Arrowhead at end')).toBeDisabled()
      await expect.element(item('2 pt')).toBeEnabled()
      await expect.element(item('Dashed')).toBeEnabled()
    })

    it('shows mixed for two lines with different widths', async () => {
      await render(LineStyleHarness, { src: fixtureUrl('text-simple'), assets })
      await q('.ink-page canvas')
      await click('add-line-1')
      await click('add-line-3')
      await click('select-all')
      await expect.element(trigger()).toHaveAttribute('data-mixed')
      await trigger().click()
      const weights = menu().getByRole('group', { name: 'Weight' }).element()
      expect(weights.querySelectorAll('[aria-checked="true"]')).toHaveLength(0)
      expect(weights.querySelectorAll('.ink-select-indicator')).toHaveLength(0)
      // The lines agree on pattern and endings, so those sections still show their choice.
      await expect.element(item('Solid')).toHaveAttribute('aria-checked', 'true')
      await item('2 pt').click()
      await expect.poll(attr('[data-ink-line-style-menu]', 'data-mixed')).toBeNull()
    })

    it('arrow keys move through the items, and Escape closes and returns focus', async () => {
      await render(LineStyleHarness, { src: fixtureUrl('text-simple'), assets })
      await q('.ink-page canvas')
      await click('add-line-3')
      await click('select-all')
      ;(trigger().element() as HTMLElement).focus()
      await userEvent.keyboard('{Enter}')
      await expect.poll(focused).toBe(item('3 pt').element())
      await userEvent.keyboard('{ArrowDown}')
      await expect.poll(focused).toBe(item('4 pt').element())
      await userEvent.keyboard('{Home}')
      await expect.poll(focused).toBe(item('0.5 pt').element())
      await userEvent.keyboard('{Escape}')
      await expect.poll(() => menu().elements().length).toBe(0)
      await expect.poll(focused).toBe(trigger().element())
    })

    it('ArrowDown on the trigger opens the menu on the first item', async () => {
      await render(LineStyleHarness, { src: fixtureUrl('text-simple'), assets })
      await q('.ink-page canvas')
      await click('add-line-3')
      await click('select-all')
      ;(trigger().element() as HTMLElement).focus()
      await userEvent.keyboard('{ArrowDown}')
      await expect.poll(focused).toBe(item('0.5 pt').element())
    })

    it('closes when the selection clears and the control disables', async () => {
      await render(LineStyleHarness, { src: fixtureUrl('text-simple'), assets })
      await q('.ink-page canvas')
      await click('add-line-3')
      await click('select-all')
      await trigger().click()
      await expect.element(menu()).toBeVisible()
      ;(document.querySelector('[data-testid="select-none"]') as HTMLElement).click()
      await expect.poll(() => menu().elements().length).toBe(0)
      await expect.element(trigger()).toBeDisabled()
    })
  })
})
