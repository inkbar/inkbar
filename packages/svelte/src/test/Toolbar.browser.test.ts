import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { describe, expect, it } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard'
import { attr, cssOf, focused, q, scrollTopOf } from './dom'
import ToolbarHarness from './harness/ToolbarHarness.svelte'
import ZoomClickHarness from './harness/ZoomClickHarness.svelte'

const assets = browserAssets()
guardConsole()

/** Toolbar buttons carry `data-tool`; scope to the toolbar so nothing else can match. */
const toolButton = (id: string) => `[data-ink-toolbar] [data-tool="${id}"]`
const FIRST = '.ink-page[data-page="0"]'
const SCROLL = '[data-ink-scroll]'
const toolbar = () => browserPage.getByRole('toolbar', { name: 'Document tools' })

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
    await expect.poll(attr(toolButton('view'), 'aria-pressed')).toBe('true')
    expect(attr(toolButton('view'), 'data-state')()).toBe('on')
    expect(attr(toolButton('highlight'), 'aria-pressed')()).toBe('false')
    expect(attr(toolButton('highlight'), 'data-state')()).toBe('off')
    await browserPage.elementLocator(await q(toolButton('highlight'))).click()
    await expect.poll(attr(toolButton('highlight'), 'aria-pressed')).toBe('true')
    expect(attr(toolButton('highlight'), 'data-state')()).toBe('on')
    expect(attr(toolButton('view'), 'aria-pressed')()).toBe('false')
    expect(tools).toEqual(['highlight'])
    await expect.poll(attr(SCROLL, 'data-ink-tool')).toBe('highlight')
  })

  // React: 'every toolbar control has an accessible name'
  it('every toolbar control has an accessible name', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
    for (const name of [
      'View',
      'Select',
      'Highlight',
      'Mark for redaction',
      'Add note',
      'Zoom out',
      'Zoom in',
    ])
      expect(
        toolbar().getByRole('button', { name, exact: true }).elements()
      ).toHaveLength(1)
    expect(toolbar().getByRole('combobox', { name: 'Zoom' }).elements()).toHaveLength(1)
    expect(toolbar().getByRole('spinbutton', { name: 'Page' }).elements()).toHaveLength(1)
    // Icons are decoration: the button's name comes from its label.
    expect(
      toolbar().element().querySelectorAll('svg:not([aria-hidden="true"])')
    ).toHaveLength(0)
  })

  // React: 'zoom controls change the scale and the select reflects it'
  it('zoom controls change the scale and the select reflects it', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q(`${FIRST} canvas`)
    const select = browserPage.getByRole('combobox', { name: 'Zoom' })
    await expect.element(select).toHaveValue('1')
    await select.selectOptions('2')
    await expect.poll(cssOf(FIRST, 'width')).toBe('1224px')
    await browserPage.getByRole('button', { name: 'Zoom out' }).click()
    // 2 x 0.8: 979.2px, which layout stores to 1/64 px.
    await expect
      .poll(() => document.querySelector(FIRST)!.getBoundingClientRect().width)
      .toBeCloseTo(612 * 1.6, 1)
    await expect
      .poll(() => (select.element() as HTMLSelectElement).selectedOptions[0]?.textContent)
      .toBe('160%')
    await browserPage.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(cssOf(FIRST, 'width')).toBe('1224px')
    await expect.element(select).toHaveValue('2')
    await select.selectOptions('fit-width')
    await expect.element(select).toHaveValue('fit-width')
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

  // React: 'toolbar is keyboard operable'
  it('toolbar is keyboard operable', async () => {
    await render(ToolbarHarness, { src: fixtureUrl('text-simple'), assets })
    await q('.ink-page canvas')
    ;(await q(toolButton('view'))).focus()
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
})
