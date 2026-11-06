import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import { run as runAxe } from 'axe-core'
import { describe, expect, it } from 'vitest'
import { page as browserPage, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'

import { guardConsole } from './console-guard.js'
import { focused, q, qa } from './dom.js'
import RecordsHarness from './harness/RecordsHarness.svelte'
import RecordSourceHarness from './harness/RecordSourceHarness.svelte'
import SearchResultsHarness from './harness/SearchResultsHarness.svelte'

const assets = browserAssets()
const guard = guardConsole()

const props = { src: fixtureUrl('text-simple'), assets, initial: 3 }
const LIST = '[data-testid="list"]'

const list = () => document.querySelector<HTMLElement>(LIST)
const rows = () => qa<HTMLElement>(`${LIST} [data-ink-record]`)
const row = (id: string) =>
  document.querySelector<HTMLElement>(`${LIST} [data-ink-record="${id}"]`)
const mark = (id: string) =>
  document.querySelector<HTMLElement>(`[data-ink-scroll] button[data-record="${id}"]`)
const text = (testId: string) => () =>
  document.querySelector(`[data-testid="${testId}"]`)?.textContent
const testId = (id: string) =>
  document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!
const hidden = (el: Element | null) => () => (el as HTMLElement | null)?.hidden
const click = (el: Element | null) => userEvent.click(el!)
const titleOf = (id: string) => row(id)!.querySelector('.ink-card-title')!
const accept = (id: string) => row(id)!.querySelector('.ink-card-actions button')!

/** Mounts the records harness and waits for the marks to draw. */
async function mountRecords(extra: Record<string, unknown> = {}) {
  const view = await render(RecordsHarness, { ...props, ...extra })
  await q('[data-ink-scroll] button[data-record="s0"]')
  return view
}

describe('record list', () => {
  it('lists suggestions and accepts one in one undo step', async () => {
    await mountRecords()
    const el = list()!
    expect(el.classList.contains('ink-records')).toBe(true)
    const ul = el.querySelector('ul.ink-record-list')!
    expect(ul.getAttribute('role')).toBe('list')
    await expect.poll(() => rows().length).toBe(3)
    expect(qa('li', ul)).toHaveLength(3)
    expect(rows().map((r) => r.dataset.inkRecord)).toEqual(['s0', 's1', 's2'])
    expect(row('s1')!.classList.contains('ink-record')).toBe(true)
    expect(row('s1')!.querySelector('.ink-card .ink-card-title')!.textContent).toBe(
      'Suggestion 1'
    )
    expect(row('s1')!.querySelector('.ink-card-meta')!.textContent).toBe('Page 1')
    expect(qa('.ink-card-actions button', row('s1')!).map((b) => b.textContent)).toEqual([
      'Accept',
    ])
    expect(el.querySelector<HTMLElement>('.ink-record-list-empty')!.hidden).toBe(true)
    const live = el.querySelector('[aria-live="polite"]')!
    expect(live.textContent).toBe('')
    const undo = browserPage.getByRole('button', { name: 'Undo' })
    await expect.element(undo).toBeDisabled()

    await click(accept('s1'))
    await expect.poll(() => rows().length).toBe(2)
    expect(row('s1')).toBeNull()
    await expect.poll(() => mark('s1')).toBeNull()
    await expect.poll(() => live.textContent).toBe('2 items')
    await expect.poll(text('open-count')).toBe('2')

    // One undo step brings it back, with nothing left to undo.
    await undo.click()
    await expect.poll(() => rows().length).toBe(3)
    expect(row('s1')).not.toBeNull()
    await expect.poll(text('open-count')).toBe('3')
    await expect.element(undo).toBeDisabled()
    // Undo is not announced.
    expect(live.textContent).toBe('2 items')

    const results = await runAxe(el)
    expect(results.violations.map((v) => v.id)).toEqual([])
  })

  it('row ↔ mark selection both ways', async () => {
    await mountRecords()
    await expect.poll(() => rows().length).toBe(3)
    expect(text('selected')()).toBe('none')

    // Choosing a row selects its mark; focus stays in the list and no popover opens.
    await click(titleOf('s1'))
    await expect.poll(() => row('s1')!.getAttribute('aria-current')).toBe('true')
    expect(row('s1')!.hasAttribute('data-selected')).toBe(true)
    expect(row('s0')!.hasAttribute('aria-current')).toBe(false)
    await expect.poll(() => mark('s1')!.hasAttribute('data-selected')).toBe(true)
    await expect.poll(text('selected')).toBe('s1')
    await expect.poll(focused).toBe(row('s1'))
    expect(mark('s1')!.getAttribute('aria-expanded')).toBe('false')
    expect(qa('[data-ink-popover]:not([hidden])')).toHaveLength(0)

    // Clicking a mark selects its row.
    await click(mark('s2'))
    await expect.poll(() => row('s2')!.getAttribute('aria-current')).toBe('true')
    expect(row('s1')!.hasAttribute('aria-current')).toBe(false)
    await expect.poll(text('selected')).toBe('s2')

    // Closing the mark's popover leaves the selection.
    await userEvent.keyboard('{Escape}')
    await expect.poll(text('selected')).toBe('s2')
    await click(titleOf('s0'))
    await expect.poll(text('selected')).toBe('s0')
    // The hook selects for both.
    await click(testId('select-s2'))
    await expect.poll(() => row('s2')!.getAttribute('aria-current')).toBe('true')
    await expect.poll(() => mark('s2')!.hasAttribute('data-selected')).toBe(true)

    // Escape in the list clears the selection.
    row('s2')!.focus()
    await userEvent.keyboard('{Escape}')
    await expect.poll(text('selected')).toBe('none')
    await expect.poll(() => row('s2')!.hasAttribute('aria-current')).toBe(false)
    await expect.poll(() => mark('s2')!.hasAttribute('data-selected')).toBe(false)
  })

  it('focus after accept moves to the next row', async () => {
    await mountRecords()
    await expect.poll(() => rows().length).toBe(3)
    // One Tab stop; arrow keys move it.
    await expect.poll(() => qa(`${LIST} [data-ink-record][tabindex="0"]`).length).toBe(1)
    expect(row('s0')!.getAttribute('tabindex')).toBe('0')
    row('s0')!.focus()
    await userEvent.keyboard('{ArrowDown}')
    await expect.poll(focused).toBe(row('s1'))
    expect(row('s1')!.getAttribute('tabindex')).toBe('0')
    expect(row('s0')!.getAttribute('tabindex')).toBe('-1')

    await userEvent.keyboard('{Tab}')
    await expect.poll(focused).toBe(accept('s1'))
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => row('s1')).toBeNull()
    await expect.poll(focused).toBe(row('s2'))
    expect(qa(`${LIST} [data-ink-record][tabindex="0"]`)).toHaveLength(1)

    // The last row: focus goes to the previous one.
    await click(accept('s2'))
    await expect.poll(focused).toBe(row('s0'))
    // None left: the list itself.
    await click(accept('s0'))
    await expect.poll(focused).toBe(list())
  })

  it('useRecords is empty before mount and live after', async () => {
    await mountRecords()
    // Initialisation had no plugins yet: no handle, nothing listed, nothing selected.
    expect(text('first')()).toBe('false/0/null')
    await expect.poll(text('ready')).toBe('true')
    await expect.poll(text('open-count')).toBe('3')
    // A write through the handle shows in the hook, the list and the marks.
    await click(testId('add-s9'))
    await expect.poll(text('open-count')).toBe('4')
    await expect.poll(() => rows().length).toBe(4)
    expect(titleOf('s9').textContent).toBe('Suggestion 9')
    await expect.poll(() => mark('s9')).not.toBeNull()
  })

  it('useRecordSelection follows mark clicks', async () => {
    await mountRecords()
    expect(text('selected')()).toBe('none')
    await click(mark('s1'))
    await expect.poll(text('selected')).toBe('s1')
    // The mark's popover covers its neighbours in this layout: close it first.
    await userEvent.keyboard('{Escape}')
    await click(mark('s0'))
    await expect.poll(text('selected')).toBe('s0')
  })

  it('lists a host source and selects through it', async () => {
    await render(RecordSourceHarness, { assets })
    await expect.poll(() => rows().length).toBe(2)
    expect(titleOf('a').textContent).toBe('Item a')
    expect(row('b')!.querySelector('.ink-card-meta')!.textContent).toBe('Page 2')
    expect(list()!.querySelector<HTMLElement>('.ink-record-list-empty')!.hidden).toBe(
      true
    )
    await click(titleOf('b'))
    await expect.poll(text('selects')).toBe('b')
    await expect.poll(() => row('b')!.getAttribute('aria-current')).toBe('true')
    await expect.poll(focused).toBe(row('b'))
  })

  it('with records and source both, lists the source and warns', async () => {
    await render(RecordSourceHarness, { assets, records: 'sandbox.suggestions' })
    await expect.poll(() => rows().map((r) => r.dataset.inkRecord)).toEqual(['a', 'b'])
    expect(guard.problems).toEqual([
      '[inkbar] InkRecordList takes `records` or `source`, not both: it lists `source`.',
    ])
    guard.clear()
  })

  it('empty snippet renders when nothing is listed', async () => {
    const view = await mountRecords({ initial: 1 })
    await expect.poll(() => rows().length).toBe(1)
    const empty = () => list()!.querySelector<HTMLElement>('.ink-record-list-empty')!
    expect(empty().hidden).toBe(true)
    await click(accept('s0'))
    await expect.poll(() => rows().length).toBe(0)
    await expect.poll(hidden(list()!.querySelector('ul.ink-record-list'))).toBe(true)
    await expect.poll(() => empty().hidden).toBe(false)
    expect(empty().textContent).toBe('Nothing here yet.')

    await view.rerender({ customEmpty: true })
    await expect
      .poll(() => empty().querySelector('[data-testid="custom-empty"]')?.textContent)
      .toBe('All caught up')
    expect(empty().textContent).not.toContain('Nothing here yet.')
    expect(empty().hidden).toBe(false)

    const results = await runAxe(list()!)
    expect(results.violations.map((v) => v.id)).toEqual([])
  })

  it('bind:count follows the list', async () => {
    await mountRecords()
    await expect.poll(text('count')).toBe('3')
    await click(accept('s0'))
    await expect.poll(text('count')).toBe('2')
    await click(accept('s2'))
    await expect.poll(text('count')).toBe('1')
    await browserPage.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(text('count')).toBe('2')
  })

  it('unmounting the list stops it, and a new one lists again', async () => {
    await mountRecords()
    await expect.poll(() => rows().length).toBe(3)
    await click(testId('toggle-list'))
    await expect.poll(list).toBeNull()
    // The marks and the selection carry on without it.
    await click(mark('s1'))
    await expect.poll(text('selected')).toBe('s1')
    await userEvent.keyboard('{Escape}')
    await click(testId('toggle-list'))
    await expect.poll(() => rows().length).toBe(3)
    await expect.poll(() => row('s1')!.getAttribute('aria-current')).toBe('true')
    expect(qa(`${LIST} [data-ink-record][tabindex="0"]`)).toHaveLength(1)
  })
})

describe('search results', () => {
  it('InkSearchResults and InkFindBar agree on query and current', async () => {
    const searchProps = { src: fixtureUrl('text-simple'), assets }
    const view = await render(SearchResultsHarness, searchProps)
    await q('[data-ink-scroll] .ink-page canvas')
    const results = await q('[data-testid="results"]')
    const bar = await q('[data-testid="find-bar"]')
    expect(results.classList.contains('ink-search-results')).toBe(true)
    const field = results.querySelector<HTMLInputElement>('input')!
    expect(field.getAttribute('aria-label')).toBe('Find in document')
    expect(results.querySelector('[role="search"]')).toBe(field.parentElement)
    const empty = () => results.querySelector<HTMLElement>('.ink-record-list-empty')!
    const resultRows = () => qa<HTMLElement>('[data-ink-record]', results)
    const resultsCount = () => results.querySelector('.ink-find-count')!.textContent
    const barCount = () => bar.querySelector('[data-ink-find-count]')!.textContent
    // Nothing searched yet: the empty text.
    await expect.poll(() => empty().hidden).toBe(false)
    expect(empty().textContent).toBe('Nothing here yet.')

    await userEvent.fill(field, 'Inkbar')
    await expect.poll(resultsCount).toMatch(/^1 of \d+$/)
    await expect.poll(() => empty().hidden).toBe(true)
    await expect.poll(() => bar.querySelector('input')!.value).toBe('Inkbar')
    await expect.poll(barCount).toBe(resultsCount())
    const total = Number(resultsCount().split(' of ')[1])
    expect(total).toBeGreaterThan(1)
    await expect.poll(() => resultRows().length).toBe(total)
    const first = resultRows()[0]!
    expect(first.querySelector('.ink-card-excerpt mark')!.textContent).toMatch(/inkbar/i)
    expect(first.querySelector('.ink-card-title')!.textContent).toMatch(/^Page \d+$/)
    expect(first.querySelector('.ink-card-meta')!.textContent).toBe('Match 1')
    await expect.poll(() => first.getAttribute('aria-current')).toBe('true')

    // Choosing a row makes its hit current in the bar.
    await click(resultRows()[1]!.querySelector('.ink-card-title'))
    await expect.poll(barCount).toBe(`2 of ${total}`)
    await expect.poll(() => resultRows()[1]!.getAttribute('aria-current')).toBe('true')
    // Escape in the results leaves the current hit.
    await userEvent.keyboard('{Escape}')
    expect(resultRows()[1]!.getAttribute('aria-current')).toBe('true')
    // Enter in the field steps on, as in the bar.
    field.focus()
    await userEvent.keyboard('{Enter}')
    await expect.poll(barCount).toBe(`3 of ${total}`)
    await expect.poll(() => resultRows()[2]!.getAttribute('aria-current')).toBe('true')
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    await expect.poll(resultsCount).toBe(`2 of ${total}`)

    const axe = await runAxe(results)
    expect(axe.violations.map((v) => v.id)).toEqual([])

    // A query typed in the bar shows in the results.
    await browserPage.getByRole('button', { name: 'Find' }).click()
    await userEvent.fill(bar.querySelector('input')!, 'zzqqzz')
    await expect.poll(() => field.value).toBe('zzqqzz')
    await expect.poll(resultsCount).toBe('No results')
    await expect.poll(() => resultRows().length).toBe(0)
    // "No results" is the count's to say.
    expect(empty().hidden).toBe(true)

    await view.rerender({ field: false })
    await expect.poll(() => results.querySelector('input')).toBeNull()
    expect(results.querySelector('[role="search"]')).toBeNull()
    expect(resultsCount()).toBe('No results')
  })
})
