import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-react'

import { guardConsole } from '../../playwright/console-guard'
import { ColorMenuHarness } from '../../playwright/harness/ColorMenuHarness'
import { LineStyleHarness } from '../../playwright/harness/LineStyleHarness'
import { SignatureHarness } from '../../playwright/harness/SignatureHarness'
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

test('the sketch tool button is named Sketch, shows its icon and picks the sketch tool', async ({
  mount,
  page,
}) => {
  const cmp = await mount(
    <ToolbarHarness src={fixtureUrl('text-simple')} assets={assets} />
  )
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  const sketch = page
    .getByRole('toolbar', { name: 'Document tools' })
    .getByRole('button', { name: 'Sketch', exact: true })
  await expect(sketch).toHaveAttribute('data-tool', 'sketch')
  await expect(sketch.locator('svg')).toHaveCount(1)
  await sketch.click()
  await expect(sketch).toHaveAttribute('aria-pressed', 'true')
  await expect(cmp.locator('[data-ink-scroll]')).toHaveAttribute(
    'data-ink-tool',
    'sketch'
  )
})

test('a controlled host undoes a sketched circle in two steps: the stroke, then nothing', async ({
  mount,
  page,
}) => {
  const cmp = await mount(
    <ToolbarHarness src={fixtureUrl('text-simple')} assets={assets} controlled />
  )
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  const bar = page.getByRole('toolbar', { name: 'Document tools' })
  await bar.getByRole('button', { name: 'Sketch', exact: true }).click()
  const box = (await cmp.locator('.ink-page[data-page="0"]').boundingBox())!
  const at = (i: number) => {
    const t = (i / 40) * Math.PI * 2
    return [box.x + 150 + 50 * Math.cos(t), box.y + 110 + 45 * Math.sin(t)] as const
  }
  await page.mouse.move(...at(0))
  await page.mouse.down()
  for (let i = 1; i <= 42; i++) await page.mouse.move(...at(i))
  await page.mouse.up()
  const of = (type: string) =>
    cmp.locator(`.ink-annotation[data-type="${type}"][data-source="session"]`)
  await expect(of('circle')).toHaveCount(1)
  await expect(of('ink')).toHaveCount(0)
  const undo = bar.getByRole('button', { name: 'Undo', exact: true })
  await undo.click()
  await expect(of('ink')).toHaveCount(1)
  await expect(of('circle')).toHaveCount(0)
  await undo.click()
  await expect(of('ink')).toHaveCount(0)
  await expect(of('circle')).toHaveCount(0)
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
    'Choose highlight',
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
  await expect(cmp.locator(toolButton('redact-area'))).toBeFocused()
  await page.keyboard.press('Space')
  await expect(cmp.locator(toolButton('redact-area'))).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(scroll).toHaveAttribute('data-ink-tool', 'redact-area')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(cmp.locator(toolButton('select-text'))).toBeFocused()
  // The highlight menu's two parts are toolbar stops of their own.
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('button', { name: 'Choose highlight' })).toBeFocused()
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

test.describe('highlight menu', () => {
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
    cmp.locator('[data-ink-highlight-button]')
  type Doc = {
    annotations: {
      add(input: unknown): { id: string }
      select(ids: string[]): void
      get(id: string): { color: string } | undefined
    }
  }
  const doc = (page: Page) =>
    page
      .locator('[data-ink-root]')
      .evaluateHandle((el) => (el as HTMLElement & { __inkDocument: Doc }).__inkDocument)

  test('the main button activates highlight with the current kind', async ({
    mount,
    page,
  }) => {
    const cmp = await mountHarness(mount)
    await expect(main(cmp)).toHaveAccessibleName('Highlight')
    await expect(main(cmp)).toHaveAttribute('aria-pressed', 'false')
    await main(cmp).click()
    await expect(main(cmp)).toHaveAttribute('aria-pressed', 'true')
    await expect(main(cmp)).toHaveAttribute('data-kind', 'highlight')
    await expect(page.getByTestId('probe')).toHaveAttribute('data-tool', 'highlight')
  })

  test('choosing underline activates highlight with kind underline', async ({
    mount,
    page,
  }) => {
    const cmp = await mountHarness(mount)
    const before = await main(cmp).innerHTML()
    await page.getByRole('button', { name: 'Choose highlight' }).click()
    const menu = page.getByRole('menu', { name: 'Highlights' })
    await expect(menu.getByRole('menuitemradio')).toHaveText([
      'Highlight',
      'Underline',
      'Strikethrough',
      'Squiggly underline',
    ])
    await expect(
      menu.getByRole('menuitemradio', { name: 'Highlight', exact: true })
    ).toHaveAttribute('aria-checked', 'true')
    await menu.getByRole('menuitemradio', { name: 'Underline', exact: true }).click()
    await expect(page.getByTestId('probe')).toHaveAttribute('data-tool', 'highlight')
    await expect(main(cmp)).toHaveAttribute('data-kind', 'underline')
    await expect(main(cmp)).toHaveAccessibleName('Underline')
    expect(await main(cmp).innerHTML()).not.toBe(before)
    await expect(menu).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Choose highlight' })).toBeFocused()
  })

  test('the colour works under any tool and recolours selected markup', async ({
    mount,
    page,
  }) => {
    await mountHarness(mount)
    await expect(page.getByTestId('probe')).toHaveAttribute('data-tool', 'select-text')
    const id = await (
      await doc(page)
    ).evaluate(
      (d) =>
        d.annotations.add({
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
        }).id
    )
    await (await doc(page)).evaluate((d, i) => d.annotations.select([i]), id)
    await page.getByRole('button', { name: 'Choose highlight' }).click()
    const menu = page.getByRole('menu', { name: 'Highlights' })
    const colour = menu.getByRole('menuitem', { name: 'Highlight colour' })
    await expect(colour).toBeEnabled()
    await colour.click()
    const swatches = page.getByRole('menu', { name: 'Highlight colour' })
    await swatches.getByRole('menuitemradio').nth(3).click()
    const picked = await swatches
      .getByRole('menuitemradio')
      .nth(3)
      .getAttribute('aria-label')
    // The nested menu keeps the highlight menu open.
    await expect(menu).toBeVisible()
    expect(
      await (await doc(page)).evaluate((d, i) => d.annotations.get(i)?.color, id)
    ).toBe(picked)
    await expect(colour.locator('[data-ink-swatch]')).toHaveAttribute(
      'data-color',
      picked!
    )
    await page.keyboard.press('Escape')
    await expect(swatches).toHaveCount(0)
    await expect(menu).toBeVisible()
    await expect(colour).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  })

  test('keyboard: ArrowDown opens on the first kind, arrows reach the colour, Escape returns focus', async ({
    mount,
    page,
  }) => {
    await mountHarness(mount)
    const chevron = page.getByRole('button', { name: 'Choose highlight' })
    await chevron.focus()
    await page.keyboard.press('ArrowDown')
    const menu = page.getByRole('menu', { name: 'Highlights' })
    await expect(
      menu.getByRole('menuitemradio', { name: 'Highlight', exact: true })
    ).toBeFocused()
    await page.keyboard.press('End')
    await expect(menu.getByRole('menuitem', { name: 'Highlight colour' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(
      menu.getByRole('menuitemradio', { name: 'Highlight', exact: true })
    ).toBeFocused()
    await expect(page.getByRole('menu', { name: 'Highlight colour' })).toHaveCount(0)
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

test.describe('signature menu', () => {
  const INK = {
    id: 'sig-a',
    kind: 'ink' as const,
    inklist: [
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    ],
    aspect: 3,
  }
  const IMAGE = {
    id: 'sig-b',
    kind: 'image' as const,
    imagedata:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAABCAYAAAAb4BS0AAAADklEQVR4nGP4z8DwH4YBJuYF+2EsXwgAAAAASUVORK5CYII=',
    aspect: 3,
  }
  const store = (page: Page) => page.getByTestId('signature-store')
  const menu = (page: Page) => page.getByRole('menu', { name: 'Signatures' })
  const dialog = (page: Page) => page.getByRole('dialog', { name: 'Create signature' })

  test('create a drawn signature, it appears in the menu and is selected', async ({
    mount,
    page,
  }) => {
    const cmp = await mount(
      <SignatureHarness src={fixtureUrl('text-simple')} assets={assets} />
    )
    await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
    const main = page.locator('[data-ink-signature-button]')
    await expect(main).toHaveAccessibleName('Sign')
    await page.getByRole('button', { name: 'Choose signature' }).click()
    await expect(menu(page).getByRole('menuitemradio')).toHaveCount(0)
    await menu(page).getByRole('menuitem', { name: 'Create signature' }).click()
    await expect(menu(page)).toBeHidden()
    await expect(dialog(page)).toBeVisible()
    const save = dialog(page).getByRole('button', { name: 'Save' })
    await expect(save).toBeDisabled()
    const pad = dialog(page).locator('[data-ink-signature-pad]')
    const box = (await pad.boundingBox())!
    await page.mouse.move(box.x + 20, box.y + 60)
    await page.mouse.down()
    await page.mouse.move(box.x + 80, box.y + 20, { steps: 4 })
    await page.mouse.move(box.x + 160, box.y + 70, { steps: 4 })
    await page.mouse.up()
    await expect(save).toBeEnabled()
    await save.click()
    await expect(dialog(page)).toBeHidden()
    await expect(store(page)).toHaveAttribute('data-count', '1')
    await expect(store(page)).toHaveAttribute('data-kinds', 'ink')
    const id = await store(page).getAttribute('data-ids')
    await expect(page.getByTestId('signature-options')).toHaveAttribute(
      'data-template',
      id!
    )
    await expect(page.getByTestId('probe')).toHaveAttribute('data-tool', 'signature')
    await expect(main).toHaveAttribute('aria-pressed', 'true')
    await expect(main).toBeFocused()
    await page.getByRole('button', { name: 'Choose signature' }).click()
    const item = menu(page).getByRole('menuitemradio', { name: 'Signature 1' })
    await expect(item).toHaveAttribute('aria-checked', 'true')
    await expect(item.locator('svg path')).not.toHaveCount(0)
    await page.keyboard.press('Escape')
    // The tool places it with a click on the page.
    const pageBox = (await cmp.locator('.ink-page').first().boundingBox())!
    await page.mouse.click(pageBox.x + 300, pageBox.y + 300)
    await expect(page.getByTestId('probe')).toHaveAttribute('data-annotations', '1')
  })

  test('remove deletes from the store', async ({ mount, page }) => {
    const cmp = await mount(
      <SignatureHarness
        src={fixtureUrl('text-simple')}
        assets={assets}
        initial={[INK, IMAGE]}
      />
    )
    await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
    await page.getByRole('button', { name: 'Choose signature' }).click()
    await expect(menu(page).getByRole('menuitemradio')).toHaveCount(2)
    await expect(
      menu(page).getByRole('menuitemradio', { name: 'Signature 2' }).locator('img')
    ).toHaveAttribute('src', IMAGE.imagedata)
    await menu(page).getByRole('menuitem', { name: 'Remove signature 1' }).click()
    await expect(store(page)).toHaveAttribute('data-ids', 'sig-b')
    const left = menu(page).getByRole('menuitemradio')
    await expect(left).toHaveCount(1)
    await expect(left).toHaveAttribute('data-key', 'sig-b')
    await expect(left).toBeFocused()
  })

  test('dialog traps focus and Escape closes', async ({ mount, page }) => {
    const cmp = await mount(
      <SignatureHarness src={fixtureUrl('text-simple')} assets={assets} />
    )
    await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
    await page.getByRole('button', { name: 'Choose signature' }).click()
    await menu(page).getByRole('menuitem', { name: 'Create signature' }).click()
    const draw = dialog(page).getByRole('tab', { name: 'Draw' })
    const type = dialog(page).getByRole('tab', { name: 'Type' })
    await expect(draw).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(type).toBeFocused()
    await expect(type).toHaveAttribute('aria-selected', 'true')
    // Save is disabled with no name, so Cancel is the last stop: Tab wraps both ways.
    await page.keyboard.press('Shift+Tab')
    await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(type).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await expect(page.locator('[data-ink-signature-button]')).toBeFocused()
  })

  test('the Type tab saves the name in a host font as an image template', async ({
    mount,
    page,
  }) => {
    const cmp = await mount(
      <SignatureHarness
        src={fixtureUrl('text-simple')}
        assets={assets}
        fonts={['serif', 'cursive']}
      />
    )
    await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
    await page.getByRole('button', { name: 'Choose signature' }).click()
    await menu(page).getByRole('menuitem', { name: 'Create signature' }).click()
    await dialog(page).getByRole('tab', { name: 'Type' }).click()
    await dialog(page).getByLabel('Name').fill('Ada Lovelace')
    const fonts = dialog(page).getByRole('radio')
    await expect(fonts).toHaveCount(2)
    await expect(fonts.nth(1)).toHaveAccessibleName('cursive')
    await expect(fonts.nth(1)).toHaveText('Ada Lovelace')
    await fonts.nth(1).click()
    await expect(fonts.nth(1)).toHaveAttribute('aria-checked', 'true')
    await dialog(page).getByRole('button', { name: 'Save' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(store(page)).toHaveAttribute('data-kinds', 'image')
  })
})
