import { createMemorySignatureStore, type SignatureTemplate } from '@inkbar/core'
import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { describe, expect, it } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import { attr, cssOf, focused, q, scrollTopOf, sleep } from './dom.js'
import ColorMenuHarness from './harness/ColorMenuHarness.svelte'
import LineStyleHarness from './harness/LineStyleHarness.svelte'
import SignatureHarness from './harness/SignatureHarness.svelte'
import TextStyleHarness from './harness/TextStyleHarness.svelte'
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

  // React: 'the text tool button is named Text, shows its icon and picks the text box tool'
  it('the text tool button is named Text, shows its icon and picks the text box tool', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
    const text = toolbar().getByRole('button', { name: 'Text', exact: true })
    await expect.element(text).toHaveAttribute('data-tool', 'freetext')
    expect(text.element().querySelectorAll('svg')).toHaveLength(1)
    await text.click()
    await expect.element(text).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(attr(SCROLL, 'data-ink-tool')).toBe('freetext')
  })

  // React: 'the sketch tool button is named Sketch, shows its icon and picks the sketch tool'
  it('the sketch tool button is named Sketch, shows its icon and picks the sketch tool', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
    const sketch = toolbar().getByRole('button', { name: 'Sketch', exact: true })
    await expect.element(sketch).toHaveAttribute('data-tool', 'sketch')
    expect(sketch.element().querySelectorAll('svg')).toHaveLength(1)
    await sketch.click()
    await expect.element(sketch).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(attr(SCROLL, 'data-ink-tool')).toBe('sketch')
  })

  // React: 'a controlled host undoes a sketched circle in two steps: the stroke, then nothing'
  it('a controlled host undoes a sketched circle in two steps: the stroke, then nothing', async () => {
    await render(ToolbarHarness, {
      src: fixtureUrl('text-simple'),
      assets,
      controlled: true,
    })
    await q('.ink-page canvas')
    await toolbar().getByRole('button', { name: 'Sketch', exact: true }).click()
    const scroll = await q(SCROLL)
    const box = (await q(FIRST)).getBoundingClientRect()
    const at = (i: number) => {
      const t = (i / 40) * Math.PI * 2
      return {
        clientX: box.left + 150 + 50 * Math.cos(t),
        clientY: box.top + 110 + 45 * Math.sin(t),
      }
    }
    const fire = (type: string, i: number) =>
      scroll.dispatchEvent(
        new PointerEvent(type, {
          ...at(i),
          bubbles: true,
          pointerId: 1,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          isPrimary: true,
        })
      )
    fire('pointerdown', 0)
    for (let i = 1; i <= 42; i++) fire('pointermove', i)
    fire('pointerup', 42)
    const count = (type: string) => () =>
      document.querySelectorAll(
        `${FIRST} .ink-annotation[data-type="${type}"][data-source="session"]`
      ).length
    await expect.poll(count('circle')).toBe(1)
    await expect.poll(count('ink')).toBe(0)
    const undo = toolbar().getByRole('button', { name: 'Undo', exact: true })
    await undo.click()
    await expect.poll(count('ink')).toBe(1)
    await expect.poll(count('circle')).toBe(0)
    await undo.click()
    await expect.poll(count('ink')).toBe(0)
    await expect.poll(count('circle')).toBe(0)
  })

  // React: 'the draw tool button is named Draw, shows its icon and picks the draw tool'
  it('the draw tool button is named Draw, shows its icon and picks the draw tool', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
    const draw = toolbar().getByRole('button', { name: 'Draw', exact: true })
    await expect.element(draw).toHaveAttribute('data-tool', 'draw')
    expect(draw.element().querySelectorAll('svg')).toHaveLength(1)
    await draw.click()
    await expect.element(draw).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(attr(SCROLL, 'data-ink-tool')).toBe('draw')
  })

  // React: 'every toolbar control has an accessible name'
  it('every toolbar control has an accessible name', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
    for (const name of [
      'Select text',
      'Rectangle select',
      'Highlight',
      'Choose highlight',
      'Mark for redaction',
      'Add note',
      'Text',
      'Line style',
      'Text style',
      'Border colour',
      'Fill colour',
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
    await expect.poll(focused).toBe(document.querySelector(toolButton('redact-area')))
    await userEvent.keyboard('[Space]')
    await expect.poll(attr(toolButton('redact-area'), 'aria-pressed')).toBe('true')
    await expect.poll(attr(SCROLL, 'data-ink-tool')).toBe('redact-area')
    await userEvent.keyboard('{ArrowLeft}')
    await userEvent.keyboard('{ArrowLeft}')
    await expect.poll(focused).toBe(document.querySelector(toolButton('select-text')))
    // The highlight menu's two parts are toolbar stops of their own.
    await userEvent.keyboard('{ArrowLeft}')
    await expect
      .poll(focused)
      .toBe(browserPage.getByRole('button', { name: 'Choose highlight' }).element())
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

  describe('colour menus', () => {
    const trigger = (name: string) => browserPage.getByRole('button', { name })
    const menu = (name: string) => browserPage.getByRole('menu', { name })
    const swatch = (menuName: string, name: string) =>
      menu(menuName).getByRole('menuitemradio', { name, exact: true })
    const probe = (name: string) => attr('[data-testid="probe"]', name)
    const click = (id: string) => browserPage.getByTestId(id).click()
    const start = async (id: 'add-square' | 'add-line') => {
      await render(ColorMenuHarness, { src: fixtureUrl('text-simple'), assets })
      await q('.ink-page canvas')
      await click(id)
      await click('select-all')
    }

    it('border menu sets color on a selected square', async () => {
      await render(ColorMenuHarness, { src: fixtureUrl('text-simple'), assets })
      await q('.ink-page canvas')
      await expect.element(trigger('Border colour')).toBeDisabled()
      await click('add-square')
      await click('select-all')
      await expect.element(trigger('Border colour')).toBeEnabled()
      const dot = '[data-ink-color-menu="border"] [data-ink-swatch]'
      await expect.poll(attr(dot, 'data-color')).toBe('#FF3B30')
      await trigger('Border colour').click()
      await expect
        .element(swatch('Border colour', '#FF3B30'))
        .toHaveAttribute('aria-checked', 'true')
      expect(
        menu('Border colour').getByRole('menuitemradio', { name: 'No fill' }).elements()
      ).toHaveLength(0)
      await swatch('Border colour', '#007AFF').click()
      await expect.poll(probe('data-colors')).toBe('#007AFF')
      await expect
        .element(swatch('Border colour', '#007AFF'))
        .toHaveAttribute('aria-checked', 'true')
      await expect.poll(attr(dot, 'data-color')).toBe('#007AFF')
    })

    it('fill menu has No fill and it clears interiorColor', async () => {
      await start('add-square')
      await trigger('Fill colour').click()
      await expect
        .element(swatch('Fill colour', '#34C759'))
        .toHaveAttribute('aria-checked', 'true')
      await swatch('Fill colour', 'No fill').click()
      await expect.poll(probe('data-fills')).toBe('-')
      await expect
        .element(swatch('Fill colour', 'No fill'))
        .toHaveAttribute('aria-checked', 'true')
      await expect
        .poll(attr('[data-ink-color-menu="fill"] [data-ink-swatch]', 'data-kind'))
        .toBe('none')
    })

    const picker = () =>
      document.querySelector<HTMLInputElement>('input[data-ink-color-input="border"]')!

    it('Custom opens a native color input and applies its value', async () => {
      await start('add-square')
      await trigger('Border colour').click()
      const input = picker()
      expect(input.type).toBe('color')
      expect(input.getAttribute('aria-label')).toBe('Custom colour')
      let opened = 0
      input.addEventListener('click', () => opened++)
      await menu('Border colour').getByRole('menuitem', { name: 'Custom…' }).click()
      expect(opened).toBe(1)
      input.value = '#123abc'
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await expect.poll(probe('data-colors')).toBe('#123ABC')
    })

    it('Custom: the input survives the menu closing while the picker is open', async () => {
      await start('add-square')
      await trigger('Border colour').click()
      await menu('Border colour').getByRole('menuitem', { name: 'Custom…' }).click()
      const input = picker()
      await trigger('Border colour').click()
      await expect.poll(() => menu('Border colour').elements().length).toBe(0)
      expect(input.isConnected).toBe(true)
      input.value = '#abcdef'
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await expect.poll(probe('data-colors')).toBe('#ABCDEF')
    })

    it('a mixed selection shows a mixed trigger', async () => {
      await render(ColorMenuHarness, { src: fixtureUrl('text-simple'), assets })
      await q('.ink-page canvas')
      await click('add-square')
      await click('add-square-2')
      await click('select-all')
      for (const kind of ['border', 'fill']) {
        const sel = `[data-ink-color-menu="${kind}"]`
        await expect.poll(attr(sel, 'data-mixed')).toBe('')
        await expect.poll(attr(`${sel} [data-ink-swatch]`, 'data-kind')).toBe('mixed')
      }
    })

    it('fill menu is disabled when only a line is selected', async () => {
      await start('add-line')
      await expect.element(trigger('Border colour')).toBeEnabled()
      await expect.element(trigger('Fill colour')).toBeDisabled()
      // A line has no text.
      await expect.element(trigger('Text colour')).toBeDisabled()
    })

    it('keyboard: arrows move between swatches, Enter applies, Escape returns focus', async () => {
      await start('add-square')
      ;(trigger('Fill colour').element() as HTMLElement).focus()
      await userEvent.keyboard('{ArrowDown}')
      const at = (name: string) => swatch('Fill colour', name).element()
      await expect.poll(focused).toBe(at('No fill'))
      await userEvent.keyboard('{ArrowDown}')
      await expect.poll(focused).toBe(at('#FF3B30'))
      await userEvent.keyboard('{ArrowRight}')
      await expect.poll(focused).toBe(at('#FF9500'))
      await userEvent.keyboard('{ArrowDown}')
      await expect.poll(focused).toBe(at('#E8E8E8'))
      await userEvent.keyboard('{ArrowLeft}')
      await expect.poll(focused).toBe(at('#FFFFFF'))
      await userEvent.keyboard('{ArrowUp}')
      await expect.poll(focused).toBe(at('#FF3B30'))
      await userEvent.keyboard('{ArrowRight}{Enter}')
      await expect.poll(probe('data-fills')).toBe('#FF9500')
      await userEvent.keyboard('{Escape}')
      await expect.poll(() => menu('Fill colour').elements().length).toBe(0)
      await expect.poll(focused).toBe(trigger('Fill colour').element())
    })
  })
})

describe('shape menu', () => {
  const main = '[data-ink-shape-button]'
  const chevron = () => browserPage.getByRole('button', { name: 'Choose shape' })
  const menu = () => browserPage.getByRole('menu', { name: 'Shapes' })
  const kind = (name: string) => menu().getByRole('menuitemradio', { name, exact: true })
  const probe = (name: string) => attr('[data-testid="probe"]', name)
  const start = async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
  }

  it('the main button activates shape with the current kind', async () => {
    await start()
    await expect.poll(attr(main, 'aria-pressed')).toBe('false')
    await browserPage.elementLocator(await q(main)).click()
    await expect.poll(attr(main, 'aria-pressed')).toBe('true')
    expect(attr(main, 'data-kind')()).toBe('rectangle')
    await expect.poll(probe('data-tool')).toBe('shape')
  })

  it('choosing ellipse activates shape with kind ellipse', async () => {
    await start()
    await chevron().click()
    await expect.element(kind('Rectangle')).toHaveAttribute('aria-checked', 'true')
    expect(menu().getByRole('menuitemradio', { name: 'Loupe' }).elements()).toHaveLength(
      0
    )
    await kind('Ellipse').click()
    await expect.poll(probe('data-tool')).toBe('shape')
    await expect.poll(attr(main, 'data-kind')).toBe('ellipse')
    await expect.poll(() => menu().elements().length).toBe(0)
    await expect.poll(focused).toBe(chevron().element())
  })

  it('the trigger icon follows the current kind', async () => {
    await start()
    const before = (await q(main)).innerHTML
    expect(attr(main, 'aria-label')()).toBe('Shape: Rectangle')
    await chevron().click()
    await kind('Star').click()
    await expect.poll(attr(main, 'aria-label')).toBe('Shape: Star')
    expect((await q(main)).innerHTML).not.toBe(before)
    await chevron().click()
    await kind('Speech bubble').click()
    await expect.poll(attr(main, 'aria-label')).toBe('Shape: Speech bubble')
    expect(attr(main, 'data-kind')()).toBe('bubble')
  })

  it('keyboard: ArrowDown opens on the first kind, arrows move through the grid, Escape returns focus', async () => {
    await start()
    ;(chevron().element() as HTMLElement).focus()
    await userEvent.keyboard('{ArrowDown}')
    await expect.poll(focused).toBe(kind('Line').element())
    await userEvent.keyboard('{ArrowRight}')
    await expect.poll(focused).toBe(kind('Arrow').element())
    await userEvent.keyboard('{ArrowDown}')
    await expect.poll(focused).toBe(kind('Rounded rectangle').element())
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => menu().elements().length).toBe(0)
    await expect.poll(focused).toBe(chevron().element())
  })
})

describe('highlight menu', () => {
  const main = '[data-ink-highlight-button]'
  const chevron = () => browserPage.getByRole('button', { name: 'Choose highlight' })
  const menu = () => browserPage.getByRole('menu', { name: 'Highlights' })
  const kind = (name: string) => menu().getByRole('menuitemradio', { name, exact: true })
  const colour = () => menu().getByRole('menuitem', { name: 'Highlight colour' })
  const probe = (name: string) => attr('[data-testid="probe"]', name)
  type Doc = {
    annotations: {
      add(input: unknown): { id: string }
      select(ids: string[]): void
      get(id: string): { color: string } | undefined
    }
  }
  const doc = () =>
    (document.querySelector('[data-ink-root]') as HTMLElement & { __inkDocument: Doc })
      .__inkDocument
  const start = async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
  }

  it('the main button activates highlight with the current kind', async () => {
    await start()
    expect(attr(main, 'aria-label')()).toBe('Highlight')
    await expect.poll(attr(main, 'aria-pressed')).toBe('false')
    await browserPage.elementLocator(await q(main)).click()
    await expect.poll(attr(main, 'aria-pressed')).toBe('true')
    expect(attr(main, 'data-kind')()).toBe('highlight')
    await expect.poll(probe('data-tool')).toBe('highlight')
  })

  it('choosing underline activates highlight with kind underline', async () => {
    await start()
    const before = (await q(main)).innerHTML
    await chevron().click()
    await expect
      .poll(() =>
        menu()
          .getByRole('menuitemradio')
          .elements()
          .map((b) => b.textContent?.trim())
      )
      .toEqual(['Highlight', 'Underline', 'Strikethrough', 'Squiggly underline'])
    await expect.element(kind('Highlight')).toHaveAttribute('aria-checked', 'true')
    await kind('Underline').click()
    await expect.poll(probe('data-tool')).toBe('highlight')
    await expect.poll(attr(main, 'data-kind')).toBe('underline')
    expect(attr(main, 'aria-label')()).toBe('Underline')
    expect((await q(main)).innerHTML).not.toBe(before)
    await expect.poll(() => menu().elements().length).toBe(0)
    await expect.poll(focused).toBe(chevron().element())
  })

  it('the colour works under any tool and recolours selected markup', async () => {
    await start()
    await expect.poll(probe('data-tool')).toBe('select-text')
    const { id } = doc().annotations.add({
      type: 'highlight',
      page: 0,
      quads: [
        {
          p1: { x: 72, y: 712 },
          p2: { x: 200, y: 712 },
          p3: { x: 72, y: 700 },
          p4: { x: 200, y: 700 },
        },
      ],
    })
    doc().annotations.select([id])
    await chevron().click()
    await expect.element(colour()).toBeEnabled()
    await colour().click()
    const swatches = () => browserPage.getByRole('menu', { name: 'Highlight colour' })
    const swatch = swatches().getByRole('menuitemradio').nth(3)
    await swatch.click()
    const picked = swatch.element().getAttribute('aria-label')
    // The nested menu keeps the highlight menu open.
    await expect.element(menu()).toBeVisible()
    await expect.poll(() => doc().annotations.get(id)?.color).toBe(picked)
    await expect
      .element(colour().element().querySelector<HTMLElement>('[data-ink-swatch]'))
      .toHaveAttribute('data-color', picked!)
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => swatches().elements().length).toBe(0)
    await expect.element(menu()).toBeVisible()
    await expect.poll(focused).toBe(colour().element())
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => menu().elements().length).toBe(0)
  })

  it('keyboard: ArrowDown opens on the first kind, arrows reach the colour, Escape returns focus', async () => {
    await start()
    ;(chevron().element() as HTMLElement).focus()
    await userEvent.keyboard('{ArrowDown}')
    await expect.poll(focused).toBe(kind('Highlight').element())
    await userEvent.keyboard('{End}')
    await expect.poll(focused).toBe(colour().element())
    await userEvent.keyboard('{ArrowDown}')
    await expect.poll(focused).toBe(kind('Highlight').element())
    expect(
      browserPage.getByRole('menu', { name: 'Highlight colour' }).elements()
    ).toHaveLength(0)
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => menu().elements().length).toBe(0)
    await expect.poll(focused).toBe(chevron().element())
  })
})

describe('text style menu', () => {
  const trigger = () => browserPage.getByRole('button', { name: 'Text style' })
  const menu = () => browserPage.getByRole('dialog', { name: 'Text style' })
  const click = (id: string) => browserPage.getByTestId(id).click()
  const style = (): Record<string, unknown> =>
    JSON.parse(attr('[data-testid="probe"]', 'data-style')() || '{}')
  const start = async () => {
    await render(TextStyleHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
  }
  const selectBox = async () => {
    await click('add-box')
    await click('select-all')
  }

  it('bold toggle sets defaultStyle.fontWeight on the selected text box', async () => {
    await start()
    await selectBox()
    await trigger().click()
    const bold = menu().getByRole('button', { name: 'Bold', exact: true })
    await expect.element(bold).toHaveAttribute('aria-pressed', 'false')
    await bold.click()
    await expect.element(bold).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => style().fontWeight).toBe('bold')
    await bold.click()
    await expect.poll(() => 'fontWeight' in style()).toBe(false)
    await menu().getByRole('radio', { name: 'Align centre' }).click()
    await userEvent.selectOptions(menu().getByRole('combobox', { name: 'Font' }), 'Times')
    await expect.poll(style).toMatchObject({ textAlign: 'center', fontFamily: 'Times' })
  })

  it('size stepper clamps to 1..144', async () => {
    await start()
    await selectBox()
    await trigger().click()
    const size = menu().getByRole('spinbutton', { name: 'Font size' })
    await expect.element(size).toHaveValue(12)
    await size.fill('500')
    await userEvent.keyboard('{Enter}')
    await expect.element(size).toHaveValue(144)
    await expect.poll(() => style().fontSize).toBe(144)
    await menu().getByRole('button', { name: 'Increase font size' }).click()
    await expect.element(size).toHaveValue(144)
    await size.fill('0')
    await userEvent.keyboard('{Enter}')
    await expect.element(size).toHaveValue(1)
    await menu().getByRole('button', { name: 'Decrease font size' }).click()
    await expect.element(size).toHaveValue(1)
    await menu().getByRole('button', { name: 'Increase font size' }).click()
    await expect.poll(() => style().fontSize).toBe(2)
  })

  it('menu disabled with only a square selected and the select tool active', async () => {
    await start()
    await click('tool-select')
    await click('add-square')
    await click('select-all')
    await expect.element(trigger()).toBeDisabled()
  })

  it('with the text tool active and nothing selected, changes become the text group default for the next box', async () => {
    await start()
    await click('tool-freetext')
    await click('select-none')
    await expect.element(trigger()).toBeEnabled()
    await trigger().click()
    await menu().getByRole('button', { name: 'Italic', exact: true }).click()
    await menu().getByRole('radio', { name: 'Align right' }).click()
    await expect
      .poll(() => JSON.parse(attr('[data-testid="probe"]', 'data-group')() ?? '{}'))
      .toMatchObject({ fontStyle: 'italic', textAlign: 'right' })
  })

  it('nests the text colour menu, and Escape closes and returns focus', async () => {
    await start()
    await selectBox()
    ;(trigger().element() as HTMLElement).focus()
    await userEvent.keyboard('{ArrowDown}')
    await expect
      .poll(focused)
      .toBe(menu().getByRole('combobox', { name: 'Font' }).element())
    await menu().getByRole('button', { name: 'Text colour' }).click()
    await browserPage
      .getByRole('menu', { name: 'Text colour' })
      .getByRole('menuitemradio', { name: '#FF3B30', exact: true })
      .click()
    await expect.poll(() => style().color).toBe('#FF3B30')
    await expect.element(menu()).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect
      .poll(
        () => browserPage.getByRole('menu', { name: 'Text colour' }).elements().length
      )
      .toBe(0)
    await expect.element(menu()).toBeVisible()
    await expect
      .poll(focused)
      .toBe(menu().getByRole('button', { name: 'Text colour' }).element())
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => menu().elements().length).toBe(0)
    await expect.poll(focused).toBe(trigger().element())
  })

  it('the font select offers the host fonts', async () => {
    await render(TextStyleHarness, {
      src: fixtureUrl('text-simple'),
      assets,
      fonts: ['Georgia', 'Verdana'],
    })
    await q('.ink-page canvas')
    await selectBox()
    await trigger().click()
    const font = menu().getByRole('combobox', { name: 'Font' })
    // The selected box uses Helvetica, which the host list lacks: it stays selectable.
    await expect
      .poll(() => [...(font.element() as HTMLSelectElement).options].map((o) => o.value))
      .toEqual(['Georgia', 'Verdana', 'Helvetica'])
    await userEvent.selectOptions(font, 'Verdana')
    await expect.poll(() => style().fontFamily).toBe('Verdana')
  })
})

describe('signature menu', () => {
  const INK: SignatureTemplate = {
    id: 'sig-a',
    kind: 'ink',
    inklist: [
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    ],
    aspect: 3,
  }
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAABCAYAAAAb4BS0AAAADklEQVR4nGP4z8DwH4YBJuYF+2EsXwgAAAAASUVORK5CYII='
  const IMAGE: SignatureTemplate = {
    id: 'sig-b',
    kind: 'image',
    imagedata: PNG,
    aspect: 3,
  }
  const main = '[data-ink-signature-button]'
  const chevron = () => browserPage.getByRole('button', { name: 'Choose signature' })
  const menu = () => browserPage.getByRole('menu', { name: 'Signatures' })
  const dialog = () => browserPage.getByRole('dialog', { name: 'Create signature' })
  const probe = (name: string) => attr('[data-testid="probe"]', name)
  const start = async (templates: SignatureTemplate[] = [], fonts?: string[]) => {
    const store = createMemorySignatureStore(templates)
    await render(SignatureHarness, {
      src: fixtureUrl('text-simple'),
      assets,
      store,
      ...(fonts ? { fonts } : {}),
    })
    await q('.ink-page canvas')
    return store
  }
  const createSignature = async () => {
    await chevron().click()
    await menu().getByRole('menuitem', { name: 'Create signature' }).click()
    await expect.element(dialog()).toBeVisible()
  }

  it('create a drawn signature, it appears in the menu and is selected', async () => {
    const store = await start()
    expect(attr(main, 'aria-label')()).toBe('Sign')
    await chevron().click()
    await expect.element(menu()).toBeVisible()
    expect(menu().getByRole('menuitemradio').elements()).toHaveLength(0)
    await menu().getByRole('menuitem', { name: 'Create signature' }).click()
    await expect.element(dialog()).toBeVisible()
    await expect.poll(() => menu().elements().length).toBe(0)
    const save = dialog().getByRole('button', { name: 'Save' })
    await expect.element(save).toBeDisabled()
    const pad = await q('[data-ink-signature-pad]')
    const r = pad.getBoundingClientRect()
    const at = (type: string, x: number, y: number) =>
      pad.dispatchEvent(
        new PointerEvent(type, {
          clientX: r.left + x,
          clientY: r.top + y,
          bubbles: true,
          pointerId: 3,
          buttons: type === 'pointerup' ? 0 : 1,
          isPrimary: true,
        })
      )
    at('pointerdown', 20, 60)
    at('pointermove', 80, 20)
    at('pointermove', 160, 70)
    at('pointerup', 160, 70)
    await expect.element(save).toBeEnabled()
    await save.click()
    await expect.poll(() => dialog().elements().length).toBe(0)
    const [saved] = await store.list()
    expect(saved?.kind).toBe('ink')
    await expect
      .poll(attr('[data-testid="signature-options"]', 'data-template'))
      .toBe(saved!.id)
    await expect.poll(probe('data-tool')).toBe('signature')
    await expect.poll(attr(main, 'aria-pressed')).toBe('true')
    await expect
      .poll(() => document.activeElement === document.querySelector(main))
      .toBe(true)
    await chevron().click()
    const item = menu().getByRole('menuitemradio', { name: 'Signature 1' })
    await expect.element(item).toHaveAttribute('aria-checked', 'true')
    expect(item.element().querySelector('svg path')).not.toBeNull()
  })

  it('remove deletes from the store', async () => {
    const store = await start([INK, IMAGE])
    await chevron().click()
    await expect.poll(() => menu().getByRole('menuitemradio').elements().length).toBe(2)
    expect(
      menu()
        .getByRole('menuitemradio', { name: 'Signature 2' })
        .element()
        .querySelector('img')
        ?.getAttribute('src')
    ).toBe(PNG)
    await menu().getByRole('menuitem', { name: 'Remove signature 1' }).click()
    await expect
      .poll(async () => (await store.list()).map((t) => t.id))
      .toEqual(['sig-b'])
    await expect.poll(() => menu().getByRole('menuitemradio').elements().length).toBe(1)
    const left = menu().getByRole('menuitemradio').element()
    expect(left.getAttribute('data-key')).toBe('sig-b')
    await expect.poll(() => document.activeElement === left).toBe(true)
  })

  it('dialog traps focus and Escape closes', async () => {
    await start()
    await createSignature()
    const draw = dialog().getByRole('tab', { name: 'Draw' })
    const type = dialog().getByRole('tab', { name: 'Type' })
    await expect.poll(() => document.activeElement === draw.element()).toBe(true)
    await userEvent.keyboard('{ArrowRight}')
    await expect.poll(() => document.activeElement === type.element()).toBe(true)
    await expect.element(type).toHaveAttribute('aria-selected', 'true')
    // Save is disabled with no name, so Cancel is the last stop: Tab wraps both ways.
    const cancel = dialog().getByRole('button', { name: 'Cancel' })
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    await expect.poll(() => document.activeElement === cancel.element()).toBe(true)
    await userEvent.keyboard('{Tab}')
    await expect.poll(() => document.activeElement === type.element()).toBe(true)
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => dialog().elements().length).toBe(0)
    await expect
      .poll(() => document.activeElement === document.querySelector(main))
      .toBe(true)
  })

  it('the Type tab saves the name in a host font as an image template', async () => {
    const store = await start([], ['serif', 'cursive'])
    await createSignature()
    await dialog().getByRole('tab', { name: 'Type' }).click()
    await dialog().getByLabelText('Name').fill('Ada Lovelace')
    const fonts = dialog().getByRole('radio')
    await expect
      .poll(() => fonts.elements().map((f) => f.getAttribute('aria-label')))
      .toEqual(['serif', 'cursive'])
    await expect.poll(() => fonts.elements()[1]?.textContent?.trim()).toBe('Ada Lovelace')
    await fonts.nth(1).click()
    await expect.element(fonts.nth(1)).toHaveAttribute('aria-checked', 'true')
    await dialog().getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => dialog().elements().length).toBe(0)
    expect((await store.list()).map((t) => t.kind)).toEqual(['image'])
  })

  it('a save the store refuses shows an error and keeps the dialog open', async () => {
    const store = createMemorySignatureStore()
    store.save = () => Promise.reject(new Error('full'))
    await render(SignatureHarness, { src: fixtureUrl('text-simple'), assets, store })
    await q('.ink-page canvas')
    await createSignature()
    await dialog().getByRole('tab', { name: 'Type' }).click()
    await dialog().getByLabelText('Name').fill('Ada')
    await dialog().getByRole('button', { name: 'Save' }).click()
    const error = await q('[data-ink-signature-save-error]')
    expect(error.getAttribute('role')).toBe('alert')
    expect(error.textContent).toMatch(/could not be saved/)
    await expect.element(dialog()).toBeVisible()
    expect(await store.list()).toEqual([])
  })
})
