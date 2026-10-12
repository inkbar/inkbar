import { afterEach, describe, expect, it, vi } from 'vitest'

import { staticDefaults } from '../model/annotations/defaults'
import { createAnnotationStore } from '../model/annotations/store'

import { createOverlay } from './overlay'
import { mountContainer, openFixtureInBrowser } from './test-utils'
import { createPageTransform } from './transform'

import type { PageInfo } from '../model/pages'

const page: PageInfo = {
  index: 0,
  box: { x: 0, y: 0, width: 612, height: 792 },
  rotate: 0,
  userUnit: 1,
  width: 612,
  height: 792,
}
const quads = [
  {
    p1: { x: 72, y: 715 },
    p2: { x: 300, y: 715 },
    p3: { x: 72, y: 695 },
    p4: { x: 300, y: 695 },
  },
]
const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

function setup(zoom = 1) {
  const store = createAnnotationStore({
    mode: { mode: 'uncontrolled' },
    defaults: staticDefaults,
  })
  const host = mountContainer(612 * zoom, 792 * zoom)
  const onActivate = vi.fn()
  const overlay = createOverlay({
    host,
    page: 0,
    store,
    transform: createPageTransform(page, zoom, 0),
    onActivate,
  })
  cleanup.push(() => (overlay.destroy(), host.remove()))
  return { store, host, overlay, onActivate }
}

describe('createOverlay', () => {
  it('renders annotations for its page with the data-attribute contract and geometry', () => {
    const { store, host } = setup(2)
    const hl = store.add({ type: 'highlight', page: 0, quads, author: 'Ed' })
    store.add({ type: 'note', page: 1, rect: { x: 0, y: 0, width: 20, height: 20 } })
    const sugg = store.add({
      type: 'redact',
      page: 0,
      rect: { x: 72, y: 600, width: 100, height: 20 },
      origin: 'suggested',
      suggestion: { confidence: 0.42 },
    })
    const els = host.querySelectorAll('[data-annotation]')
    expect(els).toHaveLength(2)
    const el = host.querySelector(`[data-annotation="${hl.id}"]`) as HTMLElement
    expect(el.dataset.type).toBe('highlight')
    expect(el.dataset.state).toBe('idle')
    expect(el.dataset.source).toBe('session')
    expect(el.getAttribute('role')).toBe('button')
    expect(el.getAttribute('aria-label')).toBe('Highlight by Ed')
    expect(el.style.left).toBe('144px')
    expect(el.style.top).toBe(`${(792 - 715) * 2}px`)
    expect(el.style.width).toBe('456px')
    expect(el.querySelector('svg polygon')).not.toBeNull()
    const s = host.querySelector(`[data-annotation="${sugg.id}"]`) as HTMLElement
    expect(s.dataset.origin).toBe('suggested')
    expect(s.dataset.confidence).toBe('low')
  })

  it('reflects selection and hover in data-state and aria-pressed', () => {
    const { store, host } = setup()
    const a = store.add({
      type: 'note',
      page: 0,
      rect: { x: 10, y: 10, width: 20, height: 20 },
    })
    const el = host.querySelector(`[data-annotation="${a.id}"]`) as HTMLElement
    el.dispatchEvent(new PointerEvent('pointerenter'))
    expect(el.dataset.state).toBe('hover')
    store.select([a.id])
    expect(el.dataset.state).toBe('selected')
    expect(el.getAttribute('aria-pressed')).toBe('true')
    store.select([])
    el.dispatchEvent(new PointerEvent('pointerleave'))
    expect(el.dataset.state).toBe('idle')
  })

  it('keyboard: enter activates, delete removes unless locked, arrows move focus, escape clears', () => {
    const { store, host, onActivate } = setup()
    const top = store.add({
      type: 'note',
      page: 0,
      rect: { x: 10, y: 700, width: 20, height: 20 },
    })
    const bottom = store.add({
      type: 'note',
      page: 0,
      rect: { x: 10, y: 100, width: 20, height: 20 },
    })
    const locked = store.add({
      type: 'note',
      page: 0,
      rect: { x: 300, y: 100, width: 20, height: 20 },
    })
    store.update(locked.id, { locked: true })
    const topEl = host.querySelector(`[data-annotation="${top.id}"]`) as HTMLElement
    topEl.focus()
    topEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(store.selection.get()).toEqual([top.id])
    expect(onActivate).toHaveBeenCalledWith(top.id)
    topEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement?.getAttribute('data-annotation')).toBe(bottom.id)
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
    expect(store.selection.get()).toEqual([])
    const lockedEl = host.querySelector(`[data-annotation="${locked.id}"]`) as HTMLElement
    expect(lockedEl.dataset.locked).toBe('')
    lockedEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    expect(store.get(locked.id)).toBeDefined()
    topEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    expect(store.get(top.id)).toBeUndefined()
    expect(host.querySelector(`[data-annotation="${top.id}"]`)).toBeNull()
  })

  it('update re-projects geometry and custom annotations get no default content', () => {
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const host = mountContainer(612, 792)
    const overlay = createOverlay({
      host,
      page: 0,
      store,
      transform: createPageTransform(page, 1, 0),
      isCustom: (a) => a.type === 'note',
    })
    cleanup.push(() => (overlay.destroy(), host.remove()))
    const a = store.add({
      type: 'note',
      page: 0,
      rect: { x: 100, y: 100, width: 20, height: 20 },
    })
    const el = overlay.elementFor(a.id)!
    expect(el.dataset.custom).toBe('')
    expect(el.childElementCount).toBe(0)
    overlay.update(createPageTransform(page, 2, 0))
    expect(el.style.left).toBe('200px')
  })

  it('primary pointerdown selects and activates without reaching the page root', () => {
    const { store, host, overlay, onActivate } = setup()
    const a = store.add({
      type: 'note',
      page: 0,
      rect: { x: 10, y: 10, width: 20, height: 20 },
    })
    const onRoot = vi.fn()
    host.addEventListener('pointerdown', onRoot)
    const el = overlay.elementFor(a.id)!
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2 }))
    expect(store.selection.get()).toEqual([])
    expect(onActivate).not.toHaveBeenCalled()
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    expect(store.selection.get()).toEqual([a.id])
    expect(onActivate).toHaveBeenCalledWith(a.id)
    expect(onRoot).toHaveBeenCalledTimes(1)
  })

  it('space activates; roving tabindex follows selection on this page', () => {
    const { store, overlay, onActivate } = setup()
    const a = store.add({
      type: 'note',
      page: 0,
      rect: { x: 10, y: 10, width: 20, height: 20 },
    })
    const b = store.add({
      type: 'note',
      page: 0,
      rect: { x: 100, y: 10, width: 20, height: 20 },
    })
    const other = store.add({
      type: 'note',
      page: 1,
      rect: { x: 10, y: 10, width: 20, height: 20 },
    })
    const ea = overlay.elementFor(a.id)!
    const eb = overlay.elementFor(b.id)!
    expect([ea.tabIndex, eb.tabIndex]).toEqual([0, 0])
    store.select([other.id])
    expect([ea.tabIndex, eb.tabIndex]).toEqual([0, 0])
    eb.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(store.selection.get()).toEqual([b.id])
    expect(onActivate).toHaveBeenCalledWith(b.id)
    expect([ea.tabIndex, eb.tabIndex]).toEqual([-1, 0])
    expect(ea.getAttribute('aria-pressed')).toBe('false')
  })

  it('orders arrow navigation top to bottom, then left to right, in user space', () => {
    const { store, overlay } = setup()
    const right = store.add({
      type: 'note',
      page: 0,
      rect: { x: 300, y: 400, width: 20, height: 20 },
    })
    const bottom = store.add({
      type: 'note',
      page: 0,
      rect: { x: 10, y: 100, width: 20, height: 20 },
    })
    const left = store.add({
      type: 'note',
      page: 0,
      rect: { x: 10, y: 400, width: 20, height: 20 },
    })
    const top = store.add({
      type: 'note',
      page: 0,
      rect: { x: 500, y: 700, width: 20, height: 20 },
    })
    const focused = () => document.activeElement?.getAttribute('data-annotation')
    overlay.elementFor(top.id)!.focus()
    const seen = [focused()]
    for (let i = 0; i < 4; i++) {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
      )
      seen.push(focused())
    }
    expect(seen).toEqual([top.id, left.id, right.id, bottom.id, bottom.id])
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
    )
    expect(focused()).toBe(right.id)
    // Tab order matches reading order too.
    const order = [...overlay.element.querySelectorAll('[data-annotation]')].map((e) =>
      e.getAttribute('data-annotation')
    )
    expect(order).toEqual([top.id, left.id, right.id, bottom.id])
  })

  it('keeps focus on a surviving neighbour when the focused annotation is removed', () => {
    const { store, overlay } = setup()
    const a = store.add({
      type: 'note',
      page: 0,
      rect: { x: 10, y: 700, width: 20, height: 20 },
    })
    const b = store.add({
      type: 'note',
      page: 0,
      rect: { x: 10, y: 400, width: 20, height: 20 },
    })
    overlay.elementFor(a.id)!.focus()
    store.remove(a.id)
    expect(document.activeElement).toBe(overlay.elementFor(b.id))
  })

  it('expresses visuals as SVG attributes and scales strokes with zoom', () => {
    const { store, overlay } = setup(2)
    const sq = store.add({
      type: 'square',
      page: 0,
      rect: { x: 100, y: 100, width: 50, height: 50 },
      strokeWidth: 3,
    })
    const ink = store.add({
      type: 'ink',
      page: 0,
      paths: [
        [
          { x: 10, y: 10 },
          { x: 40, y: 40 },
        ],
      ],
      strokeWidth: 2,
    })
    const el = overlay.elementFor(sq.id)!
    expect(el.querySelector('rect')?.getAttribute('stroke-width')).toBe('6')
    expect(
      overlay.elementFor(ink.id)!.querySelector('polyline')?.getAttribute('stroke-width')
    ).toBe('4')
    for (const node of overlay.element.querySelectorAll('[data-annotation] *')) {
      expect(node.getAttribute('style')).toBeNull()
    }
    expect(el.style.cssText).toMatch(
      /^position: absolute; pointer-events: auto; left: [\d.]+px; top: [\d.]+px; width: [\d.]+px; height: [\d.]+px;$/
    )
    overlay.update(createPageTransform(page, 1, 0))
    expect(el.querySelector('rect')?.getAttribute('stroke-width')).toBe('3')
  })

  it('renders free text with its font size as a custom property and alignment as an attribute', () => {
    const { store, overlay } = setup(2)
    const a = store.add({
      type: 'freeText',
      page: 0,
      rect: { x: 100, y: 100, width: 200, height: 50 },
      text: 'Hello',
      fontSize: 12,
      align: 'center',
    })
    const text = overlay.elementFor(a.id)!.querySelector('.ink-free-text') as HTMLElement
    expect(text.textContent).toBe('Hello')
    expect(text.style.getPropertyValue('--ink-font-size')).toBe('24px')
    expect(text.style.fontSize).toBe('')
    expect(text.style.textAlign).toBe('')
    expect(text.dataset.align).toBe('center')
  })

  it('destroy removes the container and stops listening', () => {
    const { store, host, overlay } = setup()
    overlay.destroy()
    expect(host.querySelector('.ink-overlay')).toBeNull()
    const a = store.add({
      type: 'note',
      page: 0,
      rect: { x: 10, y: 10, width: 20, height: 20 },
    })
    expect(overlay.elementFor(a.id)).toBeUndefined()
  })

  it('gives embedded annotations geometry and chrome but draws nothing over the canvas', async () => {
    const doc = await openFixtureInBrowser('annotated-markup')
    const info = doc.pages[0]!
    const transform = createPageTransform(info, 1.5, 0)
    const host = mountContainer(transform.cssWidth, transform.cssHeight)
    const overlay = createOverlay({ host, page: 0, store: doc.annotations, transform })
    cleanup.push(() => (overlay.destroy(), host.remove(), doc.destroy()))
    const embedded = doc.annotations.byPage(0)
    expect(embedded.length).toBeGreaterThan(0)
    for (const a of embedded) {
      const el = overlay.elementFor(a.id)!
      const box = transform.toCssRect(a.rect)
      expect(el.dataset.source).toBe('pdf')
      expect(el.dataset.locked).toBe('')
      expect(parseFloat(el.style.left)).toBeCloseTo(box.left)
      expect(parseFloat(el.style.top)).toBeCloseTo(box.top)
      expect(parseFloat(el.style.width)).toBeCloseTo(box.width)
      expect(parseFloat(el.style.height)).toBeCloseTo(box.height)
      expect(el.childElementCount).toBe(0)
      expect(el.querySelector('svg')).toBeNull()
    }
  })
})
