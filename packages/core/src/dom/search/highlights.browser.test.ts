import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, describe, expect, it } from 'vitest'

import { writable } from '../../model/readable'
import { mountContainer, openFixtureInBrowser, settle, until } from '../test-utils'
import { mountViewer } from '../viewer-engine'

import { createSearchController } from './controller'

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
    const hits = search.state.get().hits
    expect(hits.length).toBeGreaterThan(1)
    const currentIndex = () => boxes().findIndex((b) => b.hasAttribute('data-current'))
    const before = currentIndex()
    search.next()
    await settle()
    expect(currentIndex()).not.toBe(before)
    expect(boxes().filter((b) => b.hasAttribute('data-current'))).not.toHaveLength(0)
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

  it('sits before the overlay, and a click on a hit reaches the overlay', async () => {
    const { host, layer, boxes } = await setup()
    const overlay = host().querySelector('.ink-overlay')!
    expect(
      layer().compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    const b = boxes()[0]!.getBoundingClientRect()
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    expect(top).not.toBeNull()
    expect(layer().contains(top)).toBe(false)
  })
})
