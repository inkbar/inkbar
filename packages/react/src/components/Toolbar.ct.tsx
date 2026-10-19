import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-react'

import { guardConsole } from '../../playwright/console-guard'
import { LineStyleHarness } from '../../playwright/harness/LineStyleHarness'
import { ToolbarHarness } from '../../playwright/harness/ToolbarHarness'
import { ZoomClickHarness } from '../../playwright/harness/ZoomClickHarness'

import type { Page } from '@playwright/test'

const assets = browserAssets()
guardConsole(test)

/** Toolbar buttons carry `data-tool`; scope to the toolbar so nothing else can match. */
const toolButton = (id: string) => `[data-ink-toolbar] [data-tool="${id}"]`

test('tool buttons reflect and set the active tool with aria-pressed and onToolChange', async ({
  mount,
  page,
}) => {
  const tools: string[] = []
  const cmp = await mount(
    <ToolbarHarness
      src={fixtureUrl('text-simple')}
      assets={assets}
      onToolChange={(t) => tools.push(t)}
    />
  )
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Document tools' })).toBeVisible()
  const view = cmp.locator(toolButton('select-text'))
  const highlight = cmp.locator(toolButton('highlight'))
  await expect(view).toHaveAttribute('aria-pressed', 'true')
  await expect(view).toHaveAttribute('data-state', 'on')
  await expect(highlight).toHaveAttribute('aria-pressed', 'false')
  await expect(highlight).toHaveAttribute('data-state', 'off')
  await highlight.click()
  await expect(highlight).toHaveAttribute('aria-pressed', 'true')
  await expect(highlight).toHaveAttribute('data-state', 'on')
  await expect(view).toHaveAttribute('aria-pressed', 'false')
  expect(tools).toEqual(['highlight'])
  await expect(cmp.locator('[data-ink-scroll]')).toHaveAttribute(
    'data-ink-tool',
    'highlight'
  )
})

test('every toolbar control has an accessible name', async ({ mount, page }) => {
  const cmp = await mount(
    <ToolbarHarness src={fixtureUrl('text-simple')} assets={assets} />
  )
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  const toolbar = page.getByRole('toolbar', { name: 'Document tools' })
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
    await expect(toolbar.getByRole('button', { name, exact: true })).toHaveCount(1)
  const status = page.getByRole('toolbar', { name: 'Page and zoom' })
  for (const name of ['Previous page', 'Next page', 'Zoom out', 'Zoom in'])
    await expect(status.getByRole('button', { name, exact: true })).toHaveCount(1)
  await expect(status.getByRole('combobox', { name: 'Zoom' })).toHaveCount(1)
  await expect(status.getByRole('spinbutton', { name: 'Page' })).toHaveCount(1)
  // Icons are decoration: the button's name comes from its label.
  for (const bar of [toolbar, status])
    await expect(bar.locator('svg:not([aria-hidden="true"])')).toHaveCount(0)
})

test('zoom controls change the scale and the select reflects it', async ({
  mount,
  page,
}) => {
  const cmp = await mount(
    <ToolbarHarness src={fixtureUrl('text-simple')} assets={assets} />
  )
  const first = cmp.locator('.ink-page[data-page="0"]')
  await expect(first.locator('canvas')).toBeVisible()
  const select = page.getByRole('combobox', { name: 'Zoom' })
  const choose = async (name: string) => {
    await select.click()
    await page.getByRole('option', { name, exact: true }).click()
  }
  await expect(select).toHaveText('100%')
  await choose('200%')
  await expect(first).toHaveCSS('width', '1224px')
  await cmp.locator('[aria-label="Zoom out"]').click()
  // 2 x 0.8: 979.2px, which layout stores to 1/64 px.
  await expect
    .poll(() => first.evaluate((el) => el.getBoundingClientRect().width))
    .toBeCloseTo(612 * 1.6, 1)
  await expect(select).toHaveText('160%')
  await cmp.locator('[aria-label="Zoom in"]').click()
  await expect(first).toHaveCSS('width', '1224px')
  await expect(select).toHaveText('200%')
  await choose('Fit width')
  await expect(select).toHaveText('Fit width')
})

test('the zoom select opens from the keyboard', async ({ mount, page }) => {
  const cmp = await mount(
    <ToolbarHarness src={fixtureUrl('text-simple')} assets={assets} />
  )
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  const select = page.getByRole('combobox', { name: 'Zoom' })
  await select.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('option', { name: '100%' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(select).toHaveText('125%')
  await expect(select).toBeFocused()
})

test('previous and next page buttons move one page and stop at the ends', async ({
  mount,
  page,
}) => {
  const cmp = await mount(
    <ToolbarHarness src={fixtureUrl('text-simple')} assets={assets} />
  )
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  const prev = page.getByRole('button', { name: 'Previous page' })
  const next = page.getByRole('button', { name: 'Next page' })
  const input = cmp.locator('input[aria-label="Page"]')
  await expect(prev).toBeDisabled()
  await next.click()
  await expect(input).toHaveValue('2')
  await next.click()
  await expect(input).toHaveValue('3')
  await expect(next).toBeDisabled()
  await prev.click()
  await expect(input).toHaveValue('2')
})

test('a host onClick on the zoom button runs and the zoom still changes', async ({
  mount,
}) => {
  let clicks = 0
  const cmp = await mount(
    <ZoomClickHarness
      src={fixtureUrl('text-simple')}
      assets={assets}
      onHostClick={() => (clicks += 1)}
    />
  )
  const first = cmp.locator('.ink-page[data-page="0"]')
  await expect(first).toHaveCSS('width', '612px')
  await cmp.locator('[aria-label="Zoom in"]').click()
  await expect.poll(() => clicks).toBe(1)
  await expect(first).not.toHaveCSS('width', '612px')
})

test('page input navigates and the count shows the total', async ({ mount, page }) => {
  const cmp = await mount(
    <ToolbarHarness src={fixtureUrl('text-simple')} assets={assets} />
  )
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  await expect(cmp.locator('[data-ink-page-count]')).toHaveText('of 3')
  const input = cmp.locator('input[aria-label="Page"]')
  await expect(input).toHaveValue('1')
  await input.fill('3')
  await page.keyboard.press('Enter')
  await expect
    .poll(() => page.locator('[data-ink-scroll]').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(1500)
  await expect(input).toHaveValue('3')
  // Out of range: the input goes back to the current page and nothing moves.
  await input.fill('9')
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('3')
})

test('toolbar is keyboard operable', async ({ mount, page }) => {
  const cmp = await mount(
    <ToolbarHarness src={fixtureUrl('text-simple')} assets={assets} />
  )
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  const scroll = cmp.locator('[data-ink-scroll]')
  await cmp.locator(toolButton('select-text')).focus()
  await page.keyboard.press('ArrowRight')
  await expect(cmp.locator(toolButton('select'))).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(cmp.locator(toolButton('select'))).toHaveAttribute('aria-pressed', 'true')
  await expect(scroll).toHaveAttribute('data-ink-tool', 'select')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(cmp.locator(toolButton('redact-area'))).toBeFocused()
  await page.keyboard.press('Space')
  await expect(cmp.locator(toolButton('redact-area'))).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(scroll).toHaveAttribute('data-ink-tool', 'redact-area')
  await page.keyboard.press('ArrowLeft')
  await expect(cmp.locator(toolButton('highlight'))).toBeFocused()
})

test('blurring an untouched page input does not move the viewport', async ({
  mount,
  page,
}) => {
  const cmp = await mount(
    <ToolbarHarness src={fixtureUrl('text-simple')} assets={assets} />
  )
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  const scroll = cmp.locator('[data-ink-scroll]')
  const input = cmp.locator('input[aria-label="Page"]')
  await input.fill('2')
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('2')
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(500)
  await scroll.evaluate((el) => {
    el.scrollTop += 200
  })
  await expect(input).toHaveValue('2')
  const before = await scroll.evaluate((el) => el.scrollTop)
  await input.focus()
  // Zoom out would rescale the scroll position; clicking a non-zooming control isolates the blur.
  await cmp.locator(toolButton('select')).click()
  await expect(cmp.locator(toolButton('select'))).toHaveAttribute('aria-pressed', 'true')
  expect(await scroll.evaluate((el) => el.scrollTop)).toBe(before)
})

test('stepping the page input with the arrow keys moves the viewport', async ({
  mount,
  page,
}) => {
  const cmp = await mount(
    <ToolbarHarness src={fixtureUrl('text-simple')} assets={assets} />
  )
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  const scroll = cmp.locator('[data-ink-scroll]')
  const input = cmp.locator('input[aria-label="Page"]')
  await input.focus()
  // A step commits through the native change event, with no Enter and no blur.
  await page.keyboard.press('ArrowUp')
  await expect(input).toHaveValue('2')
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(500)
  await page.keyboard.press('ArrowDown')
  await expect(input).toHaveValue('1')
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(0)
})

test('undo and redo follow the history; the separator divides the toolbar', async ({
  mount,
  page,
}) => {
  const cmp = await mount(
    <ToolbarHarness src={fixtureUrl('text-simple')} assets={assets} />
  )
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  const toolbar = page.getByRole('toolbar', { name: 'Document tools' })
  const separator = toolbar.getByRole('separator')
  await expect(separator).toHaveAttribute('aria-orientation', 'vertical')
  const undo = toolbar.getByRole('button', { name: 'Undo', exact: true })
  const redo = toolbar.getByRole('button', { name: 'Redo', exact: true })
  const probe = page.getByTestId('probe')
  await expect(undo).toBeDisabled()
  await expect(redo).toBeDisabled()
  await page.getByTestId('add').click()
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect(probe).toHaveAttribute('data-annotations', '0')
  await expect(undo).toBeDisabled()
  await expect(redo).toBeEnabled()
  await redo.click()
  await expect(probe).toHaveAttribute('data-annotations', '1')
  await expect(redo).toBeDisabled()
})

test.describe('line style menu', () => {
  const open = async (page: Page) => {
    await page.getByRole('button', { name: 'Line style' }).click()
    return page.getByRole('menu', { name: 'Line style' })
  }

  test('line style menu sets width on the selected line', async ({ mount, page }) => {
    const cmp = await mount(
      <LineStyleHarness src={fixtureUrl('text-simple')} assets={assets} />
    )
    await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
    const trigger = page.getByRole('button', { name: 'Line style' })
    await expect(trigger).toBeDisabled()
    await page.getByTestId('add-line-1').click()
    await page.getByTestId('select-all').click()
    await expect(trigger).toBeEnabled()
    const menu = await open(page)
    const one = menu.getByRole('menuitemradio', { name: '1 pt' })
    await expect(one).toHaveAttribute('aria-checked', 'true')
    await menu.getByRole('menuitemradio', { name: '4 pt' }).click()
    await expect(page.getByTestId('probe')).toHaveAttribute('data-widths', '4')
    await expect(menu.getByRole('menuitemradio', { name: '4 pt' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await menu.getByRole('menuitemradio', { name: 'Dashed' }).click()
    await expect(page.getByTestId('probe')).toHaveAttribute('data-dashes', '3/3')
    await menu.getByRole('menuitemradio', { name: 'Arrowhead at end' }).click()
    await expect(page.getByTestId('probe')).toHaveAttribute('data-tails', 'openArrow')
    await menu.getByRole('menuitemradio', { name: 'Solid' }).click()
    await expect(page.getByTestId('probe')).toHaveAttribute('data-dashes', '-')
  })

  test('arrowheads section is disabled for a selected square', async ({
    mount,
    page,
  }) => {
    const cmp = await mount(
      <LineStyleHarness src={fixtureUrl('text-simple')} assets={assets} />
    )
    await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
    await page.getByTestId('add-square').click()
    await page.getByTestId('select-all').click()
    const menu = await open(page)
    const arrows = menu.getByRole('group', { name: 'Arrowheads' })
    await expect(arrows).toHaveAttribute('aria-disabled', 'true')
    await expect(arrows.getByRole('menuitemradio').first()).toBeDisabled()
    await expect(menu.getByRole('menuitemradio', { name: '2 pt' })).toBeEnabled()
    await expect(
      menu.getByRole('group', { name: 'Pattern' }).getByRole('menuitemradio').first()
    ).toBeEnabled()
  })

  test('shows mixed for two lines with different widths', async ({ mount, page }) => {
    const cmp = await mount(
      <LineStyleHarness src={fixtureUrl('text-simple')} assets={assets} />
    )
    await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
    await page.getByTestId('add-line-1').click()
    await page.getByTestId('add-line-3').click()
    await page.getByTestId('select-all').click()
    const trigger = page.getByRole('button', { name: 'Line style' })
    await expect(trigger).toHaveAttribute('data-mixed', '')
    const menu = await open(page)
    const weights = menu.getByRole('group', { name: 'Weight' })
    await expect(weights.locator('[aria-checked="true"]')).toHaveCount(0)
    await expect(weights.locator('.ink-select-indicator')).toHaveCount(0)
    // The lines agree on pattern and endings, so those sections still show their choice.
    await expect(menu.getByRole('menuitemradio', { name: 'Solid' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    // Picking one weight settles the mix.
    await menu.getByRole('menuitemradio', { name: '2 pt' }).click()
    await expect(trigger).not.toHaveAttribute('data-mixed', '')
  })

  test('arrow keys move through the items, and Escape closes and returns focus', async ({
    mount,
    page,
  }) => {
    const cmp = await mount(
      <LineStyleHarness src={fixtureUrl('text-simple')} assets={assets} />
    )
    await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
    await page.getByTestId('add-line-3').click()
    await page.getByTestId('select-all').click()
    const trigger = page.getByRole('button', { name: 'Line style' })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const menu = page.getByRole('menu', { name: 'Line style' })
    await expect(menu.getByRole('menuitemradio', { name: '3 pt' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitemradio', { name: '4 pt' })).toBeFocused()
    await page.keyboard.press('Home')
    await expect(menu.getByRole('menuitemradio', { name: '0.5 pt' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })
})
