import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-react'

import { guardConsole } from '../../playwright/console-guard'
import { ColorMenuHarness } from '../../playwright/harness/ColorMenuHarness'
import { LineStyleHarness } from '../../playwright/harness/LineStyleHarness'
import { TextStyleHarness } from '../../playwright/harness/TextStyleHarness'
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

test('the text tool button is named Text, shows its icon and picks the text box tool', async ({
  mount,
  page,
}) => {
  const cmp = await mount(
    <ToolbarHarness src={fixtureUrl('text-simple')} assets={assets} />
  )
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  const text = page
    .getByRole('toolbar', { name: 'Document tools' })
    .getByRole('button', { name: 'Text', exact: true })
  await expect(text).toHaveAttribute('data-tool', 'freetext')
  await expect(text.locator('svg')).toHaveCount(1)
  await text.click()
  await expect(text).toHaveAttribute('aria-pressed', 'true')
  await expect(cmp.locator('[data-ink-scroll]')).toHaveAttribute(
    'data-ink-tool',
    'freetext'
  )
})

test('the draw tool button is named Draw, shows its icon and picks the draw tool', async ({
  mount,
  page,
}) => {
  const cmp = await mount(
    <ToolbarHarness src={fixtureUrl('text-simple')} assets={assets} />
  )
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  const draw = page
    .getByRole('toolbar', { name: 'Document tools' })
    .getByRole('button', { name: 'Draw', exact: true })
  await expect(draw).toHaveAttribute('data-tool', 'draw')
  await expect(draw.locator('svg')).toHaveCount(1)
  await draw.click()
  await expect(draw).toHaveAttribute('aria-pressed', 'true')
  await expect(cmp.locator('[data-ink-scroll]')).toHaveAttribute('data-ink-tool', 'draw')
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
    'Text',
    'Line style',
    'Border colour',
    'Fill colour',
    'Text style',
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

  test('ArrowDown on the trigger opens the menu on the first item', async ({
    mount,
    page,
  }) => {
    const cmp = await mount(
      <LineStyleHarness src={fixtureUrl('text-simple')} assets={assets} />
    )
    await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
    await page.getByTestId('add-line-3').click()
    await page.getByTestId('select-all').click()
    await page.getByRole('button', { name: 'Line style' }).focus()
    await page.keyboard.press('ArrowDown')
    const menu = page.getByRole('menu', { name: 'Line style' })
    await expect(menu.getByRole('menuitemradio', { name: '0.5 pt' })).toBeFocused()
  })

  test('closes when the selection clears and the control disables', async ({
    mount,
    page,
  }) => {
    const cmp = await mount(
      <LineStyleHarness src={fixtureUrl('text-simple')} assets={assets} />
    )
    await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
    await page.getByTestId('add-line-3').click()
    await page.getByTestId('select-all').click()
    await page.getByRole('button', { name: 'Line style' }).click()
    await expect(page.getByRole('menu', { name: 'Line style' })).toBeVisible()
    await page.getByTestId('select-none').dispatchEvent('click')
    await expect(page.getByRole('menu', { name: 'Line style' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Line style' })).toBeDisabled()
  })
})

test.describe('colour menus', () => {
  const mountHarness = async (
    mount: Parameters<Parameters<typeof test>[2]>[0]['mount']
  ) => {
    const cmp = await mount(
      <ColorMenuHarness src={fixtureUrl('text-simple')} assets={assets} />
    )
    await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  }
  const selectNew = async (page: Page, id: 'add-square' | 'add-line') => {
    await page.getByTestId(id).click()
    await page.getByTestId('select-all').click()
  }

  test('border menu sets color on a selected square', async ({ mount, page }) => {
    await mountHarness(mount)
    const trigger = page.getByRole('button', { name: 'Border colour' })
    await expect(trigger).toBeDisabled()
    await selectNew(page, 'add-square')
    await expect(trigger).toBeEnabled()
    await expect(trigger.locator('[data-ink-swatch]')).toHaveAttribute(
      'data-color',
      '#FF3B30'
    )
    await trigger.click()
    const menu = page.getByRole('menu', { name: 'Border colour' })
    await expect(menu.getByRole('menuitemradio', { name: '#FF3B30' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await expect(menu.getByRole('menuitemradio', { name: 'No fill' })).toHaveCount(0)
    await menu.getByRole('menuitemradio', { name: '#007AFF' }).click()
    await expect(page.getByTestId('probe')).toHaveAttribute('data-colors', '#007AFF')
    await expect(menu.getByRole('menuitemradio', { name: '#007AFF' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await expect(trigger.locator('[data-ink-swatch]')).toHaveAttribute(
      'data-color',
      '#007AFF'
    )
  })

  test('fill menu has No fill and it clears interiorColor', async ({ mount, page }) => {
    await mountHarness(mount)
    await selectNew(page, 'add-square')
    await page.getByRole('button', { name: 'Fill colour' }).click()
    const menu = page.getByRole('menu', { name: 'Fill colour' })
    await expect(menu.getByRole('menuitemradio', { name: '#34C759' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await menu.getByRole('menuitemradio', { name: 'No fill' }).click()
    await expect(page.getByTestId('probe')).toHaveAttribute('data-fills', '-')
    await expect(menu.getByRole('menuitemradio', { name: 'No fill' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await expect(
      page.getByRole('button', { name: 'Fill colour' }).locator('[data-ink-swatch]')
    ).toHaveAttribute('data-kind', 'none')
  })

  test('Custom opens a native color input and applies its value', async ({
    mount,
    page,
  }) => {
    await mountHarness(mount)
    await selectNew(page, 'add-square')
    await page.getByRole('button', { name: 'Border colour' }).click()
    const menu = page.getByRole('menu', { name: 'Border colour' })
    const input = page.locator('input[data-ink-color-input="border"]')
    await expect(input).toHaveAttribute('aria-label', 'Custom colour')
    await menu.getByRole('menuitem', { name: 'Custom…' }).click()
    await input.fill('#123abc')
    await expect(page.getByTestId('probe')).toHaveAttribute('data-colors', '#123ABC')
  })

  test('fill menu is disabled when only a line is selected', async ({ mount, page }) => {
    await mountHarness(mount)
    await selectNew(page, 'add-line')
    await expect(page.getByRole('button', { name: 'Border colour' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Fill colour' })).toBeDisabled()
    // A line has no text.
    await expect(page.getByRole('button', { name: 'Text colour' })).toBeDisabled()
  })

  test('keyboard: arrows move between swatches, Enter applies, Escape returns focus', async ({
    mount,
    page,
  }) => {
    await mountHarness(mount)
    await selectNew(page, 'add-square')
    const trigger = page.getByRole('button', { name: 'Fill colour' })
    await trigger.focus()
    await page.keyboard.press('ArrowDown')
    const menu = page.getByRole('menu', { name: 'Fill colour' })
    const swatch = (name: string) => menu.getByRole('menuitemradio', { name })
    await expect(swatch('No fill')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(swatch('#FF3B30')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(swatch('#FF9500')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(swatch('#E8E8E8')).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(swatch('#FFFFFF')).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(swatch('#FF3B30')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('probe')).toHaveAttribute('data-fills', '#FF9500')
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test('Custom: the input survives the menu closing while the picker is open', async ({
    mount,
    page,
  }) => {
    await mountHarness(mount)
    await selectNew(page, 'add-square')
    await page.getByRole('button', { name: 'Border colour' }).click()
    const menu = page.getByRole('menu', { name: 'Border colour' })
    const input = page.locator('input[data-ink-color-input="border"]')
    await menu.getByRole('menuitem', { name: 'Custom…' }).click()
    // Anything that dismisses the menu while the picker is open must not lose the pick.
    await page.getByRole('button', { name: 'Border colour' }).click()
    await expect(menu).toHaveCount(0)
    await expect(input).toBeAttached()
    await input.evaluate((el: HTMLInputElement) => {
      el.value = '#abcdef'
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(page.getByTestId('probe')).toHaveAttribute('data-colors', '#ABCDEF')
  })

  test('a mixed selection shows a mixed trigger', async ({ mount, page }) => {
    await mountHarness(mount)
    await page.getByTestId('add-square').click()
    await page.getByTestId('add-square-2').click()
    await page.getByTestId('select-all').click()
    for (const name of ['Border colour', 'Fill colour']) {
      const trigger = page.getByRole('button', { name })
      await expect(trigger).toHaveAttribute('data-mixed', '')
      await expect(trigger.locator('[data-ink-swatch]')).toHaveAttribute(
        'data-kind',
        'mixed'
      )
    }
  })
})

test.describe('shape menu', () => {
  const mountHarness = async (
    mount: Parameters<Parameters<typeof test>[2]>[0]['mount']
  ) => {
    const cmp = await mount(
      <ToolbarHarness src={fixtureUrl('text-simple')} assets={assets} />
    )
    await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
    return cmp
  }
  const main = (cmp: Awaited<ReturnType<typeof mountHarness>>) =>
    cmp.locator('[data-ink-shape-button]')

  test('the main button activates shape with the current kind', async ({
    mount,
    page,
  }) => {
    const cmp = await mountHarness(mount)
    await expect(main(cmp)).toHaveAttribute('aria-pressed', 'false')
    await main(cmp).click()
    await expect(main(cmp)).toHaveAttribute('aria-pressed', 'true')
    await expect(main(cmp)).toHaveAttribute('data-kind', 'rectangle')
    await expect(page.getByTestId('probe')).toHaveAttribute('data-tool', 'shape')
  })

  test('choosing ellipse activates shape with kind ellipse', async ({ mount, page }) => {
    const cmp = await mountHarness(mount)
    await page.getByRole('button', { name: 'Choose shape' }).click()
    const menu = page.getByRole('menu', { name: 'Shapes' })
    await expect(
      menu.getByRole('menuitemradio', { name: 'Rectangle', exact: true })
    ).toHaveAttribute('aria-checked', 'true')
    await expect(menu.getByRole('menuitemradio', { name: 'Loupe' })).toHaveCount(0)
    await menu.getByRole('menuitemradio', { name: 'Ellipse' }).click()
    await expect(page.getByTestId('probe')).toHaveAttribute('data-tool', 'shape')
    await expect(main(cmp)).toHaveAttribute('data-kind', 'ellipse')
    await expect(menu).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Choose shape' })).toBeFocused()
  })

  test('the trigger icon follows the current kind', async ({ mount, page }) => {
    const cmp = await mountHarness(mount)
    const before = await main(cmp).innerHTML()
    await expect(main(cmp)).toHaveAccessibleName('Shape: Rectangle')
    await page.getByRole('button', { name: 'Choose shape' }).click()
    await page
      .getByRole('menu', { name: 'Shapes' })
      .getByRole('menuitemradio', { name: 'Star' })
      .click()
    await expect(main(cmp)).toHaveAccessibleName('Shape: Star')
    expect(await main(cmp).innerHTML()).not.toBe(before)
    await page.getByRole('button', { name: 'Choose shape' }).click()
    await page
      .getByRole('menu', { name: 'Shapes' })
      .getByRole('menuitemradio', { name: 'Speech bubble' })
      .click()
    await expect(main(cmp)).toHaveAccessibleName('Shape: Speech bubble')
    await expect(main(cmp)).toHaveAttribute('data-kind', 'bubble')
  })

  test('keyboard: ArrowDown opens on the first kind, arrows move through the grid, Escape returns focus', async ({
    mount,
    page,
  }) => {
    await mountHarness(mount)
    const chevron = page.getByRole('button', { name: 'Choose shape' })
    await chevron.focus()
    await page.keyboard.press('ArrowDown')
    const menu = page.getByRole('menu', { name: 'Shapes' })
    await expect(
      menu.getByRole('menuitemradio', { name: 'Line', exact: true })
    ).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(menu.getByRole('menuitemradio', { name: 'Arrow' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(
      menu.getByRole('menuitemradio', { name: 'Rounded rectangle' })
    ).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(chevron).toBeFocused()
  })
})

test.describe('text style menu', () => {
  const mountHarness = async (
    mount: Parameters<Parameters<typeof test>[2]>[0]['mount']
  ) => {
    const cmp = await mount(
      <TextStyleHarness src={fixtureUrl('text-simple')} assets={assets} />
    )
    await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  }
  const style = async (page: Page): Promise<Record<string, unknown>> =>
    JSON.parse(
      (await page.getByTestId('probe').getAttribute('data-style')) || '{}'
    ) as Record<string, unknown>
  const open = async (page: Page) => {
    await page.getByRole('button', { name: 'Text style' }).click()
    return page.getByRole('dialog', { name: 'Text style' })
  }

  test('bold toggle sets defaultStyle.fontWeight on the selected text box', async ({
    mount,
    page,
  }) => {
    await mountHarness(mount)
    await page.getByTestId('add-box').click()
    await page.getByTestId('select-all').click()
    const menu = await open(page)
    const bold = menu.getByRole('button', { name: 'Bold' })
    await expect(bold).toHaveAttribute('aria-pressed', 'false')
    await bold.click()
    await expect(bold).toHaveAttribute('aria-pressed', 'true')
    expect((await style(page)).fontWeight).toBe('bold')
    await bold.click()
    expect(await style(page)).not.toHaveProperty('fontWeight')
    await menu.getByRole('radio', { name: 'Align centre' }).click()
    await menu.getByRole('combobox', { name: 'Font' }).selectOption('Times')
    expect(await style(page)).toMatchObject({ textAlign: 'center', fontFamily: 'Times' })
  })

  test('size stepper clamps to 1..144', async ({ mount, page }) => {
    await mountHarness(mount)
    await page.getByTestId('add-box').click()
    await page.getByTestId('select-all').click()
    const menu = await open(page)
    const size = menu.getByRole('spinbutton', { name: 'Font size' })
    await expect(size).toHaveValue('12')
    await size.fill('500')
    await size.press('Enter')
    await expect(size).toHaveValue('144')
    expect((await style(page)).fontSize).toBe(144)
    await menu.getByRole('button', { name: 'Increase font size' }).click()
    await expect(size).toHaveValue('144')
    await size.fill('0')
    await size.press('Enter')
    await expect(size).toHaveValue('1')
    await menu.getByRole('button', { name: 'Decrease font size' }).click()
    await expect(size).toHaveValue('1')
    await menu.getByRole('button', { name: 'Increase font size' }).click()
    expect((await style(page)).fontSize).toBe(2)
  })

  test('menu disabled with only a square selected and the select tool active', async ({
    mount,
    page,
  }) => {
    await mountHarness(mount)
    await page.getByTestId('tool-select').click()
    await page.getByTestId('add-square').click()
    await page.getByTestId('select-all').click()
    await expect(page.getByRole('button', { name: 'Text style' })).toBeDisabled()
  })

  test('with the text tool active and nothing selected, changes become the text group default for the next box', async ({
    mount,
    page,
  }) => {
    await mountHarness(mount)
    await page.getByTestId('tool-freetext').click()
    await page.getByTestId('select-none').click()
    await expect(page.getByRole('button', { name: 'Text style' })).toBeEnabled()
    const menu = await open(page)
    await menu.getByRole('button', { name: 'Italic' }).click()
    await menu.getByRole('radio', { name: 'Align right' }).click()
    const group = JSON.parse(
      (await page.getByTestId('probe').getAttribute('data-group')) ?? '{}'
    ) as Record<string, unknown>
    expect(group).toMatchObject({ fontStyle: 'italic', textAlign: 'right' })
  })

  test('nests the text colour menu, and Escape closes and returns focus', async ({
    mount,
    page,
  }) => {
    await mountHarness(mount)
    await page.getByTestId('add-box').click()
    await page.getByTestId('select-all').click()
    const trigger = page.getByRole('button', { name: 'Text style' })
    await trigger.focus()
    await page.keyboard.press('ArrowDown')
    const menu = page.getByRole('dialog', { name: 'Text style' })
    await expect(menu.getByRole('combobox', { name: 'Font' })).toBeFocused()
    await menu.getByRole('button', { name: 'Text colour' }).click()
    await page
      .getByRole('menu', { name: 'Text colour' })
      .getByRole('menuitemradio', { name: '#FF3B30' })
      .click()
    expect((await style(page)).color).toBe('#FF3B30')
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu', { name: 'Text colour' })).toHaveCount(0)
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('button', { name: 'Text colour' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test('the font select offers the host fonts', async ({ mount, page }) => {
    const cmp = await mount(
      <TextStyleHarness
        src={fixtureUrl('text-simple')}
        assets={assets}
        fonts={['Georgia', 'Verdana']}
      />
    )
    await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
    await page.getByTestId('add-box').click()
    await page.getByTestId('select-all').click()
    const menu = await open(page)
    const font = menu.getByRole('combobox', { name: 'Font' })
    // The selected box uses Helvetica, which the host list lacks: it stays selectable.
    await expect(font.locator('option')).toHaveText(['Georgia', 'Verdana', 'Helvetica'])
    await font.selectOption('Verdana')
    expect((await style(page)).fontFamily).toBe('Verdana')
  })
})
