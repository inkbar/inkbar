import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, describe, expect, it, vi } from 'vitest'

import standardCallout from '../model/annotations/__fixtures__/standard-callout.json'
import { freeTextBox } from '../model/annotations/callout'
import { staticDefaults } from '../model/annotations/defaults'
import { isTextMarkup } from '../model/annotations/edit'
import { importAnnotations } from '../model/annotations/json'
import { createAnnotationStore } from '../model/annotations/store'
import { renderRegion } from '../pdfjs/render-region'

import { createOverlay } from './overlay'
import { createPageMount } from './page-mount'
import { mountContainer, openFixtureInBrowser, TEXT_LAYER_CSS } from './test-utils'
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
    store.add({ type: 'text', page: 1, rect: { x: 0, y: 0, width: 20, height: 20 } })
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
      type: 'text',
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
      type: 'text',
      page: 0,
      rect: { x: 10, y: 700, width: 20, height: 20 },
    })
    const bottom = store.add({
      type: 'text',
      page: 0,
      rect: { x: 10, y: 100, width: 20, height: 20 },
    })
    const locked = store.add({
      type: 'text',
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
      isCustom: (a) => a.type === 'text',
    })
    cleanup.push(() => (overlay.destroy(), host.remove()))
    const a = store.add({
      type: 'text',
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
      type: 'text',
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
      type: 'text',
      page: 0,
      rect: { x: 10, y: 10, width: 20, height: 20 },
    })
    const b = store.add({
      type: 'text',
      page: 0,
      rect: { x: 100, y: 10, width: 20, height: 20 },
    })
    const other = store.add({
      type: 'text',
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
      type: 'text',
      page: 0,
      rect: { x: 300, y: 400, width: 20, height: 20 },
    })
    const bottom = store.add({
      type: 'text',
      page: 0,
      rect: { x: 10, y: 100, width: 20, height: 20 },
    })
    const left = store.add({
      type: 'text',
      page: 0,
      rect: { x: 10, y: 400, width: 20, height: 20 },
    })
    const top = store.add({
      type: 'text',
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
      type: 'text',
      page: 0,
      rect: { x: 10, y: 700, width: 20, height: 20 },
    })
    const b = store.add({
      type: 'text',
      page: 0,
      rect: { x: 10, y: 400, width: 20, height: 20 },
    })
    overlay.elementFor(a.id)!.focus()
    store.remove(a.id)
    expect(document.activeElement).toBe(overlay.elementFor(b.id))
  })

  it('moves focus to the scroll element when the last annotation on the page is removed', () => {
    const { store, host, overlay } = setup()
    // The viewport container the page host lives in, focusable like InkViewport's.
    const scroll = document.createElement('div')
    scroll.dataset.inkViewport = ''
    scroll.tabIndex = 0
    document.body.append(scroll)
    scroll.append(host)
    cleanup.push(() => scroll.remove())
    const only = store.add({
      type: 'text',
      page: 0,
      rect: { x: 10, y: 700, width: 20, height: 20 },
    })
    const el = overlay.elementFor(only.id)!
    el.focus()
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    expect(store.get(only.id)).toBeUndefined()
    expect(document.activeElement).toBe(scroll)
  })

  it('makes a scroll container without tabindex focusable before falling back to it', () => {
    const { store, host, overlay } = setup()
    const scroll = document.createElement('div')
    scroll.dataset.inkViewport = ''
    document.body.append(scroll)
    scroll.append(host)
    cleanup.push(() => scroll.remove())
    expect(scroll.hasAttribute('tabindex')).toBe(false)
    const only = store.add({
      type: 'text',
      page: 0,
      rect: { x: 10, y: 700, width: 20, height: 20 },
    })
    overlay.elementFor(only.id)!.focus()
    store.remove(only.id)
    expect(scroll.tabIndex).toBe(-1)
    expect(document.activeElement).toBe(scroll)
  })

  it('expresses visuals as SVG attributes and scales strokes with zoom', () => {
    const { store, overlay } = setup(2)
    const sq = store.add({
      type: 'square',
      page: 0,
      rect: { x: 100, y: 100, width: 50, height: 50 },
      width: 3,
    })
    const ink = store.add({
      type: 'ink',
      page: 0,
      inklist: [
        [
          { x: 10, y: 10 },
          { x: 40, y: 40 },
        ],
      ],
      width: 2,
    })
    const el = overlay.elementFor(sq.id)!
    expect(el.querySelector('rect')?.getAttribute('stroke-width')).toBe('6')
    const inkEl = overlay.elementFor(ink.id)!
    expect(inkEl.querySelector('polyline')).toBeNull()
    const stroke = inkEl.querySelector('path.ink-stroke')!
    expect(stroke.getAttribute('fill')).toBe(ink.color)
    // The 30pt diagonal is 60 CSS px at zoom 2 (the outline ends short of the endpoints).
    expect((stroke as SVGGraphicsElement).getBBox().height).toBeGreaterThan(50)
    // A level stroke's outline is as tall as its width: 2pt at zoom 2 is 4 CSS px.
    const level = store.add({
      type: 'ink',
      page: 0,
      inklist: [
        [
          { x: 100, y: 300 },
          { x: 200, y: 300 },
        ],
      ],
      width: 2,
    })
    const levelStroke = overlay
      .elementFor(level.id)!
      .querySelector<SVGGraphicsElement>('path.ink-stroke')!
    expect(levelStroke.getBBox().height).toBeCloseTo(4, 0)
    store.add({
      type: 'freetext',
      page: 0,
      rect: { x: 300, y: 300, width: 100, height: 40 },
      contents: 'Hi',
    })
    store.add({ type: 'text', page: 0, rect: { x: 400, y: 400, width: 20, height: 20 } })
    // Descendants carry no inline style, except `pointer-events` (and the FreeText custom
    // properties) on the HTML children the overlay creates.
    for (const node of overlay.element.querySelectorAll('[data-annotation] *')) {
      const style = node.getAttribute('style')
      if (style === null) continue
      expect(node).toBeInstanceOf(HTMLElement)
      expect(style.replace(/--ink-[\w-]+:[^;]*;\s*/g, '').trim()).toBe(
        'pointer-events: auto;'
      )
    }
    expect(el.style.cssText).toMatch(
      /^position: absolute; left: [\d.]+px; top: [\d.]+px; width: [\d.]+px; height: [\d.]+px; pointer-events: none;$/
    )
    overlay.update(createPageTransform(page, 1, 0))
    expect(el.querySelector('rect')?.getAttribute('stroke-width')).toBe('3')
  })

  it('renders free text with its font size as a custom property and alignment as an attribute', () => {
    const { store, overlay } = setup(2)
    const a = store.add({
      type: 'freetext',
      page: 0,
      rect: { x: 100, y: 100, width: 200, height: 50 },
      contents: 'Hello',
      defaultStyle: { fontSize: 12, textAlign: 'center' },
    })
    const text = overlay.elementFor(a.id)!.querySelector('.ink-free-text') as HTMLElement
    expect(text.textContent).toBe('Hello')
    expect(text.style.getPropertyValue('--ink-font-size')).toBe('24px')
    expect(text.style.fontSize).toBe('')
    expect(text.style.textAlign).toBe('')
    expect(text.dataset.align).toBe('center')
    expect(text.style.getPropertyValue('--ink-font-family')).toBe('"Helvetica"')
    expect(text.style.getPropertyValue('--ink-text-color')).toBe(
      staticDefaults.color('freetext')
    )
  })

  it('freetext renders fill, border, dashes and defaultStyle (bold, italic, underline, justify)', () => {
    const style = document.createElement('style')
    style.textContent = themeCss
    document.head.append(style)
    cleanup.push(() => style.remove())
    const { store, overlay, host } = setup(2)
    const a = store.add({
      type: 'freetext',
      page: 0,
      rect: { x: 100, y: 100, width: 200, height: 50 },
      contents: 'Styled',
      color: '#FFFF00',
      borderColor: '#FF0000',
      width: 2,
      dashes: [3, 3],
      cornerRadius: 4,
      defaultStyle: {
        color: '#0000FF',
        textAlign: 'justify',
        fontWeight: 'bold',
        fontStyle: 'italic',
        textDecoration: 'underline',
      },
    })
    const text = overlay.elementFor(a.id)!.querySelector('.ink-free-text') as HTMLElement
    const cs = getComputedStyle(text)
    expect(cs.backgroundColor).toBe('rgb(255, 255, 0)')
    expect(cs.borderTopColor).toBe('rgb(255, 0, 0)')
    expect(cs.borderTopWidth).toBe('4px')
    expect(cs.borderTopStyle).toBe('dashed')
    expect(cs.borderTopLeftRadius).toBe('8px')
    expect(cs.color).toBe('rgb(0, 0, 255)')
    expect(cs.fontWeight).toBe('700')
    expect(cs.fontStyle).toBe('italic')
    expect(cs.textDecorationLine).toBe('underline')
    expect(cs.textAlign).toBe('justify')
    expect(cs.boxSizing).toBe('border-box')

    // No fill, no border, no text style: transparent, borderless, normal.
    const plain = store.add({
      type: 'freetext',
      page: 0,
      rect: { x: 100, y: 300, width: 200, height: 50 },
      contents: 'Plain',
    })
    const p = getComputedStyle(
      overlay.elementFor(plain.id)!.querySelector('.ink-free-text') as HTMLElement
    )
    expect(p.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(p.borderTopStyle).toBe('none')

    // A border with no colour of its own takes the text colour, as a bubble's outline does,
    // not the interface's border token from the root.
    host.dataset.inkRoot = ''
    const bordered = store.add({
      type: 'freetext',
      page: 0,
      rect: { x: 100, y: 500, width: 200, height: 50 },
      contents: 'Bordered',
      width: 1,
      defaultStyle: { color: '#00FF00' },
    })
    const b = getComputedStyle(
      overlay.elementFor(bordered.id)!.querySelector('.ink-free-text') as HTMLElement
    )
    expect(b.borderTopColor).toBe('rgb(0, 255, 0)')
    expect(p.fontWeight).toBe('400')
    expect(p.fontStyle).toBe('normal')
    expect(p.textDecorationLine).toBe('none')
    expect(p.textAlign).toBe('left')
  })

  it('draws a standard callout: the box inset by its fringe and a leader line to the tip', () => {
    const style = document.createElement('style')
    style.textContent = themeCss
    document.head.append(style)
    cleanup.push(() => style.remove())
    const { store, overlay, host } = setup(2)
    const t = createPageTransform(page, 2, 0)
    const result = importAnnotations(store, JSON.stringify(standardCallout), {
      mode: 'replace',
    })
    expect(result.errors).toEqual([])
    const a = store.get('standard-callout-1')!
    if (a.type !== 'freetext') throw new Error('expected free text')
    const el = overlay.elementFor(a.id)!
    // The element covers the whole rect, leader line included.
    const rect = t.toCssRect(a.rect)
    expect(parseFloat(el.style.left)).toBeCloseTo(rect.left)
    expect(parseFloat(el.style.width)).toBeCloseTo(rect.width)

    const line = el.querySelector('polyline.ink-callout-line')!
    const points = line
      .getAttribute('points')!
      .split(' ')
      .map((p) => p.split(',').map(Number))
    expect(points).toHaveLength(3)
    a.callout!.forEach((p, i) => {
      const c = t.toCss(p)
      expect(points[i]![0]).toBeCloseTo(c.x - rect.left)
      expect(points[i]![1]).toBeCloseTo(c.y - rect.top)
    })
    // No border colour and no border: the text colour at 1 pt.
    expect(line.getAttribute('stroke')).toBe('#D00000')
    expect(line.getAttribute('stroke-width')).toBe(String(t.toCssLength(1)))
    expect(line.getAttribute('stroke-linecap')).toBe('butt')
    const ending = el.querySelector('path[data-ending="head"]')!
    expect(ending.getAttribute('d')).not.toBe('')
    expect(ending.getAttribute('fill')).toBe('none')

    const text = el.querySelector('.ink-free-text') as HTMLElement
    const at = text.getBoundingClientRect()
    const origin = host.getBoundingClientRect()
    const box = t.toCssRect(freeTextBox(a))
    expect(at.left - origin.left).toBeCloseTo(box.left)
    expect(at.top - origin.top).toBeCloseTo(box.top)
    expect(at.width).toBeCloseTo(box.width)
    expect(at.height).toBeCloseTo(box.height)

    // The line takes presses as well as the box; the empty rest of the rect does not.
    const bend = t.toCss(a.callout![1]!)
    expect(document.elementFromPoint(origin.left + bend.x, origin.top + bend.y)).toBe(
      line
    )
    const box2 = text.getBoundingClientRect()
    expect(
      document.elementFromPoint(box2.left + 4, box2.top + 4)?.closest('.ink-free-text')
    ).toBe(text)
    const empty = t.toCss({ x: 270, y: 530 })
    expect(
      document
        .elementFromPoint(origin.left + empty.x, origin.top + empty.y)
        ?.closest('[data-annotation]')
    ).toBeNull()
  })

  const bubble = {
    type: 'freetext',
    page: 0,
    rect: { x: 100, y: 300, width: 120, height: 60 },
    contents: 'Hi',
    intent: 'FreeTextCallout',
    cornerRadius: 8,
    width: 1,
    callout: [
      { x: 106, y: 276 },
      { x: 130, y: 300 },
    ],
  } as const

  it('bubble renders one path for box and tail', () => {
    const { store, overlay } = setup()
    const a = store.add({ ...bubble, callout: [...bubble.callout] })
    const el = overlay.elementFor(a.id)!
    const paths = el.querySelectorAll('svg path')
    expect(paths).toHaveLength(1)
    expect(paths[0]!.classList.contains('ink-bubble')).toBe(true)
    expect(el.querySelector('svg')!.querySelectorAll('*')).toHaveLength(1)
    // The text box is a later sibling, so it paints above the outline.
    const [first, second] = [...el.children]
    expect(first!.tagName.toLowerCase()).toBe('svg')
    expect(second).toBe(el.querySelector('.ink-free-text'))
    expect(second!.textContent).toBe('Hi')
    // The path reaches the tip (6, 24 px below the box's bottom edge in css).
    const d = paths[0]!.getAttribute('d')!
    expect(d).toContain('6 84')
    // The text box draws neither fill nor border: the path does.
    const text = second as HTMLElement
    expect(text.dataset.border).toBeUndefined()
    expect(text.style.getPropertyValue('--ink-fill')).toBe('')
  })

  it('border and fill colour apply to the bubble outline and inside', () => {
    const { store, overlay } = setup()
    const a = store.add({
      ...bubble,
      callout: [...bubble.callout],
      borderColor: '#FF0000',
      color: '#FFFF00',
      width: 2,
      dashes: [3, 3],
    })
    const path = overlay.elementFor(a.id)!.querySelector('path.ink-bubble')!
    expect(path.getAttribute('stroke')).toBe('#FF0000')
    expect(path.getAttribute('fill')).toBe('#FFFF00')
    expect(path.getAttribute('stroke-width')).toBe('2')
    expect(path.getAttribute('stroke-dasharray')).toBe('3 3')
    const none = store.add({ ...bubble, callout: [...bubble.callout], width: 0 })
    const plain = overlay.elementFor(none.id)!.querySelector('path.ink-bubble')!
    expect(plain.getAttribute('fill')).toBe('none')
    expect(plain.getAttribute('stroke')).toBe('none')
  })

  it('a free-text box with a callout but no bubble intent stays a plain box', () => {
    const { store, overlay } = setup()
    const a = store.add({ ...bubble, intent: undefined, callout: [...bubble.callout] })
    expect(overlay.elementFor(a.id)!.querySelector('path.ink-bubble')).toBeNull()
  })

  it('destroy removes the container and stops listening', () => {
    const { store, host, overlay } = setup()
    overlay.destroy()
    expect(host.querySelector('.ink-overlay')).toBeNull()
    const a = store.add({
      type: 'text',
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
      // Nothing drawn: only the invisible hit area, which follows the quads, and the comment
      // marker on commented markup, which PDF.js does not paint.
      const commented = isTextMarkup(a) && !!a.contents?.trim()
      expect(el.childElementCount).toBe(commented ? 2 : 1)
      expect(el.querySelectorAll('.ink-comment-marker')).toHaveLength(commented ? 1 : 0)
      const hit = el.firstElementChild as SVGElement
      expect(hit.dataset.inkHit).toBe('')
      expect(hit.querySelectorAll('polygon')).toHaveLength(
        'quads' in a && a.quads ? a.quads.length : 0
      )
      for (const shape of hit.children) {
        expect(shape.getAttribute('fill')).toBe('transparent')
        expect(shape.getAttribute('stroke')).toBe('none')
        expect(shape.getAttribute('pointer-events')).toBe('all')
      }
    }
    // A click on the hit area selects the embedded item (text markup: on the release).
    const target = embedded[0]!
    const poly = overlay.elementFor(target.id)!.querySelector('polygon')!
    const r = poly.getBoundingClientRect()
    const hitEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    expect(hitEl).toBe(poly)
    hitEl!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    hitEl!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }))
    expect(doc.annotations.selection.get()).toEqual([target.id])
  })

  it('hit-tests by shape: a press between the lines of a highlight reaches the page', async () => {
    const doc = await openFixtureInBrowser('text-simple')
    const transform = createPageTransform(doc.pages[0]!, 1, 0)
    const host = mountContainer(transform.cssWidth, transform.cssHeight)
    const onActivate = vi.fn()
    const overlay = createOverlay({
      host,
      page: 0,
      store: doc.annotations,
      transform,
      onActivate,
    })
    cleanup.push(() => (overlay.destroy(), host.remove(), doc.destroy()))
    const { items } = await doc.text(0)
    const first = items.find((i) => i.str.startsWith('Hello'))!
    const second = items.find((i) => i.str.startsWith('National Insurance'))!
    const hl = doc.annotations.add({
      type: 'highlight',
      page: 0,
      quads: [first.quad, second.quad],
    })
    const onRoot = vi.fn()
    host.addEventListener('pointerdown', onRoot)
    const click = (x: number, y: number) => {
      const r = host.getBoundingClientRect()
      const target = document.elementFromPoint(r.left + x, r.top + y)!
      const init = { bubbles: true, button: 0, clientX: r.left + x, clientY: r.top + y }
      target.dispatchEvent(new PointerEvent('pointerdown', init))
      target.dispatchEvent(new PointerEvent('pointerup', init))
      return target
    }
    // Between the bottom of line one and the top of line two, inside the highlight's box.
    const gapTop = transform.toCssRect(first.rect)
    const gapBottom = transform.toCssRect(second.rect)
    const gapY = (gapTop.top + gapTop.height + gapBottom.top) / 2
    expect(gapBottom.top).toBeGreaterThan(gapTop.top + gapTop.height)
    const box = transform.toCssRect(hl.rect)
    expect(gapY).toBeGreaterThan(box.top)
    expect(gapY).toBeLessThan(box.top + box.height)
    const x = gapTop.left + 5
    expect(overlay.elementFor(hl.id)!.contains(click(x, gapY))).toBe(false)
    expect(doc.annotations.selection.get()).toEqual([])
    expect(onRoot).toHaveBeenCalledTimes(1)
    // A click on the first line's polygon selects and activates it. The press itself goes on
    // to the page: until the release it may still be a text drag.
    const onLine = click(x, gapTop.top + gapTop.height / 2)
    expect(onLine.tagName).toBe('polygon')
    expect(doc.annotations.selection.get()).toEqual([hl.id])
    expect(onActivate).toHaveBeenCalledWith(hl.id)
    expect(onRoot).toHaveBeenCalledTimes(2)
  })

  it('marks the overlay root and keeps custom elements hittable as a whole', () => {
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
      isCustom: (a) => a.type === 'text',
    })
    cleanup.push(() => (overlay.destroy(), host.remove()))
    expect(host.querySelector('[data-ink-overlay]')).toBe(overlay.element)
    const custom = store.add({
      type: 'text',
      page: 0,
      rect: { x: 100, y: 100, width: 20, height: 20 },
    })
    const drawn = store.add({ type: 'highlight', page: 0, quads })
    expect(overlay.elementFor(custom.id)!.style.pointerEvents).toBe('auto')
    expect(overlay.elementFor(drawn.id)!.style.pointerEvents).toBe('none')
  })

  it('leaves keys and presses on custom slot content to that content', () => {
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const host = mountContainer(612, 792)
    const onActivate = vi.fn()
    const overlay = createOverlay({
      host,
      page: 0,
      store,
      transform: createPageTransform(page, 1, 0),
      onActivate,
      isCustom: () => true,
    })
    cleanup.push(() => (overlay.destroy(), host.remove()))
    const a = store.add({
      type: 'text',
      page: 0,
      rect: { x: 100, y: 100, width: 40, height: 40 },
    })
    const el = overlay.elementFor(a.id)!
    // What a host's slot would put inside the custom element.
    const button = document.createElement('button')
    const input = document.createElement('input')
    el.append(button, input)
    const onRoot = vi.fn()
    host.addEventListener('pointerdown', onRoot)

    for (const key of ['Enter', ' ']) {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      button.dispatchEvent(e)
      expect(e.defaultPrevented).toBe(false)
    }
    const back = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    })
    input.dispatchEvent(back)
    expect(back.defaultPrevented).toBe(false)
    expect(store.get(a.id)).toBeDefined()
    expect(store.selection.get()).toEqual([])
    expect(onActivate).not.toHaveBeenCalled()

    const onOverlayRoot = vi.fn()
    overlay.element.addEventListener('pointerdown', onOverlayRoot)
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    expect(store.selection.get()).toEqual([])
    expect(onActivate).not.toHaveBeenCalled()
    // The press bubbles on, so delegated handlers above the slot content see it.
    expect(onOverlayRoot).toHaveBeenCalledTimes(1)
    expect(onRoot).toHaveBeenCalledTimes(1)

    // A press on the element itself is still kept from the page root.
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    expect(store.selection.get()).toEqual([a.id])
    expect(onRoot).toHaveBeenCalledTimes(1)
    store.select([])
    onActivate.mockClear()

    // The element itself still behaves as before.
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(store.selection.get()).toEqual([a.id])
    expect(onActivate).toHaveBeenCalledWith(a.id)
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    expect(store.get(a.id)).toBeUndefined()
  })
  it('gives a horizontal line a box padded by its stroke, so it draws and is hittable', () => {
    const { store, host, overlay, onActivate } = setup(2)
    const line = store.add({
      type: 'line',
      page: 0,
      start: { x: 100, y: 700 },
      end: { x: 200, y: 700 },
      width: 2,
    })
    expect(line.rect.height).toBe(0)
    const el = overlay.elementFor(line.id)!
    // 2pt at zoom 2 = 4px of stroke: 2px of padding on each side.
    expect(el.style.left).toBe('198px')
    expect(el.style.top).toBe(`${(792 - 700) * 2 - 2}px`)
    expect(el.style.width).toBe('204px')
    expect(el.style.height).toBe('4px')
    const svg = el.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 204 4')
    const polyline = svg.querySelector('polyline')!
    expect(polyline.getAttribute('points')).toBe('2,2 202,2')
    // Within the window, so elementFromPoint can see it.
    const h = host.getBoundingClientRect()
    const hit = document.elementFromPoint(h.left + 300, h.top + (792 - 700) * 2)
    expect(hit).toBe(polyline)
    hit!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    expect(store.selection.get()).toEqual([line.id])
    expect(onActivate).toHaveBeenCalledWith(line.id)
  })

  it('dashed square renders stroke-dasharray in css px', () => {
    const { store, overlay } = setup(2)
    const sq = store.add({
      type: 'square',
      page: 0,
      rect: { x: 50, y: 500, width: 100, height: 60 },
      dashes: [3, 3],
    })
    const rect = overlay.elementFor(sq.id)!.querySelector('rect')!
    expect(rect.getAttribute('stroke-dasharray')).toBe('6 6')
    store.update(sq.id, { dashes: undefined })
    expect(
      overlay.elementFor(sq.id)!.querySelector('rect')!.hasAttribute('stroke-dasharray')
    ).toBe(false)
  })

  it('a note with an icon name Inkbar does not know still draws the note icon', () => {
    const { store, overlay } = setup()
    const note = store.add({
      type: 'text',
      page: 0,
      rect: { x: 100, y: 100, width: 20, height: 20 },
      icon: 'Check',
    })
    const icon = overlay.elementFor(note.id)!.querySelector('.ink-note-icon')
    expect(icon).not.toBeNull()
    expect((icon as HTMLElement).dataset.icon).toBe('Check')
  })

  it('a line ending with a name Inkbar does not know draws no ending and keeps the name', () => {
    const { store, overlay } = setup()
    const line = store.add({
      type: 'line',
      page: 0,
      start: { x: 100, y: 700 },
      end: { x: 200, y: 700 },
      width: 2,
      tail: 'Wobble',
    })
    expect(
      overlay.elementFor(line.id)!.querySelectorAll('path[data-ending]')
    ).toHaveLength(0)
    expect(store.list.get()[0]).toMatchObject({ tail: 'Wobble' })
  })

  it('line tail openArrow renders an arrowhead path', () => {
    const { store, overlay } = setup()
    const line = store.add({
      type: 'line',
      page: 0,
      start: { x: 100, y: 700 },
      end: { x: 200, y: 700 },
      width: 2,
      tail: 'OpenArrow',
    })
    const el = overlay.elementFor(line.id)!
    const heads = el.querySelectorAll('path[data-ending]')
    expect(heads).toHaveLength(1)
    expect((heads[0] as SVGElement).dataset.ending).toBe('tail')
    expect(heads[0]!.getAttribute('d')).toMatch(/^M/)
    // Padded for the arrowhead: wider than the line's own 100px.
    expect(parseFloat(el.style.width)).toBeGreaterThan(100)
  })

  it('draws butt and slash endings with square-cut caps, others round', () => {
    const { store, overlay } = setup()
    const line = store.add({
      type: 'line',
      page: 0,
      start: { x: 100, y: 700 },
      end: { x: 200, y: 700 },
      width: 2,
      head: 'Butt',
      tail: 'Slash',
    })
    const cap = (id: string, end: string) =>
      overlay
        .elementFor(id)!
        .querySelector(`path[data-ending="${end}"]`)!
        .getAttribute('stroke-linecap')
    expect(cap(line.id, 'head')).toBe('butt')
    expect(cap(line.id, 'tail')).toBe('butt')
    store.update(line.id, { head: 'OpenArrow' })
    expect(cap(line.id, 'head')).toBe('round')
  })

  it('polyline head renders', () => {
    const { store, overlay } = setup()
    const pl = store.add({
      type: 'polyline',
      page: 0,
      vertices: [
        { x: 100, y: 700 },
        { x: 150, y: 650 },
        { x: 200, y: 700 },
      ],
      head: 'ClosedArrow',
    })
    const el = overlay.elementFor(pl.id)!
    expect(el.querySelectorAll('path[data-ending="head"]')).toHaveLength(1)
    expect(el.querySelectorAll('path[data-ending="tail"]')).toHaveLength(0)
  })

  it('pads even a zero-width stroke to a 1px box', () => {
    const { store, overlay } = setup()
    const v = store.add({
      type: 'line',
      page: 0,
      start: { x: 100, y: 100 },
      end: { x: 100, y: 200 },
      width: 0,
    })
    const el = overlay.elementFor(v.id)!
    expect(el.style.width).toBe('1px')
    expect(el.style.height).toBe('101px')
  })
  it('pads session ink once, from its path bounds, whatever its derived rect', () => {
    const { store, overlay } = setup()
    const ink = store.add({
      type: 'ink',
      page: 0,
      inklist: [
        [
          { x: 10, y: 10 },
          { x: 40, y: 40 },
        ],
      ],
      width: 2,
    })
    // The store's derived rect already carries half the stroke...
    expect(ink.rect).toEqual({ x: 9, y: 9, width: 32, height: 32 })
    // ...and the element is the path bounds (10..40) padded by 1px, not padded again.
    const el = overlay.elementFor(ink.id)!
    expect(el.style.left).toBe('9px')
    expect(el.style.top).toBe(`${792 - 40 - 1}px`)
    expect(el.style.width).toBe('32px')
    expect(el.style.height).toBe('32px')
  })

  it('keeps custom elements on the annotation rect, unpadded', () => {
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const host = mountContainer(612, 792)
    const transform = createPageTransform(page, 2, 0)
    const overlay = createOverlay({
      host,
      page: 0,
      store,
      transform,
      isCustom: () => true,
    })
    cleanup.push(() => (overlay.destroy(), host.remove()))
    for (const a of [
      store.add({
        type: 'line',
        page: 0,
        start: { x: 100, y: 300 },
        end: { x: 200, y: 300 },
        width: 3,
      }),
      store.add({
        type: 'ink',
        page: 0,
        inklist: [
          [
            { x: 10, y: 10 },
            { x: 40, y: 40 },
          ],
        ],
        width: 2,
      }),
    ]) {
      const el = overlay.elementFor(a.id)!
      const box = transform.toCssRect(a.rect)
      expect([el.style.left, el.style.top, el.style.width, el.style.height]).toEqual(
        [box.left, box.top, box.width, box.height].map((n) => `${n}px`)
      )
    }
  })

  it('Shift+Arrow nudges a focused annotation 1 pt in user space, Shift+Alt+Arrow 10 pt', () => {
    const { store, host } = setup(2)
    const a = store.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    const el = host.querySelector(`[data-annotation="${a.id}"]`) as HTMLElement
    el.focus()
    const key = (k: string, init: KeyboardEventInit = {}) =>
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
      )
    key('ArrowRight', { shiftKey: true })
    expect(store.get(a.id)!.rect).toEqual({ x: 101, y: 600, width: 50, height: 30 })
    // Up is +y in user space.
    key('ArrowUp', { shiftKey: true })
    expect(store.get(a.id)!.rect).toEqual({ x: 101, y: 601, width: 50, height: 30 })
    key('ArrowLeft', { shiftKey: true, altKey: true })
    key('ArrowDown', { shiftKey: true, altKey: true })
    expect(store.get(a.id)!.rect).toEqual({ x: 91, y: 591, width: 50, height: 30 })
    // Drawn where the store says, through the transform (zoom 2).
    expect(el.style.left).toBe('182px')
    expect(document.activeElement).toBe(el)

    // Text marks move their quads with the rect.
    const hl = store.add({ type: 'highlight', page: 0, quads })
    const hlEl = host.querySelector(`[data-annotation="${hl.id}"]`) as HTMLElement
    hlEl.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })
    )
    const moved = store.get(hl.id)
    if (moved?.type === 'highlight') expect(moved.quads[0]!.p1).toEqual({ x: 73, y: 715 })

    // Locked items ignore it.
    store.update(a.id, { locked: true })
    key('ArrowRight', { shiftKey: true })
    expect(store.get(a.id)!.rect.x).toBe(91)
  })

  it('Ctrl/Meta+Shift+Arrow resizes a rect-shaped annotation by 1 pt, never below 1 pt', () => {
    const { store, host } = setup()
    const a = store.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 2, height: 2 },
    })
    const el = host.querySelector(`[data-annotation="${a.id}"]`) as HTMLElement
    const key = (k: string, init: KeyboardEventInit) =>
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, shiftKey: true, bubbles: true, ...init })
      )
    key('ArrowRight', { ctrlKey: true })
    expect(store.get(a.id)!.rect).toEqual({ x: 100, y: 600, width: 3, height: 2 })
    // Down grows downwards: the top edge (y + height) stays.
    key('ArrowDown', { metaKey: true })
    expect(store.get(a.id)!.rect).toEqual({ x: 100, y: 599, width: 3, height: 3 })
    key('ArrowLeft', { ctrlKey: true })
    key('ArrowLeft', { ctrlKey: true })
    key('ArrowLeft', { ctrlKey: true })
    key('ArrowUp', { ctrlKey: true })
    key('ArrowUp', { ctrlKey: true })
    key('ArrowUp', { ctrlKey: true })
    expect(store.get(a.id)!.rect).toEqual({ x: 100, y: 601, width: 1, height: 1 })

    // A note icon and a text mark are not rect-shaped: no resize.
    const note = store.add({
      type: 'text',
      page: 0,
      rect: { x: 10, y: 10, width: 20, height: 20 },
    })
    host.querySelector(`[data-annotation="${note.id}"]`)!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        shiftKey: true,
        ctrlKey: true,
        bubbles: true,
      })
    )
    expect(store.get(note.id)!.rect.width).toBe(20)

    store.update(a.id, { locked: true })
    key('ArrowRight', { ctrlKey: true })
    expect(store.get(a.id)!.rect.width).toBe(1)
  })

  it('arrows without Shift still move focus and leave geometry alone', () => {
    const { store, host } = setup()
    const top = store.add({
      type: 'redact',
      page: 0,
      rect: { x: 10, y: 700, width: 20, height: 20 },
    })
    const bottom = store.add({
      type: 'redact',
      page: 0,
      rect: { x: 10, y: 100, width: 20, height: 20 },
    })
    const topEl = host.querySelector(`[data-annotation="${top.id}"]`) as HTMLElement
    topEl.focus()
    topEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement?.getAttribute('data-annotation')).toBe(bottom.id)
    expect(store.get(top.id)!.rect.y).toBe(700)
  })

  it('draws corner handles on a selected, unlocked rect-shaped annotation only', () => {
    const { store, host } = setup()
    // Handles need the select tool on the tool root; the controller would set this.
    const toolRoot = document.createElement('div')
    toolRoot.dataset.inkTool = 'select'
    document.body.append(toolRoot)
    toolRoot.append(host)
    cleanup.push(() => toolRoot.remove())
    const area = store.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    const text = store.add({ type: 'redact', page: 0, quads })
    const note = store.add({
      type: 'text',
      page: 0,
      rect: { x: 10, y: 10, width: 20, height: 20 },
    })
    const handles = (id: string) =>
      [...host.querySelectorAll(`[data-annotation="${id}"] > .ink-handle`)].map(
        (h) => (h as HTMLElement).dataset.handle
      )
    expect(handles(area.id)).toEqual([])
    store.select([area.id, text.id, note.id])
    expect(handles(area.id)).toEqual(['nw', 'ne', 'sw', 'se'])
    expect(handles(text.id)).toEqual([])
    expect(handles(note.id)).toEqual([])
    const se = host.querySelector(
      `[data-annotation="${area.id}"] > [data-handle="se"]`
    ) as HTMLElement
    expect(se.style.pointerEvents).toBe('auto')
    expect(se.style.width).toBe('8px')
    // A redraw (new geometry) keeps them.
    store.update(area.id, { rect: { x: 100, y: 600, width: 60, height: 30 } })
    expect(handles(area.id)).toHaveLength(4)
    store.update(area.id, { locked: true })
    expect(handles(area.id)).toEqual([])
    store.update(area.id, { locked: false })
    store.select([])
    expect(handles(area.id)).toEqual([])
  })

  describe('press rule', () => {
    /** A real page (canvas, text layer, overlay) of `text-simple` at zoom 1. */
    async function mountPage() {
      const style = document.createElement('style')
      style.textContent = TEXT_LAYER_CSS
      document.head.append(style)
      const doc = await openFixtureInBrowser('text-simple')
      const transform = createPageTransform(doc.pages[0]!, 1, 0)
      const host = mountContainer(transform.cssWidth, transform.cssHeight)
      const onActivate = vi.fn()
      const mount = createPageMount({
        document: doc,
        page: 0,
        host,
        transform,
        store: doc.annotations,
        onActivate,
      })
      cleanup.push(() => {
        mount.destroy()
        host.remove()
        doc.destroy()
        style.remove()
        window.getSelection()?.removeAllRanges()
      })
      await mount.textLayer.ready
      const { items } = await doc.text(0)
      const first = items.find((i) => i.str.startsWith('Hello'))!
      return { doc, host, transform, onActivate, overlay: mount.overlay, first }
    }

    const fire = (
      target: Element,
      type: 'pointerdown' | 'pointermove' | 'pointerup',
      clientX: number,
      clientY: number
    ) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          clientX,
          clientY,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          pointerId: 1,
          isPrimary: true,
        })
      )

    it('a drag across a highlight selects text, not the highlight', async () => {
      const { doc, host, transform, first } = await mountPage()
      const hl = doc.annotations.add({ type: 'highlight', page: 0, quads: [first.quad] })
      const box = transform.toCssRect(first.rect)
      const r = host.getBoundingClientRect()
      const x = r.left + box.left + 4
      const y = r.top + box.top + box.height / 2
      const target = document.elementFromPoint(x, y)!
      expect(target.tagName).toBe('polygon')
      expect(target.closest('[data-annotation]')?.getAttribute('data-annotation')).toBe(
        hl.id
      )
      fire(target, 'pointerdown', x, y)
      expect(doc.annotations.selection.get()).toEqual([])
      fire(target, 'pointermove', x + 20, y)
      fire(target, 'pointermove', x + 40, y)
      fire(target, 'pointerup', x + 40, y)
      expect(doc.annotations.selection.get()).toEqual([])
      expect(window.getSelection()?.toString()).not.toBe('')
    })

    it('a press inside a mask reaches the text layer', async () => {
      const { doc, host, transform, first } = await mountPage()
      const { x, y, width, height } = first.rect
      doc.annotations.add({
        type: 'mask',
        page: 0,
        rect: { x: x - 40, y: y - 40, width: width + 80, height: height + 80 },
        shape: 'rect',
      })
      const box = transform.toCssRect(first.rect)
      const r = host.getBoundingClientRect()
      const target = document.elementFromPoint(
        r.left + box.left + 4,
        r.top + box.top + box.height / 2
      )!
      expect(target.closest('[data-annotation]')).toBeNull()
      expect(target.closest('.ink-text-layer')).not.toBeNull()
    })

    it('a click on a highlight selects and activates it', async () => {
      const { doc, host, transform, onActivate, first } = await mountPage()
      const hl = doc.annotations.add({ type: 'highlight', page: 0, quads: [first.quad] })
      const box = transform.toCssRect(first.rect)
      const r = host.getBoundingClientRect()
      const x = r.left + box.left + 4
      const y = r.top + box.top + box.height / 2
      const target = document.elementFromPoint(x, y)!
      fire(target, 'pointerdown', x, y)
      // Nothing yet: the press might still become a text drag.
      expect(doc.annotations.selection.get()).toEqual([])
      expect(onActivate).not.toHaveBeenCalled()
      fire(target, 'pointermove', x + 2, y)
      fire(target, 'pointerup', x + 2, y)
      expect(doc.annotations.selection.get()).toEqual([hl.id])
      expect(onActivate).toHaveBeenCalledWith(hl.id)
    })

    it('a press on a filled square selects it immediately', async () => {
      const { doc, host, transform, onActivate } = await mountPage()
      const sq = doc.annotations.add({
        type: 'square',
        page: 0,
        rect: { x: 300, y: 300, width: 60, height: 40 },
        interiorColor: '#00ff00',
      })
      const box = transform.toCssRect(sq.rect)
      const r = host.getBoundingClientRect()
      const x = r.left + box.left + box.width / 2
      const y = r.top + box.top + box.height / 2
      const target = document.elementFromPoint(x, y)!
      expect(target.closest('[data-annotation]')?.getAttribute('data-annotation')).toBe(
        sq.id
      )
      fire(target, 'pointerdown', x, y)
      expect(doc.annotations.selection.get()).toEqual([sq.id])
      expect(onActivate).toHaveBeenCalledWith(sq.id)
    })
  })
})

describe('loupe', () => {
  /** An overlay over `name`'s first page with the document, at a device pixel ratio of 1. */
  async function mountLoupePage(
    name: 'text-simple' | 'text-rotated-90' = 'text-simple',
    zoom = 1,
    rotation: 0 | 90 | 180 | 270 = 0
  ) {
    const doc = await openFixtureInBrowser(name)
    const transform = createPageTransform(doc.pages[0]!, zoom, rotation)
    const host = mountContainer(transform.cssWidth, transform.cssHeight)
    const getPage = vi.spyOn(doc._pdfjs, 'getPage')
    const overlay = createOverlay({
      host,
      page: 0,
      store: doc.annotations,
      transform,
      document: doc,
      devicePixelRatio: 1,
    })
    cleanup.push(() => {
      overlay.destroy()
      host.remove()
      void doc.destroy()
    })
    return { doc, host, overlay, transform, getPage }
  }

  const lens = (host: HTMLElement) =>
    host.querySelector<HTMLCanvasElement>('[data-annotation] canvas[data-ink-loupe]')

  const dark = (c: HTMLCanvasElement): number => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i]! < 128) n++
    return n
  }

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

  it('loupe shows a circular canvas magnifying the content under its centre', async () => {
    const { doc, host, getPage } = await mountLoupePage()
    const loupe = doc.annotations.add({
      type: 'loupe',
      page: 0,
      rect: { x: 60, y: 680, width: 80, height: 80 },
    })
    const el = host.querySelector<HTMLElement>(`[data-annotation="${loupe.id}"]`)!
    expect(el.dataset.type).toBe('loupe')
    expect(el.getAttribute('aria-label')).toBe('Loupe')
    const canvas = lens(host)!
    expect(canvas).not.toBeNull()
    expect(canvas.style.clipPath).toMatch(/^circle\(/)
    // The rim is the annotation's colour and width, drawn over the canvas.
    const rim = el.querySelector('svg circle')!
    expect(rim.getAttribute('stroke')).toBe(loupe.color)
    expect(rim.getAttribute('stroke-width')).toBe('2')
    expect(
      canvas.compareDocumentPosition(rim) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    await expect.poll(() => canvas.width).toBe(80)
    expect(canvas.height).toBe(80)
    expect(dark(canvas)).toBeGreaterThan(0)

    // Same pixels as the 40pt square under the centre, rendered at twice the zoom.
    const expected = document.createElement('canvas')
    await renderRegion(doc, 0, { x: 80, y: 700, width: 40, height: 40 }, 2, expected)
    const a = canvas.getContext('2d')!.getImageData(0, 0, 80, 80).data
    const b = expected.getContext('2d')!.getImageData(0, 0, 80, 80).data
    let diff = 0
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i]! - b[i]!)
    expect(diff / a.length).toBeLessThan(4)

    // A move re-renders, debounced: nothing at once, one render after the pause.
    const before = getPage.mock.calls.length
    doc.annotations.update(loupe.id, { rect: { x: 300, y: 300, width: 80, height: 80 } })
    doc.annotations.update(loupe.id, { rect: { x: 310, y: 300, width: 80, height: 80 } })
    expect(getPage.mock.calls.length).toBe(before)
    expect(lens(host)).toBe(canvas)
    await expect.poll(() => getPage.mock.calls.length).toBe(before + 1)
    await wait(150)
    expect(getPage.mock.calls.length).toBe(before + 1)
    expect(lens(host)).toBe(canvas)
  })

  it('loupe re-renders when the device pixel ratio changes', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio')
    const setDpr = (value: number) =>
      Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true })
    cleanup.push(() => {
      if (original) Object.defineProperty(window, 'devicePixelRatio', original)
      else delete (window as { devicePixelRatio?: number }).devicePixelRatio
    })
    // A controllable stand-in for the resolution media queries.
    const listeners = new Map<string, Set<() => void>>()
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation((media) => {
      const set = listeners.get(media) ?? new Set<() => void>()
      listeners.set(media, set)
      return {
        media,
        matches: true,
        addEventListener: (_: string, fn: () => void) => set.add(fn),
        removeEventListener: (_: string, fn: () => void) => set.delete(fn),
      } as unknown as MediaQueryList
    })
    cleanup.unshift(() => matchMedia.mockRestore())
    setDpr(1)
    const doc = await openFixtureInBrowser('text-simple')
    const transform = createPageTransform(doc.pages[0]!, 1, 0)
    const host = mountContainer(transform.cssWidth, transform.cssHeight)
    const overlay = createOverlay({
      host,
      page: 0,
      store: doc.annotations,
      transform,
      document: doc,
    })
    cleanup.push(() => {
      overlay.destroy()
      host.remove()
      void doc.destroy()
    })
    doc.annotations.add({
      type: 'loupe',
      page: 0,
      rect: { x: 60, y: 680, width: 80, height: 80 },
      magnification: 2,
    })
    const canvas = lens(host)!
    await expect.poll(() => canvas.width).toBe(80)
    setDpr(2)
    for (const fn of listeners.get('(resolution: 1dppx)') ?? []) fn()
    await expect.poll(() => canvas.width).toBe(160)
    overlay.destroy()
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true)
  })

  it('loupe re-renders debounced on zoom', async () => {
    const { doc, host, overlay, getPage } = await mountLoupePage()
    doc.annotations.add({
      type: 'loupe',
      page: 0,
      rect: { x: 60, y: 680, width: 80, height: 80 },
      magnification: 3,
    })
    const canvas = lens(host)!
    await expect.poll(() => canvas.width).toBe(80)
    await wait(150)
    const before = getPage.mock.calls.length
    for (const zoom of [1.25, 1.5, 2])
      overlay.update(createPageTransform(doc.pages[0]!, zoom, 0))
    expect(getPage.mock.calls.length).toBe(before)
    // The old bitmap stretches with the element until the new one lands.
    expect(canvas.style.width).toBe('100%')
    await expect.poll(() => canvas.width).toBe(160)
    await wait(150)
    expect(getPage.mock.calls.length).toBe(before + 1)
  })

  it.each([0, 270] as const)(
    'magnifies the region as the page shows it on a /Rotate 90 page at view rotation %i',
    async (view) => {
      const { doc, host, transform } = await mountLoupePage('text-rotated-90', 1, view)
      doc.annotations.add({
        type: 'loupe',
        page: 0,
        rect: { x: 60, y: 680, width: 80, height: 80 },
      })
      const canvas = lens(host)!
      await expect.poll(() => canvas.width).toBe(80)
      const expected = document.createElement('canvas')
      const region = { x: 80, y: 700, width: 40, height: 40 }
      await renderRegion(doc, 0, region, 2, expected, undefined, transform.totalRotation)
      const a = canvas.getContext('2d')!.getImageData(0, 0, 80, 80).data
      const b = expected.getContext('2d')!.getImageData(0, 0, 80, 80).data
      let diff = 0
      for (let i = 0; i < a.length; i++) diff += Math.abs(a[i]! - b[i]!)
      expect(dark(canvas)).toBeGreaterThan(0)
      expect(diff / a.length).toBeLessThan(4)
    }
  )

  it('draws only the rim without a document, and drops the canvas when removed', () => {
    const { store, host } = setup()
    const loupe = store.add({
      type: 'loupe',
      page: 0,
      rect: { x: 60, y: 680, width: 80, height: 80 },
    })
    const el = host.querySelector<HTMLElement>(`[data-annotation="${loupe.id}"]`)!
    expect(el.querySelector('svg circle')).not.toBeNull()
    expect(lens(host)).toBeNull()
    store.remove(loupe.id)
    expect(host.querySelector('[data-annotation]')).toBeNull()
  })

  it('a page mount passes its document, so its loupes magnify', async () => {
    const doc = await openFixtureInBrowser('text-simple')
    const transform = createPageTransform(doc.pages[0]!, 1, 0)
    const host = mountContainer(transform.cssWidth, transform.cssHeight)
    const mount = createPageMount({
      document: doc,
      page: 0,
      host,
      transform,
      store: doc.annotations,
      devicePixelRatio: 2,
    })
    cleanup.push(() => {
      mount.destroy()
      host.remove()
      void doc.destroy()
    })
    doc.annotations.add({
      type: 'loupe',
      page: 0,
      rect: { x: 60, y: 680, width: 80, height: 80 },
    })
    const canvas = lens(host)!
    // Device pixels: the element's 80 CSS px at a ratio of 2.
    await expect.poll(() => canvas.width).toBe(160)
  })
})

describe('mask', () => {
  const SVG_NS = 'http://www.w3.org/2000/svg'

  /** An overlay over `name`'s first page, at `zoom` and a view `rotation`. */
  async function mountMaskPage(
    name: 'text-simple' | 'text-rotated-90' = 'text-simple',
    zoom = 1,
    rotation: 0 | 90 | 180 | 270 = 0
  ) {
    const doc = await openFixtureInBrowser(name)
    const transform = createPageTransform(doc.pages[0]!, zoom, rotation)
    const host = mountContainer(transform.cssWidth, transform.cssHeight)
    const overlay = createOverlay({ host, page: 0, store: doc.annotations, transform })
    cleanup.push(() => {
      overlay.destroy()
      host.remove()
      void doc.destroy()
    })
    return { doc, host, overlay, transform }
  }

  const layer = (host: HTMLElement) =>
    host.querySelector<SVGSVGElement>('svg[data-ink-mask-layer]')

  /** Numbers of a path's data, in order. */
  const numbers = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)

  it('mask layer covers the page minus the shape with an even-odd path at dim opacity', async () => {
    const { doc, host, overlay } = await mountMaskPage('text-simple', 2)
    expect(layer(host)).toBeNull()
    const mask = doc.annotations.add({
      type: 'mask',
      page: 0,
      rect: { x: 100, y: 500, width: 200, height: 100 },
      shape: 'rect',
      dim: 0.7,
    })
    const svg = layer(host)!
    // Above the page canvas and text layer, below the annotation overlay, and never a target.
    expect(svg.namespaceURI).toBe(SVG_NS)
    expect(svg.nextElementSibling).toBe(overlay.element)
    expect(svg.style.pointerEvents).toBe('none')
    expect(svg.getAttribute('width')).toBe('1224')
    expect(svg.getAttribute('height')).toBe('1584')
    const paths = svg.querySelectorAll('path')
    expect(paths).toHaveLength(1)
    const path = paths[0]!
    expect(path.getAttribute('fill-rule')).toBe('evenodd')
    expect(path.getAttribute('fill')).toBe(mask.color)
    expect(path.getAttribute('fill-opacity')).toBe('0.7')
    // The page outline, then the shape's: css (200, 384) to (600, 584) at 2x.
    expect(numbers(path.getAttribute('d')!)).toEqual([
      0, 0, 1224, 0, 1224, 1584, 0, 1584, 200, 384, 600, 384, 600, 584, 200, 584,
    ])

    // A change to the mask redraws it; removing it removes the layer.
    doc.annotations.update(mask.id, { dim: 0.2, shape: 'ellipse' })
    const ellipse = layer(host)!.querySelector('path')!
    expect(ellipse.getAttribute('fill-opacity')).toBe('0.2')
    expect(ellipse.getAttribute('d')).toMatch(/A/)
    expect(ellipse.getAttribute('fill-rule')).toBe('evenodd')
    doc.annotations.remove(mask.id)
    expect(layer(host)).toBeNull()
  })

  it('mask only covers its own page and follows zoom', async () => {
    const { doc, host, overlay } = await mountMaskPage()
    doc.annotations.add({
      type: 'mask',
      page: 1,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      shape: 'rect',
    })
    expect(layer(host)).toBeNull()
    doc.annotations.add({
      type: 'mask',
      page: 0,
      rect: { x: 100, y: 500, width: 200, height: 100 },
      shape: 'rect',
    })
    overlay.update(createPageTransform(doc.pages[0]!, 0.5, 0))
    const d = layer(host)!.querySelector('path')!.getAttribute('d')!
    expect(numbers(d)).toEqual([
      0, 0, 306, 0, 306, 396, 0, 396, 50, 96, 150, 96, 150, 146, 50, 146,
    ])
    expect(layer(host)!.getAttribute('width')).toBe('306')
  })

  it('mask on the rotated fixture covers the whole page at view rotation 0 and 270', async () => {
    for (const view of [0, 270] as const) {
      const { doc, host, transform } = await mountMaskPage('text-rotated-90', 1, view)
      const rect = { x: 100, y: 300, width: 200, height: 100 }
      doc.annotations.add({ type: 'mask', page: 0, rect, shape: 'rect' })
      const svg = layer(host)!
      expect(svg.getAttribute('width')).toBe(String(transform.cssWidth))
      expect(svg.getAttribute('height')).toBe(String(transform.cssHeight))
      const all = numbers(svg.querySelector('path')!.getAttribute('d')!)
      expect(all.slice(0, 8)).toEqual([
        0,
        0,
        transform.cssWidth,
        0,
        transform.cssWidth,
        transform.cssHeight,
        0,
        transform.cssHeight,
      ])
      // The shape is the rect's own css box under the page's turn.
      const c = transform.toCssRect(rect)
      const shape = all.slice(8)
      expect(shape[0], String(view)).toBeCloseTo(c.left)
      expect(shape[1], String(view)).toBeCloseTo(c.top)
      expect(shape[2], String(view)).toBeCloseTo(c.left + c.width)
      expect(shape[5], String(view)).toBeCloseTo(c.top + c.height)
      // /Rotate 90 plus the view: sides swap at a quarter turn, not at a half or full one.
      const swapped = transform.totalRotation % 180 !== 0
      expect(c.width, String(view)).toBeCloseTo(swapped ? rect.height : rect.width)
      expect(c.height, String(view)).toBeCloseTo(swapped ? rect.width : rect.height)
      expect(c.left + c.width).toBeLessThanOrEqual(transform.cssWidth)
      expect(c.top + c.height).toBeLessThanOrEqual(transform.cssHeight)
    }
  })

  it('mask is selectable by its edge, not its inside or the dimmed area', async () => {
    const { doc, host } = await mountMaskPage()
    const mask = doc.annotations.add({
      type: 'mask',
      page: 0,
      rect: { x: 100, y: 500, width: 200, height: 100 },
      shape: 'ellipse',
    })
    const el = host.querySelector<HTMLElement>(`[data-annotation="${mask.id}"]`)!
    expect(el.dataset.type).toBe('mask')
    expect(el.getAttribute('aria-label')).toBe('Mask')
    const box = host.getBoundingClientRect()
    // css box: left 100..300, top 192..292. The ellipse's left edge is at (100, 242).
    const at = (x: number, y: number) =>
      document.elementFromPoint(box.left + x, box.top + y)
    expect(at(102, 242)?.closest('[data-annotation]')).toBe(el)
    // The spotlight inside the edge belongs to the page, as does the box corner.
    expect(at(200, 242)?.closest('[data-annotation]')).toBeNull()
    expect(at(102, 194)?.closest('[data-annotation]')).toBeNull()
    // Far outside the shape, in the dimmed area.
    expect(at(450, 500)?.closest('[data-annotation]')).toBeNull()
    expect(at(450, 500)?.closest('[data-ink-mask-layer]')).toBeNull()
    // A press on the edge selects the mask.
    at(102, 242)?.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, isPrimary: true })
    )
    expect(doc.annotations.selection.get()).toEqual([mask.id])
  })

  it('a rect mask takes presses along its edge only', async () => {
    const { doc, host } = await mountMaskPage()
    const mask = doc.annotations.add({
      type: 'mask',
      page: 0,
      rect: { x: 100, y: 500, width: 200, height: 100 },
      shape: 'rect',
    })
    const el = host.querySelector<HTMLElement>(`[data-annotation="${mask.id}"]`)!
    const box = host.getBoundingClientRect()
    const at = (x: number, y: number) =>
      document.elementFromPoint(box.left + x, box.top + y)
    expect(at(102, 194)?.closest('[data-annotation]')).toBe(el)
    expect(at(200, 290)?.closest('[data-annotation]')).toBe(el)
    expect(at(98, 194)?.closest('[data-annotation]')).toBeNull()
    expect(at(200, 242)?.closest('[data-annotation]')).toBeNull()
  })
})
