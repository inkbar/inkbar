import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import { guardConsole } from '../../playwright/console-guard'
import Harness from '../../playwright/harness/ToolbarHarness.vue'

const assets = browserAssets()
guardConsole(test)

/** Toolbar buttons carry `data-tool`; scope to the toolbar so nothing else can match. */
const toolButton = (id: string) => `[data-ink-toolbar] [data-tool="${id}"]`

test('tool buttons reflect and set the active tool with aria-pressed and v-model', async ({
  mount,
  page,
}) => {
  const tools: string[] = []
  const cmp = await mount(Harness, {
    props: { src: fixtureUrl('text-simple'), assets },
    on: { 'update:tool': (t: string) => tools.push(t) },
  })
  await expect(cmp.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Document tools' })).toBeVisible()
  const view = cmp.locator(toolButton('view'))
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
  const cmp = await mount(Harness, { props: { src: fixtureUrl('text-simple'), assets } })
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  const toolbar = page.getByRole('toolbar', { name: 'Document tools' })
  for (const name of [
    'View',
    'Select',
    'Highlight',
    'Mark for redaction',
    'Add note',
    'Zoom out',
    'Zoom in',
  ])
    await expect(toolbar.getByRole('button', { name, exact: true })).toHaveCount(1)
  await expect(toolbar.getByRole('combobox', { name: 'Zoom' })).toHaveCount(1)
  await expect(toolbar.getByRole('spinbutton', { name: 'Page' })).toHaveCount(1)
  // Icons are decoration: the button's name comes from its label.
  await expect(toolbar.locator('svg:not([aria-hidden="true"])')).toHaveCount(0)
})

test('zoom controls change the scale and the select reflects it', async ({ mount }) => {
  const cmp = await mount(Harness, { props: { src: fixtureUrl('text-simple'), assets } })
  const first = cmp.locator('.ink-page[data-page="0"]')
  await expect(first.locator('canvas')).toBeVisible()
  const select = cmp.locator('select[aria-label="Zoom"]')
  await expect(select).toHaveValue('1')
  await select.selectOption('2')
  await expect(first).toHaveCSS('width', '1224px')
  await cmp.locator('[aria-label="Zoom out"]').click()
  // 2 x 0.8: 979.2px, which layout stores to 1/64 px.
  await expect
    .poll(() => first.evaluate((el) => el.getBoundingClientRect().width))
    .toBeCloseTo(612 * 1.6, 1)
  await expect(select.locator('option:checked')).toHaveText('160%')
  await cmp.locator('[aria-label="Zoom in"]').click()
  await expect(first).toHaveCSS('width', '1224px')
  await expect(select).toHaveValue('2')
  await select.selectOption('fit-width')
  await expect(select).toHaveValue('fit-width')
})

test('page input navigates and the count shows the total', async ({ mount, page }) => {
  const cmp = await mount(Harness, { props: { src: fixtureUrl('text-simple'), assets } })
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
  const cmp = await mount(Harness, { props: { src: fixtureUrl('text-simple'), assets } })
  await expect(cmp.locator('.ink-page canvas').first()).toBeVisible()
  const scroll = cmp.locator('[data-ink-scroll]')
  await cmp.locator(toolButton('view')).focus()
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
