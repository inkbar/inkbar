import { generateLarge } from '@inkbar/fixtures/generate-large'
import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import themeCss from '@inkbar/theme/theme.css?inline'
import { run as runAxe } from 'axe-core'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { mountContainer, until } from '../test-utils'
import { createSearchButton } from '../viewer/controls'
import { createViewer, searchControllerOf, type Viewer } from '../viewer/create-viewer'

import { createFindBar } from './find-bar'

beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = themeCss
  document.head.append(style)
})

let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.forEach((f) => f())
  cleanup = []
  window.getSelection()?.removeAllRanges()
})

interface Setup {
  host: HTMLElement
  viewer: Viewer
  bar: HTMLElement | null
  field: () => HTMLInputElement
  count: () => string
  live: () => string
  scroll: HTMLElement
  outside: HTMLButtonElement
}

async function make(
  withBar = true,
  {
    source = fixtureUrl('text-simple'),
    width = 800,
  }: { source?: Uint8Array | string; width?: number } = {}
): Promise<Setup> {
  const host = mountContainer(width, 600)
  const outside = document.createElement('button')
  outside.textContent = 'Outside'
  host.before(outside)
  const viewer = createViewer(host, {
    source,
    assets: browserAssets(),
    zoom: 1,
  })
  cleanup.push(() => {
    viewer.destroy()
    host.remove()
    outside.remove()
  })
  const bar = withBar ? createFindBar(viewer) : null
  if (bar) viewer.element.querySelector('[data-ink-viewport-root]')!.append(bar)
  await until(() => viewer.status.get().state === 'ready' && viewer.engine.get() !== null)
  const scroll = viewer.element.querySelector<HTMLElement>('[data-ink-scroll]')!
  await until(() => !!viewer.engine.get()!.pages.get(0))
  await viewer.engine.get()!.pages.get(0)!.textLayer.ready
  const q = (sel: string) => viewer.element.querySelector<HTMLElement>(sel)
  return {
    host,
    viewer,
    bar,
    scroll,
    outside,
    field: () => q('[data-ink-find-bar] input') as HTMLInputElement,
    count: () => q('[data-ink-find-count]')?.textContent ?? '',
    live: () => q('[aria-live=polite][data-ink-find-status]')?.textContent ?? '',
  }
}

/** The bar registers when the observer sees it in the document, a microtask after it is added. */
const attached = (viewer: Viewer): Promise<void> =>
  until(() => searchControllerOf(viewer).barAttached.get())

/** Dispatches Ctrl+F (or Meta+F) at `target`; false when something prevented it. */
function findKey(target: Element, mod: 'ctrlKey' | 'metaKey' = 'ctrlKey'): boolean {
  return target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'f',
      [mod]: true,
      bubbles: true,
      cancelable: true,
    })
  )
}

describe('find bar', () => {
  it.each(['ctrlKey', 'metaKey'] as const)(
    '%s+F inside the root opens it, focuses the field and is prevented',
    async (mod) => {
      const { viewer, scroll, field, bar } = await make()
      await attached(viewer)
      expect(findKey(scroll, mod)).toBe(false)
      expect(viewer.search.state.get().open).toBe(true)
      expect(document.activeElement).toBe(field())
      expect(bar!.hidden).toBe(false)
    }
  )

  it('leaves the key to the browser with no bar mounted', async () => {
    const { viewer, scroll } = await make(false)
    expect(findKey(scroll)).toBe(true)
    expect(viewer.search.state.get().open).toBe(false)
  })

  it('leaves the key to the browser outside the viewer', async () => {
    const { viewer } = await make()
    await attached(viewer)
    const input = document.createElement('input')
    document.body.append(input)
    cleanup.push(() => input.remove())
    input.focus()
    expect(findKey(input)).toBe(true)
    expect(viewer.search.state.get().open).toBe(false)
  })

  it('opens only the viewer that has focus', async () => {
    const a = await make()
    const b = await make()
    await attached(a.viewer)
    await attached(b.viewer)
    expect(findKey(b.scroll)).toBe(false)
    expect(b.viewer.search.state.get().open).toBe(true)
    expect(a.viewer.search.state.get().open).toBe(false)
  })

  it('takes the page selection as the query', async () => {
    const { viewer, scroll, field } = await make()
    await attached(viewer)
    const span = [...viewer.element.querySelectorAll('[data-ink-text-layer] span')].find(
      (s) => s.textContent?.includes('QQ123456C')
    )!
    const range = document.createRange()
    const node = span.firstChild!
    const at = node.textContent!.indexOf('QQ123456C')
    range.setStart(node, at)
    range.setEnd(node, at + 'QQ123456C'.length)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    expect(findKey(scroll)).toBe(false)
    expect(viewer.search.state.get().query).toBe('QQ123456C')
    expect(field().value).toBe('QQ123456C')
    expect(document.activeElement).toBe(field())
  })

  it('counts, steps, wraps and announces', async () => {
    const { viewer, field, count, live } = await make()
    await attached(viewer)
    viewer.search.open()
    await userEvent.keyboard('QQ123456C')
    expect(field().value).toBe('QQ123456C')
    await until(() => count() === '1 of 3')
    await userEvent.keyboard('{Enter}')
    await until(() => count() === '2 of 3')
    await until(() => live() === 'Match 2 of 3, page 2')
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    await until(() => count() === '1 of 3')
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    await until(() => count() === '3 of 3')
    expect(live()).toBe('Match 3 of 3, page 3')
  })

  it('announces a step taken while the scan is still running, then the settled count', async () => {
    const { viewer, live } = await make(true, { source: await generateLarge(200) })
    await attached(viewer)
    viewer.search.open()
    await userEvent.keyboard('Page')
    await until(() => viewer.search.state.get().hits.length >= 2, 10_000)
    expect(viewer.search.state.get().scanning).toBe(true)
    await userEvent.keyboard('{Enter}')
    await until(() => live() !== '')
    expect(live()).toMatch(/^Match 2 of \d+ so far, page 2$/)
    await until(() => !viewer.search.state.get().scanning, 20_000)
    expect(live()).toBe('Match 2 of 200, page 2')
  })

  it('leaves a fully visible hit where it is and centres one off screen', async () => {
    const { viewer, scroll } = await make()
    await attached(viewer)
    scroll.scrollTop = 30
    await until(() => scroll.scrollTop === 30)
    const current = () => viewer.element.querySelector<HTMLElement>('[data-current]')
    viewer.search.open('QQ123456C')
    await until(() => !viewer.search.state.get().scanning && current() !== null)
    const view = scroll.getBoundingClientRect()
    const first = current()!.getBoundingClientRect()
    expect(first.top).toBeGreaterThanOrEqual(view.top)
    expect(first.bottom).toBeLessThanOrEqual(view.bottom)
    expect(scroll.scrollTop).toBe(30)

    viewer.search.next()
    expect(viewer.search.state.get().hits[viewer.search.state.get().current]!.page).toBe(
      1
    )
    await until(() => !!current()?.closest('[data-page="1"]'))
    const box = current()!.getBoundingClientRect()
    const middle = (box.top + box.bottom) / 2
    expect(Math.abs(middle - (view.top + scroll.clientHeight / 2))).toBeLessThan(2)
  })

  it('keeps the query and shows only the new hits after a document swap', async () => {
    const { viewer, field, count } = await make()
    await attached(viewer)
    viewer.search.open('QQ123456C')
    await until(() => count() === '1 of 3')
    await until(() => viewer.element.querySelectorAll('[data-search-hit]').length > 0)
    const before = viewer.document.get()
    viewer.open(fixtureUrl('mixed-page-sizes'))
    await until(
      () => viewer.document.get() !== before && viewer.status.get().state === 'ready'
    )
    const expected = await viewer.document.get()!.search('QQ123456C').all()
    await until(() => !viewer.search.state.get().scanning && viewer.engine.get() !== null)
    expect(field().value).toBe('QQ123456C')
    expect(viewer.search.state.get().hits).toEqual(expected)
    await until(
      () => count() === (expected.length ? `1 of ${expected.length}` : 'No results')
    )
    const pages = viewer.engine.get()!.pages
    await until(() => [...pages.keys()].length > 0)
    // Every box drawn belongs to a hit in the new document.
    const quads = expected
      .filter((h) => pages.has(h.page))
      .reduce((n, h) => n + h.quads.length, 0)
    await until(
      () => viewer.element.querySelectorAll('[data-search-hit]').length === quads
    )
  })

  it('fits inside a phone-width viewer', async () => {
    const { viewer, bar } = await make(true, { width: 360 })
    await attached(viewer)
    viewer.search.open('QQ123456C')
    const root = viewer.element
      .querySelector('[data-ink-viewport-root]')!
      .getBoundingClientRect()
    const box = bar!.getBoundingClientRect()
    expect(box.width).toBeGreaterThan(0)
    expect(box.left).toBeGreaterThanOrEqual(root.left)
    expect(box.right).toBeLessThanOrEqual(root.right)
  })

  it('shows "No results"', async () => {
    const { viewer, count, live } = await make()
    await attached(viewer)
    viewer.search.open()
    await userEvent.keyboard('zzz')
    await until(() => count() === 'No results')
    await until(() => live() === 'No results')
  })

  it('toggles match case from its button', async () => {
    const { viewer, bar } = await make()
    await attached(viewer)
    viewer.search.open()
    const toggle = bar!.querySelector<HTMLButtonElement>('[data-ink-find-match-case]')!
    expect(toggle.getAttribute('aria-label')).toBe('Match case')
    toggle.click()
    expect(viewer.search.state.get().matchCase).toBe(true)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })

  it('closes on Escape, clears highlights, returns focus and keeps the query', async () => {
    const { viewer, outside, field, bar } = await make()
    await attached(viewer)
    outside.focus()
    viewer.search.open('QQ123456C')
    expect(document.activeElement).toBe(field())
    await until(
      () =>
        !viewer.search.state.get().scanning &&
        viewer.element.querySelectorAll('[data-search-hit]').length > 0
    )
    await userEvent.keyboard('{Escape}')
    expect(viewer.search.state.get().open).toBe(false)
    expect(bar!.hidden).toBe(true)
    expect(viewer.element.querySelectorAll('[data-search-hit]').length).toBe(0)
    expect(document.activeElement).toBe(outside)
    viewer.search.open()
    expect(field().value).toBe('QQ123456C')
  })

  it('returns focus to the viewport when nothing had it', async () => {
    const { viewer, scroll } = await make()
    await attached(viewer)
    viewer.search.open()
    viewer.search.close()
    expect(document.activeElement).toBe(scroll)
  })

  it('leaves focus alone when closed from elsewhere', async () => {
    const { viewer, outside } = await make()
    await attached(viewer)
    viewer.search.open()
    outside.focus()
    viewer.search.close()
    expect(document.activeElement).toBe(outside)
  })

  it('presses the search button while open', async () => {
    const { viewer, bar, field } = await make()
    await until(() => viewer.document.get() !== null)
    const button = createSearchButton(viewer)
    cleanup.push(() => button.remove())
    document.body.append(button)
    expect(button.getAttribute('aria-label')).toBe('Find')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    button.click()
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(bar!.hidden).toBe(false)
    expect(document.activeElement).toBe(field())
    viewer.search.close()
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('passes axe while open', async () => {
    const { viewer, bar } = await make()
    await attached(viewer)
    viewer.search.open('QQ123456C')
    await until(() => !viewer.search.state.get().scanning)
    const results = await runAxe(bar!)
    expect(results.violations.map((v) => v.id)).toEqual([])
  })

  it('selects the new text when opened with a query from code', async () => {
    const { viewer, field } = await make()
    await attached(viewer)
    viewer.search.open('Inkbar')
    expect(document.activeElement).toBe(field())
    expect(field().value).toBe('Inkbar')
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, 6])
  })

  it('refocuses and selects the field on Ctrl+F while open, without a new search', async () => {
    const { viewer, scroll, field } = await make()
    await attached(viewer)
    viewer.search.open('Inkbar')
    await until(() => !viewer.search.state.get().scanning)
    const hits = viewer.search.state.get().hits
    scroll.focus()
    field().setSelectionRange(2, 2)
    expect(findKey(scroll)).toBe(false)
    expect(document.activeElement).toBe(field())
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, 6])
    expect(viewer.search.state.get().hits).toBe(hits)
    expect(viewer.search.state.get().scanning).toBe(false)
  })
})
