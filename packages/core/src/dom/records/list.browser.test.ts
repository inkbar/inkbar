import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import themeCss from '@inkbar/theme/theme.css?inline'
import { run as runAxe } from 'axe-core'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { writable } from '../../model/readable'
import { definePlugin } from '../plugins/define'
import { createFindBar } from '../search/find-bar'
import { mountContainer, until } from '../test-utils'
import { createViewer, pluginHostOf } from '../viewer/create-viewer'

import { createRecordList, renderRecordList } from './list'
import { createSearchResults } from './search-results'
import { searchSource } from './source'

import type { Rect } from '../../model/geometry'
import type { RecordBase } from '../../model/records'
import type { SearchHit } from '../../model/search'
import type { SearchState, ViewerSearch } from '../search/controller'

beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = themeCss
  document.head.append(style)
})

let cleanup: (() => void)[] = []
afterEach(() => {
  vi.restoreAllMocks()
  cleanup.reverse().forEach((f) => f())
  cleanup = []
})

interface Finding extends RecordBase {
  page: number
  rect: Rect
  reason: string
  open: boolean
}

/** Findings down page 0, top to bottom: `f0` is first in reading order. */
const findings = (count: number): Finding[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `f${i}`,
    page: 0,
    rect: { x: 72, y: 740 - i * 22, width: 120, height: 14 },
    reason: `Finding ${i}`,
    open: true,
  }))

const review = definePlugin('sandbox', (plugin, opts: { initial: Finding[] }) => {
  const list = plugin.records<Finding>('findings', { initial: () => opts.initial })
  plugin.marks(list, {
    where: (f) => f.open,
    rect: (f) => f.rect,
    label: (f) => f.reason,
    card: (f) => ({
      title: f.reason,
      meta: `Page ${f.page + 1}`,
      actions: { Accept: () => list.update(f.id, { open: false }) },
    }),
  })
})

/** A box `height` px tall above a viewer, for a list or results panel. */
async function make(initial: Finding[] = findings(3), height = 240) {
  const box = document.createElement('div')
  box.style.cssText = `height:${height}px;width:280px;display:flex;flex-direction:column;`
  document.body.prepend(box)
  const host = mountContainer(800, 600)
  const viewer = createViewer(host, {
    source: fixtureUrl('text-simple'),
    assets: browserAssets(),
    zoom: 1,
    plugins: [review({ initial })],
  })
  cleanup.push(() => {
    viewer.destroy()
    host.remove()
    box.remove()
  })
  await until(() => viewer.viewport.get() !== null, 10_000)
  return { box, viewer }
}

async function makeList(initial?: Finding[], height?: number) {
  const { box, viewer } = await make(initial, height)
  const list = createRecordList(viewer, { records: 'sandbox.findings' })
  box.append(list)
  const row = (id: string) => list.querySelector<HTMLElement>(`[data-ink-record="${id}"]`)
  const markFor = (id: string) =>
    viewer.element.querySelector<HTMLButtonElement>(`button[data-record="${id}"]`)
  if (initial?.length !== 0) await until(() => markFor('f0') !== null)
  const selection = pluginHostOf(viewer).selection('sandbox.findings')
  return { box, viewer, list, row, markFor, selection }
}

/** Whether `el` lies inside the visible part of `scroller`. */
function inView(scroller: HTMLElement, el: HTMLElement | null): boolean {
  if (!el) return false
  const s = scroller.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  return r.top >= s.top - 1 && r.bottom <= s.bottom + 1
}

describe('createRecordList', () => {
  it('renders each record as a card in a list item', async () => {
    const { list, row } = await makeList()
    const ul = list.querySelector('ul')!
    expect(ul.classList.contains('ink-record-list')).toBe(true)
    expect(ul.getAttribute('role')).toBe('list')
    const rows = [...ul.children] as HTMLElement[]
    expect(rows.map((r) => r.dataset.inkRecord)).toEqual(['f0', 'f1', 'f2'])
    const card = row('f1')!.querySelector('.ink-card')!
    expect(row('f1')!.tagName).toBe('LI')
    expect(row('f1')!.classList.contains('ink-record')).toBe(true)
    expect(card.querySelector('.ink-card-title')!.textContent).toBe('Finding 1')
    expect(card.querySelector('.ink-card-meta')!.textContent).toBe('Page 1')
    expect(card.querySelector('.ink-card-actions button')!.textContent).toBe('Accept')
    expect(card.hasAttribute('role')).toBe(false)
    expect(list.querySelector('.ink-record-list-empty')!.hasAttribute('hidden')).toBe(
      true
    )
  })

  it('shows the empty text when nothing is listed', async () => {
    const { list } = await makeList([])
    const empty = list.querySelector<HTMLElement>('.ink-record-list-empty')!
    expect(empty.hidden).toBe(false)
    expect(empty.textContent).toBe('Nothing here yet.')
  })

  it('clicking a mark selects and scrolls to its row', async () => {
    const { list, row, markFor, selection } = await makeList(findings(20), 200)
    const scroller = list.querySelector<HTMLElement>('.ink-record-list')!
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight)
    expect(inView(scroller, row('f19'))).toBe(false)
    const pageY = window.scrollY
    await userEvent.click(markFor('f19')!)
    expect(selection.selected.get()).toBe('f19')
    expect(row('f19')!.getAttribute('aria-current')).toBe('true')
    await until(() => inView(scroller, row('f19')))
    expect(window.scrollY).toBe(pageY)
  })

  it('a mark selected while the list is hidden scrolls to its row once it shows', async () => {
    const { box, list, row, markFor, selection } = await makeList(findings(20), 200)
    const scroller = list.querySelector<HTMLElement>('.ink-record-list')!
    // As in a closed sidebar panel.
    box.style.display = 'none'
    await userEvent.click(markFor('f19')!)
    expect(selection.selected.get()).toBe('f19')
    await new Promise((resolve) => requestAnimationFrame(resolve))
    box.style.display = 'flex'
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight)
    await until(() => inView(scroller, row('f19')))
  })

  it('selecting a row marks the mark data-selected and does not open the popover', async () => {
    const { viewer, row, markFor, selection } = await makeList()
    const scrollToRect = vi.spyOn(viewer.viewport.get()!, 'scrollToRect')
    await userEvent.click(row('f1')!.querySelector('.ink-card-title')!)
    expect(selection.selected.get()).toBe('f1')
    expect(markFor('f1')!.hasAttribute('data-selected')).toBe(true)
    expect(row('f1')!.getAttribute('aria-current')).toBe('true')
    expect(row('f0')!.hasAttribute('aria-current')).toBe(false)
    expect(scrollToRect).toHaveBeenCalledWith(0, findings(3)[1]!.rect, expect.anything())
    expect(document.querySelector('[data-ink-popover]:not([hidden])')).toBeNull()
    expect(markFor('f1')!.getAttribute('aria-expanded')).toBe('false')
    // Focus stays in the list.
    expect(document.activeElement).toBe(row('f1'))
  })

  it('arrow keys move between rows; Escape clears selection', async () => {
    const { list, row, selection } = await makeList()
    // One Tab stop, on the first row with nothing selected.
    const stops = [...list.querySelectorAll<HTMLElement>('[data-ink-record]')].filter(
      (r) => r.tabIndex === 0
    )
    expect(stops).toEqual([row('f0')])
    row('f0')!.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(row('f1'))
    await userEvent.keyboard('{End}')
    expect(document.activeElement).toBe(row('f2'))
    await userEvent.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(row('f1'))
    expect(row('f1')!.tabIndex).toBe(0)
    expect(row('f0')!.tabIndex).toBe(-1)
    await userEvent.keyboard('{Enter}')
    expect(selection.selected.get()).toBe('f1')
    expect(document.activeElement).toBe(row('f1'))
    await userEvent.keyboard('{Escape}')
    expect(selection.selected.get()).toBeNull()
  })

  it('an action removes the row and focus moves to the next', async () => {
    const { viewer, row } = await makeList()
    const accept = row('f1')!.querySelector<HTMLButtonElement>(
      '.ink-card-actions button'
    )!
    await userEvent.click(accept)
    expect(row('f1')).toBeNull()
    expect(document.activeElement).toBe(row('f2'))
    expect(viewer.records<Finding>('sandbox.findings').find('f1')!.open).toBe(false)
  })

  it('announces the count when an action changes it', async () => {
    const { list, row } = await makeList()
    const live = list.querySelector<HTMLElement>('[aria-live="polite"]')!
    expect(live.textContent).toBe('')
    await userEvent.click(row('f0')!.querySelector('.ink-card-actions button')!)
    expect(live.textContent).toBe('2 items')
  })
})

describe('createSearchResults', () => {
  async function makeResults() {
    const { box, viewer } = await make([])
    const bar = createFindBar(viewer)
    viewer.element.querySelector('[data-ink-viewport-root]')!.append(bar)
    const results = createSearchResults(viewer)
    box.append(results)
    return { viewer, bar, results }
  }

  it('search results field shares the find bar state', async () => {
    const { viewer, bar, results } = await makeResults()
    const field = results.querySelector<HTMLInputElement>('input')!
    expect(field.getAttribute('aria-label')).toBe('Find in document')
    expect(field.placeholder).toBe('Search for a word or phrase')
    // The count is a footer under the cards.
    expect(results.lastElementChild!.hasAttribute('data-ink-search-results-count')).toBe(
      true
    )
    // A search icon sits before the field, in its input group.
    expect(field.previousElementSibling!.classList.contains('ink-input-accessory')).toBe(
      true
    )
    expect(results.querySelector('.ink-record-list-empty')!.textContent).toBe(
      'Search to list every match.'
    )
    await userEvent.type(field, 'Inkbar')
    await until(() => {
      const s = viewer.search.state.get()
      return s.query === 'Inkbar' && !s.scanning && s.hits.length > 0
    })
    const barCount = bar.querySelector('[data-ink-find-count]')!.textContent
    expect(bar.querySelector('input')!.value).toBe('Inkbar')
    expect(results.querySelector('[data-ink-search-results-count]')!.textContent).toBe(
      barCount
    )
    const rows = [...results.querySelectorAll<HTMLElement>('[data-ink-record]')]
    const { hits } = viewer.search.state.get()
    expect(rows).toHaveLength(hits.length)
    expect(rows[0]!.querySelector('.ink-card-excerpt mark')!.textContent).toBe(
      hits[0]!.text
    )
    expect(rows[0]!.querySelector('.ink-card-title')!.textContent).toBe(
      `Page ${hits[0]!.page + 1}`
    )
    expect(rows[0]!.querySelector('.ink-card-meta')!.textContent).toBe('Match 1')
    // The bar's current hit is the selected row, and choosing a row makes it current.
    expect(rows[0]!.getAttribute('aria-current')).toBe('true')
    expect(rows.length).toBeGreaterThan(1)
    await userEvent.click(rows[1]!.querySelector('.ink-card-title')!)
    expect(viewer.search.state.get().current).toBe(1)
    expect(bar.querySelector('[data-ink-find-count]')!.textContent).toMatch(/^2 of /)
    // A query typed in the bar shows in the panel.
    viewer.search.setQuery('zzqqzz')
    await until(() => !viewer.search.state.get().scanning)
    expect(field.value).toBe('zzqqzz')
    expect(results.querySelector('[data-ink-search-results-count]')!.textContent).toBe(
      'No results'
    )
    expect(results.querySelectorAll('[data-ink-record]')).toHaveLength(0)
  })

  it("keeps an existing row's card as a scan adds hits before it", () => {
    const hit = (page: number, start: number): SearchHit => ({
      page,
      start,
      end: start + 4,
      text: 'word',
      quads: [],
      rect: { x: start, y: 700, width: 10, height: 10 },
      exact: true,
      before: 'a ',
      after: ' b',
    })
    const later = [hit(2, 3)]
    const state = writable<SearchState>({
      open: true,
      query: 'word',
      matchCase: false,
      hits: later,
      current: 0,
      scanning: true,
    })
    const search = { state, select: vi.fn() } as unknown as ViewerSearch
    const rendered = renderRecordList(searchSource(search))
    document.body.append(rendered.element)
    cleanup.push(() => {
      rendered.destroy()
      rendered.element.remove()
    })
    const title = () =>
      rendered.element.querySelector('[data-ink-record="2:0"] .ink-card-title')
    const first = title()
    expect(first?.textContent).toBe('Page 3')
    state.set({ ...state.get(), hits: [hit(0, 1), ...later], current: 1 })
    expect(rendered.element.querySelectorAll('[data-ink-record]')).toHaveLength(2)
    expect(title()).toBe(first)
  })

  it('leaves the field out with field: false', async () => {
    const { box, viewer } = await make([])
    const results = createSearchResults(viewer, { field: false })
    box.append(results)
    expect(results.querySelector('input')).toBeNull()
  })
})

describe('accessibility', () => {
  it('axe finds no violations', async () => {
    const { list, row } = await makeList()
    await userEvent.click(row('f1')!.querySelector('.ink-card-title')!)
    expect((await runAxe(list)).violations.map((v) => v.id)).toEqual([])
    const empty = createRecordList((await make([])).viewer, {
      records: 'sandbox.findings',
    })
    document.body.append(empty)
    cleanup.push(() => empty.remove())
    expect((await runAxe(empty)).violations.map((v) => v.id)).toEqual([])

    const { box, viewer } = await make([])
    const results = createSearchResults(viewer)
    box.append(results)
    viewer.search.setQuery('Inkbar')
    await until(() => results.querySelector('[data-ink-record]') !== null)
    expect((await runAxe(results)).violations.map((v) => v.id)).toEqual([])
  })
})
