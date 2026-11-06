import { AxeBuilder } from '@axe-core/playwright'
import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { expect, test } from '@playwright/experimental-ct-vue'

import { guardConsole } from '../../playwright/console-guard'
import Harness from '../../playwright/harness/RecordsHarness.vue'
import SearchHarness from '../../playwright/harness/SearchResultsHarness.vue'
import SourceHarness from '../../playwright/harness/SourceHarness.vue'

import type { Page } from '@playwright/test'

const assets = browserAssets()
guardConsole(test)

const props = { src: fixtureUrl('text-simple'), assets, initial: 3 }

/** The list, its rows by id and the page's marks by record id. */
function parts(page: Page) {
  const list = page.getByTestId('list')
  return {
    list,
    rows: list.locator('[data-ink-record]'),
    row: (id: string) => list.locator(`[data-ink-record="${id}"]`),
    mark: (id: string) => page.locator(`[data-ink-scroll] button[data-record="${id}"]`),
  }
}

test('lists suggestions and accepts one in one undo step', async ({ mount, page }) => {
  await mount(Harness, { props })
  const { list, rows, row, mark } = parts(page)
  await expect(mark('s0')).toBeVisible()
  await expect(list).toHaveClass(/ink-records/)
  const ul = list.locator('ul.ink-record-list')
  await expect(ul).toHaveAttribute('role', 'list')
  await expect(rows).toHaveCount(3)
  await expect(ul.getByRole('listitem')).toHaveCount(3)
  expect(await rows.evaluateAll((els) => els.map((el) => el.dataset.inkRecord))).toEqual([
    's0',
    's1',
    's2',
  ])
  await expect(row('s1')).toHaveClass(/ink-record/)
  await expect(row('s1').locator('.ink-card .ink-card-title')).toHaveText('Suggestion 1')
  await expect(row('s1').locator('.ink-card-meta')).toHaveText('Page 1')
  await expect(row('s1').locator('.ink-card-actions button')).toHaveText('Accept')
  await expect(list.locator('.ink-record-list-empty')).toBeHidden()
  const live = list.locator('[aria-live="polite"]')
  await expect(live).toHaveText('')
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()

  await row('s1').getByRole('button', { name: 'Accept' }).click()
  await expect(rows).toHaveCount(2)
  await expect(row('s1')).toHaveCount(0)
  await expect(mark('s1')).toHaveCount(0)
  await expect(live).toHaveText('2 items')
  await expect(page.getByTestId('open-count')).toHaveText('2')

  // One undo step brings it back, with nothing left to undo.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(rows).toHaveCount(3)
  await expect(row('s1')).toHaveCount(1)
  await expect(page.getByTestId('open-count')).toHaveText('3')
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  // Undo is not announced.
  await expect(live).toHaveText('2 items')

  const results = await new AxeBuilder({ page }).include('[data-testid=list]').analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
})

test('row ↔ mark selection both ways', async ({ mount, page }) => {
  await mount(Harness, { props })
  const { row, mark } = parts(page)
  await expect(mark('s0')).toBeVisible()
  await expect(page.getByTestId('selected')).toHaveText('none')

  // Choosing a row selects its mark; focus stays in the list and no popover opens.
  await row('s1').locator('.ink-card-title').click()
  await expect(row('s1')).toHaveAttribute('aria-current', 'true')
  await expect(row('s1')).toHaveAttribute('data-selected', '')
  await expect(row('s0')).not.toHaveAttribute('aria-current')
  await expect(mark('s1')).toHaveAttribute('data-selected', '')
  await expect(page.getByTestId('selected')).toHaveText('s1')
  await expect(row('s1')).toBeFocused()
  await expect(mark('s1')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('[data-ink-popover]:not([hidden])')).toHaveCount(0)

  // Clicking a mark selects its row.
  await mark('s2').click()
  await expect(row('s2')).toHaveAttribute('aria-current', 'true')
  await expect(row('s1')).not.toHaveAttribute('aria-current')
  await expect(page.getByTestId('selected')).toHaveText('s2')

  // Closing the mark's popover leaves the selection.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('selected')).toHaveText('s2')
  await row('s0').locator('.ink-card-title').click()
  await expect(page.getByTestId('selected')).toHaveText('s0')
  // The hook selects for both.
  await page.getByTestId('select-s2').click()
  await expect(row('s2')).toHaveAttribute('aria-current', 'true')
  await expect(mark('s2')).toHaveAttribute('data-selected', '')

  // Escape in the list clears the selection.
  await row('s2').focus()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('selected')).toHaveText('none')
  await expect(row('s2')).not.toHaveAttribute('aria-current')
  await expect(mark('s2')).not.toHaveAttribute('data-selected')
})

test('focus after accept moves to the next row', async ({ mount, page }) => {
  await mount(Harness, { props })
  const { list, row, mark } = parts(page)
  await expect(mark('s0')).toBeVisible()
  // One Tab stop; arrow keys move it.
  await expect(list.locator('[data-ink-record][tabindex="0"]')).toHaveCount(1)
  await expect(row('s0')).toHaveAttribute('tabindex', '0')
  await row('s0').focus()
  await page.keyboard.press('ArrowDown')
  await expect(row('s1')).toBeFocused()
  await expect(row('s1')).toHaveAttribute('tabindex', '0')
  await expect(row('s0')).toHaveAttribute('tabindex', '-1')

  await page.keyboard.press('Tab')
  await expect(row('s1').getByRole('button', { name: 'Accept' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(row('s1')).toHaveCount(0)
  await expect(row('s2')).toBeFocused()
  await expect(list.locator('[data-ink-record][tabindex="0"]')).toHaveCount(1)

  // The last row: focus goes to the previous one.
  await row('s2').getByRole('button', { name: 'Accept' }).click()
  await expect(row('s0')).toBeFocused()
  // None left: the list itself.
  await row('s0').getByRole('button', { name: 'Accept' }).click()
  await expect(list).toBeFocused()
})

test('lists a host source and selects through it', async ({ mount, page }) => {
  await mount(SourceHarness, { props: { assets } })
  const { list, rows, row } = parts(page)
  await expect(rows).toHaveCount(2)
  await expect(row('a').locator('.ink-card-title')).toHaveText('Item a')
  await expect(row('b').locator('.ink-card-meta')).toHaveText('Page 2')
  await expect(list.locator('.ink-record-list-empty')).toBeHidden()
  await row('b').locator('.ink-card-title').click()
  await expect(page.getByTestId('selects')).toHaveText('b')
  await expect(row('b')).toHaveAttribute('aria-current', 'true')
  await expect(row('b')).toBeFocused()
})

test('#empty renders when nothing is listed', async ({ mount, page }) => {
  const component = await mount(Harness, { props: { ...props, initial: 1 } })
  const { list, rows, mark } = parts(page)
  await expect(mark('s0')).toBeVisible()
  const empty = list.locator('.ink-record-list-empty')
  await expect(empty).toBeHidden()
  await list.getByRole('button', { name: 'Accept' }).click()
  await expect(rows).toHaveCount(0)
  await expect(list.locator('ul.ink-record-list')).toBeHidden()
  await expect(empty).toBeVisible()
  await expect(empty).toHaveText('Nothing here yet.')

  await component.update({ props: { customEmpty: true } })
  await expect(empty.getByTestId('custom-empty')).toHaveText('All caught up')
  await expect(empty).not.toContainText('Nothing here yet.')

  const results = await new AxeBuilder({ page }).include('[data-testid=list]').analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
})

test('update:count follows the list', async ({ mount, page }) => {
  await mount(Harness, { props })
  const { row, mark } = parts(page)
  await expect(mark('s0')).toBeVisible()
  const count = page.getByTestId('count')
  await expect(count).toHaveText('3')
  await row('s0').getByRole('button', { name: 'Accept' }).click()
  await expect(count).toHaveText('2')
  await row('s2').getByRole('button', { name: 'Accept' }).click()
  await expect(count).toHaveText('1')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(count).toHaveText('2')
})

test('InkSearchResults and InkFindBar agree on query and current', async ({
  mount,
  page,
}) => {
  const component = await mount(SearchHarness, {
    props: { src: fixtureUrl('text-simple'), assets },
  })
  await expect(page.locator('[data-ink-scroll] .ink-page canvas').first()).toBeVisible()
  const results = page.getByTestId('results')
  const bar = page.getByTestId('find-bar')
  await expect(results).toHaveClass(/ink-search-results/)
  const field = results.getByRole('textbox', { name: 'Find in document' })
  await expect(results.getByRole('search')).toBeVisible()
  await expect(field).toHaveAttribute('placeholder', 'Search for a word or phrase')
  // Nothing searched yet: the empty text.
  await expect(results.locator('.ink-record-list-empty')).toHaveText(
    'Search to list every match.'
  )

  await field.fill('Inkbar')
  const rows = results.locator('[data-ink-record]')
  const resultsCount = results.locator('[data-ink-search-results-count]')
  const barCount = bar.locator('[data-ink-find-count]')
  await expect(resultsCount).toHaveText(/^1 of \d+$/)
  await expect(results.locator('.ink-record-list-empty')).toBeHidden()
  await expect(bar.locator('input')).toHaveValue('Inkbar')
  await expect(barCount).toHaveText((await resultsCount.textContent())!)
  const total = Number((await resultsCount.textContent())!.split(' of ')[1])
  expect(total).toBeGreaterThan(1)
  await expect(rows).toHaveCount(total)
  await expect(rows.first().locator('.ink-card-excerpt mark')).toHaveText(/inkbar/i)
  await expect(rows.first().locator('.ink-card-title')).toHaveText(/^Page \d+$/)
  await expect(rows.first().locator('.ink-card-meta')).toHaveText('Match 1')
  await expect(rows.first()).toHaveAttribute('aria-current', 'true')

  // Choosing a row makes its hit current in the bar.
  await rows.nth(1).locator('.ink-card-title').click()
  await expect(barCount).toHaveText(new RegExp(`^2 of ${total}$`))
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true')
  // Escape in the results leaves the current hit.
  await page.keyboard.press('Escape')
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true')
  // Enter in the field steps on, as in the bar.
  await field.press('Enter')
  await expect(barCount).toHaveText(new RegExp(`^3 of ${total}$`))
  await expect(rows.nth(2)).toHaveAttribute('aria-current', 'true')
  await field.press('Shift+Enter')
  await expect(resultsCount).toHaveText(new RegExp(`^2 of ${total}$`))

  const axe = await new AxeBuilder({ page }).include('[data-testid=results]').analyze()
  expect(axe.violations.map((v) => v.id)).toEqual([])

  // A query typed in the bar shows in the results.
  await page.getByRole('button', { name: 'Find' }).click()
  await bar.locator('input').fill('zzqqzz')
  await expect(field).toHaveValue('zzqqzz')
  await expect(resultsCount).toHaveText('No results')
  await expect(rows).toHaveCount(0)
  // "No results" is the count's to say.
  await expect(results.locator('.ink-record-list-empty')).toBeHidden()

  await component.update({ props: { field: false } })
  await expect(results.locator('input')).toHaveCount(0)
  await expect(results.getByRole('search')).toHaveCount(0)
  await expect(resultsCount).toHaveText('No results')
})
