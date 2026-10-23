import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { rectFromQuad, type Quad } from '../../model/geometry'
import { writable } from '../../model/readable'
import { mountContainer, openFixtureInBrowser, settle, until } from '../test-utils'
import { createPageTransform } from '../transform'
import { mountViewer } from '../viewer-engine'

import { createSearchController } from './controller'
import { createSearchHighlights } from './highlights'

import type { SearchHit } from '../../model/search'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

async function setup(query = 'Inkbar') {
  const style = document.createElement('style')
  style.textContent = themeCss
  document.head.append(style)
  const doc = await openFixtureInBrowser('text-simple')
  const container = mountContainer(800, 600)
  const ref: { viewport?: ReturnType<typeof mountViewer>['viewport'] } = {}
  const search = createSearchController({
    document: writable(doc),
    viewport: () => ref.viewport,
    debounceMs: 0,
  })
  const engine = mountViewer({ container, document: doc, zoom: 1, search })
  ref.viewport = engine.viewport
  cleanup.push(() => {
    engine.destroy()
    search.destroy()
    doc.destroy()
    container.remove()
    style.remove()
  })
  await until(() => engine.pages.size > 0)
  await engine.pages.get(0)!.textLayer.ready
  search.open(query)
  await until(() => !search.state.get().scanning && search.state.get().hits.length > 0)
  const host = () => engine.viewport.hostFor(0)!
  const layer = () => host().querySelector<HTMLElement>('.ink-search-layer')!
  const boxes = () => [...layer().querySelectorAll<HTMLElement>('[data-search-hit]')]
  return { doc, engine, search, host, layer, boxes }
}

/** The text-layer span a hit box sits over: the one holding the box's centre. */
function spanUnder(box: HTMLElement, host: HTMLElement): DOMRect {
  const b = box.getBoundingClientRect()
  const cx = b.left + b.width / 2
  const cy = b.top + b.height / 2
  const spans = [...host.querySelectorAll<HTMLElement>('[data-ink-text-layer] span')]
  const hit = spans
    .map((s) => s.getBoundingClientRect())
    .find((r) => cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom)
  expect(hit, 'a text-layer span under the hit').toBeDefined()
  return hit as DOMRect
}

function expectOverText(box: HTMLElement, host: HTMLElement) {
  const b = box.getBoundingClientRect()
  const s = spanUnder(box, host)
  expect(b.left).toBeGreaterThanOrEqual(s.left - 1)
  expect(b.right).toBeLessThanOrEqual(s.right + 1)
  expect(b.top).toBeGreaterThanOrEqual(s.top - 1)
  expect(b.bottom).toBeLessThanOrEqual(s.bottom + 1)
}

describe('search highlights', () => {
  it('draws one box per quad and marks the current hit', async () => {
    const { search, layer, boxes } = await setup()
    const own = search.state.get().hits.filter((h) => h.page === 0)
    const quads = own.reduce((n, h) => n + h.quads.length, 0)
    expect(quads).toBeGreaterThan(0)
    expect(boxes()).toHaveLength(quads)
    expect(layer().getAttribute('aria-hidden')).toBe('true')
    expect(getComputedStyle(layer()).pointerEvents).toBe('none')
    expect(layer().querySelectorAll('[data-current]')).toHaveLength(
      search.state.get().hits[search.state.get().current]!.quads.length
    )
  })

  it('moves data-current with next()', async () => {
    const { search, boxes } = await setup('a')
    const onPage = search.state.get().hits.filter((h) => h.page === 0)
    expect(onPage.length).toBeGreaterThan(1)
    const marked = () => boxes().filter((b) => b.hasAttribute('data-current'))
    const before = marked()
    search.next()
    await settle()
    const { hits, current } = search.state.get()
    const hit = hits[current]!
    // The scan starts on page 0, which has more than one hit, so the step stays on it.
    expect(hit.page).toBe(0)
    expect(marked()).toHaveLength(hit.quads.length)
    expect(marked()).not.toEqual(before)
  })

  it('builds a page of hits once rather than once per hit', async () => {
    const { search, layer, boxes } = await setup()
    const draws: number[] = []
    const el = layer()
    const replace = el.replaceChildren.bind(el)
    el.replaceChildren = (...nodes) => {
      draws.push(nodes.length)
      replace(...nodes)
    }
    search.setQuery('a')
    await until(() => !search.state.get().scanning && search.state.get().hits.length > 0)
    const quads = search.state
      .get()
      .hits.filter((h) => h.page === 0)
      .reduce((n, h) => n + h.quads.length, 0)
    expect(quads).toBeGreaterThan(1)
    // Emptied for the new query, then drawn once with every hit on the page.
    expect(draws).toEqual([0, quads])
    expect(boxes()).toHaveLength(quads)
  })

  it('keeps each box over its text across zoom and rotation', async () => {
    const { engine, host, boxes } = await setup()
    expect(boxes().length).toBeGreaterThan(0)
    for (const box of boxes()) expectOverText(box, host())

    engine.viewport.setZoom(1.75)
    await settle(200)
    await engine.pages.get(0)!.textLayer.ready
    for (const box of boxes()) expectOverText(box, host())

    for (const rotation of [90, 180, 270] as const) {
      engine.viewport.setRotation(rotation)
      await settle(200)
      await engine.pages.get(0)!.textLayer.ready
      expect(boxes().length).toBeGreaterThan(0)
      for (const box of boxes()) expectOverText(box, host())
    }
  })

  it('empties the layers on close()', async () => {
    const { search, layer, boxes } = await setup()
    expect(boxes().length).toBeGreaterThan(0)
    search.close()
    await settle()
    expect(layer().children).toHaveLength(0)
  })

  it('sits before the overlay, and a click on a hit reaches what is under it', async () => {
    const { host, layer, boxes } = await setup()
    const overlay = host().querySelector<HTMLElement>('.ink-overlay')!
    expect(
      layer().compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    const b = boxes()[0]!.getBoundingClientRect()
    const x = b.left + b.width / 2
    const y = b.top + b.height / 2
    const top = document.elementFromPoint(x, y)
    expect(top).not.toBeNull()
    expect(layer().contains(top)).toBe(false)
    expect(host().contains(top)).toBe(true)
    const clicks: EventTarget[] = []
    const record = (e: Event) => clicks.push(e.target!)
    host().addEventListener('click', record)
    const t = (top as HTMLElement).getBoundingClientRect()
    await userEvent.click(top as HTMLElement, {
      position: { x: x - t.left, y: y - t.top },
    })
    host().removeEventListener('click', record)
    expect(clicks).toEqual([top])
  })

  it('clips a box to a quad that is not upright', async () => {
    const { doc, host } = await setup()
    const tilted = {
      p1: { x: 100, y: 120 },
      p2: { x: 140, y: 160 },
      p3: { x: 110, y: 110 },
      p4: { x: 150, y: 150 },
    }
    const upright = {
      p1: { x: 100, y: 220 },
      p2: { x: 160, y: 220 },
      p3: { x: 100, y: 210 },
      p4: { x: 160, y: 210 },
    }
    const hit = (quad: Quad): SearchHit => ({
      page: 0,
      start: 0,
      end: 1,
      text: 'x',
      quads: [quad],
      rect: rectFromQuad(quad),
      before: '',
      after: '',
    })
    const state = writable({
      open: true,
      query: 'x',
      matchCase: false,
      hits: [hit(tilted), hit(upright)],
      current: 0,
      scanning: false,
    })
    const layers = createSearchHighlights({ state })
    const el = document.createElement('div')
    host().append(el)
    const transform = createPageTransform(doc.pages[0]!, 1)
    const page = layers.mount(0, el, transform)
    const [a, b] = [...el.querySelectorAll<HTMLElement>('[data-search-hit]')]
    expect(a!.style.clipPath).toMatch(/^polygon\(/)
    expect(b!.style.clipPath).toBe('')
    // The polygon's corners are the quad's (p1, p2, p4, p3), as percentages of the box.
    const css = a!.style
    const [left, top, width, height] = [css.left, css.top, css.width, css.height].map(
      parseFloat
    )
    const corners = [tilted.p1, tilted.p2, tilted.p4, tilted.p3].map((p) =>
      transform.toCss(p)
    )
    const pct = css.clipPath
      .slice('polygon('.length, -1)
      .split(',')
      .map((pair) => pair.trim().split(/\s+/).map(parseFloat))
    expect(pct).toHaveLength(4)
    pct.forEach(([px, py], i) => {
      expect(left! + (px! / 100) * width!).toBeCloseTo(corners[i]!.x, 1)
      expect(top! + (py! / 100) * height!).toBeCloseTo(corners[i]!.y, 1)
    })
    page.destroy()
    layers.destroy()
    el.remove()
  })
})
