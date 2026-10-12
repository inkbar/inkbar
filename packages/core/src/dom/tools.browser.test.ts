import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { createPageMount } from './page-mount'
import { getSelectionQuads } from './selection'
import {
  mountContainer,
  openFixtureInBrowser,
  settle,
  TEXT_LAYER_CSS,
  until,
} from './test-utils'
import { createToolController, type ToolController } from './tools'
import { createViewport, type Viewport } from './viewport'

let style: HTMLStyleElement
beforeAll(() => {
  style = document.createElement('style')
  style.textContent = TEXT_LAYER_CSS
  document.head.append(style)
})
afterAll(() => style.remove())

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

async function setup(name: 'text-simple' | 'cropbox-offset' = 'text-simple') {
  const doc = await openFixtureInBrowser(name)
  const container = mountContainer(800, 900)
  const mounts = new Map<number, ReturnType<typeof createPageMount>>()
  const onActivate = vi.fn()
  const viewport: Viewport = createViewport({
    container,
    document: doc,
    zoom: 1,
    onMount: (page, host, transform) =>
      mounts.set(
        page,
        createPageMount({
          document: doc,
          page,
          host,
          transform,
          store: doc.annotations,
          onActivate,
        })
      ),
    onUpdate: (page, _host, transform) => mounts.get(page)?.update(transform),
    onUnmount: (page) => {
      mounts.get(page)?.destroy()
      mounts.delete(page)
    },
  })
  const tools: ToolController = createToolController({
    ctx: {
      store: doc.annotations,
      viewport,
      root: container,
      selectionQuads: () =>
        getSelectionQuads(container, (host) => ({
          page: Number(host.dataset.page),
          transform: viewport.transformFor(Number(host.dataset.page)),
        })),
      clearSelection: () => window.getSelection()?.removeAllRanges(),
      onActivate,
    },
  })
  cleanup.push(() => {
    tools.destroy()
    viewport.destroy()
    doc.destroy()
    container.remove()
  })
  await until(() => mounts.size > 0)
  await Promise.all([...mounts.values()].map((m) => m.textLayer.ready))
  return { doc, container, viewport, tools, onActivate, mounts }
}

function pointer(
  el: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  clientX: number,
  clientY: number,
  init: PointerEventInit = {}
) {
  el.dispatchEvent(
    new PointerEvent(type, {
      clientX,
      clientY,
      bubbles: true,
      pointerId: 1,
      button: 0,
      buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
      isPrimary: true,
      ...init,
    })
  )
}

describe('tools', () => {
  it('sets data-ink-tool and cursor on the root, and removes them on destroy', async () => {
    const { container, tools } = await setup()
    expect(container.dataset.inkTool).toBe('view')
    tools.set('redact-area')
    expect(container.dataset.inkTool).toBe('redact-area')
    expect(container.dataset.tool).toBeUndefined()
    expect(container.style.cursor).toBe('crosshair')
    expect(tools.active.get()).toBe('redact-area')
    tools.destroy()
    expect(container.dataset.inkTool).toBeUndefined()
    expect(container.style.cursor).toBe('')
  })

  it('redact-area drag creates a user-space rect, including on a CropBox-offset page (Review Focus 1)', async () => {
    const { doc, container, viewport, tools } = await setup('cropbox-offset')
    tools.set('redact-area')
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 160, h.top + 140)
    expect(container.querySelector('[data-ink-draft="redact"]')).not.toBeNull()
    pointer(container, 'pointerup', h.left + 160, h.top + 140)
    expect(container.querySelector('[data-ink-draft]')).toBeNull()
    const [r] = doc.annotations.list.get().filter((a) => a.source === 'session')
    expect(r?.type).toBe('redact')
    // CropBox is [50 50 550 750]: css (100,100) → user x = 150, user y = 750 - 100 = 650; box 60×40
    expect(r!.rect).toEqual({ x: 150, y: 610, width: 60, height: 40 })
    // and it is drawn back where the drag was
    const el = host.querySelector(`[data-annotation="${r!.id}"]`) as HTMLElement
    expect(el.style.left).toBe('100px')
    expect(el.style.top).toBe('100px')
    expect(viewport.transformFor(0).toCssRect(r!.rect)).toEqual({
      left: 100,
      top: 100,
      width: 60,
      height: 40,
    })
  })

  it('redact-area ignores tiny drags', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('redact-area')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointerup', h.left + 101, h.top + 102)
    expect(doc.annotations.list.get()).toEqual([])
  })

  it('redact-area turns a text selection into a quads-based redaction on a click', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('redact-area')
    const span = [
      ...viewport.hostFor(0)!.querySelectorAll('[data-ink-text-layer] span'),
    ].find((s) => s.textContent?.includes('QQ123456C'))!
    const range = document.createRange()
    range.selectNodeContents(span)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    const r = span.getBoundingClientRect()
    pointer(container, 'pointerdown', r.right, r.bottom)
    pointer(container, 'pointerup', r.right, r.bottom)
    const [red] = doc.annotations.list.get()
    expect(red?.type).toBe('redact')
    if (red?.type === 'redact') expect(red.quads).toHaveLength(1)
    expect(window.getSelection()!.isCollapsed).toBe(true)
  })

  it('highlight turns a text selection into one highlight per page and clears the selection', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('highlight')
    const span = [
      ...viewport.hostFor(0)!.querySelectorAll('[data-ink-text-layer] span'),
    ].find((s) => s.textContent?.includes('QQ123456C'))!
    const range = document.createRange()
    range.selectNodeContents(span)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    const r = span.getBoundingClientRect()
    pointer(container, 'pointerup', r.right, r.bottom)
    const [hl] = doc.annotations.list.get()
    expect(hl?.type).toBe('highlight')
    if (hl?.type === 'highlight') {
      expect(hl.quads).toHaveLength(1)
      expect(hl.quads[0]!.p3.x).toBeCloseTo(72, 0)
    }
    expect(window.getSelection()!.isCollapsed).toBe(true)
  })

  it('note click adds a centred 20pt note, selects it and activates', async () => {
    const { doc, container, viewport, tools, onActivate } = await setup()
    tools.set('note')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 300, h.top + 400)
    pointer(container, 'pointerup', h.left + 300, h.top + 400)
    const [n] = doc.annotations.list.get()
    expect(n?.type).toBe('note')
    expect(n!.rect).toEqual({ x: 290, y: 382, width: 20, height: 20 })
    expect(doc.annotations.selection.get()).toEqual([n!.id])
    expect(onActivate).toHaveBeenCalledWith(n!.id)
  })

  it('creation tools ignore presses that land on an annotation', async () => {
    const { doc, viewport, tools } = await setup()
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    await settle()
    tools.set('note')
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    const el = host.querySelector(`[data-annotation="${a.id}"]`) as HTMLElement
    pointer(el, 'pointerdown', h.left + 110, h.top + 180)
    pointer(el, 'pointerup', h.left + 110, h.top + 180)
    expect(doc.annotations.list.get().map((x) => x.id)).toEqual([a.id])
    expect(doc.annotations.selection.get()).toEqual([a.id])
  })

  it('select: click selects, drag moves an unlocked annotation, marquee multi-selects, Delete removes', async () => {
    const { doc, container, viewport, tools } = await setup()
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    const b = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 300, y: 600, width: 50, height: 30 },
    })
    await settle()
    tools.set('select')
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    const el = host.querySelector(`[data-annotation="${a.id}"]`) as HTMLElement
    // click = pointerdown/up on the element without movement
    pointer(el, 'pointerdown', h.left + 110, h.top + (792 - 620))
    pointer(el, 'pointerup', h.left + 110, h.top + (792 - 620))
    expect(doc.annotations.selection.get()).toEqual([a.id])
    // drag by +40 css x, +20 css y → user +40, -20, committed once on pointerup
    const updates = vi.fn()
    const off = doc.annotations.on('change', (c) => {
      if (c.kind === 'update') updates(c)
    })
    pointer(el, 'pointerdown', h.left + 110, h.top + (792 - 620))
    pointer(container, 'pointermove', h.left + 130, h.top + (792 - 620) + 10)
    pointer(container, 'pointermove', h.left + 150, h.top + (792 - 620) + 20)
    expect(updates).not.toHaveBeenCalled()
    expect(el.style.transform).toBe('translate(40px, 20px)')
    pointer(container, 'pointerup', h.left + 150, h.top + (792 - 620) + 20)
    off()
    expect(updates).toHaveBeenCalledTimes(1)
    expect(el.style.transform).toBe('')
    expect(doc.annotations.get(a.id)!.rect).toEqual({
      x: 140,
      y: 580,
      width: 50,
      height: 30,
    })
    // marquee over both
    pointer(container, 'pointerdown', h.left + 80, h.top + 100)
    pointer(container, 'pointermove', h.left + 400, h.top + 250)
    expect(container.querySelector('[data-ink-marquee]')).not.toBeNull()
    pointer(container, 'pointerup', h.left + 400, h.top + 250)
    expect(container.querySelector('[data-ink-marquee]')).toBeNull()
    expect(new Set(doc.annotations.selection.get())).toEqual(new Set([a.id, b.id]))
    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })
    )
    expect(doc.annotations.list.get()).toEqual([])
  })

  it('select: shift-click adds to the selection and Escape clears it', async () => {
    const { doc, container, viewport, tools } = await setup()
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    const b = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 300, y: 600, width: 50, height: 30 },
    })
    await settle()
    tools.set('select')
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    const elA = host.querySelector(`[data-annotation="${a.id}"]`) as HTMLElement
    const elB = host.querySelector(`[data-annotation="${b.id}"]`) as HTMLElement
    pointer(elA, 'pointerdown', h.left + 110, h.top + 180)
    pointer(elA, 'pointerup', h.left + 110, h.top + 180)
    pointer(elB, 'pointerdown', h.left + 310, h.top + 180, { shiftKey: true })
    pointer(elB, 'pointerup', h.left + 310, h.top + 180, { shiftKey: true })
    expect(new Set(doc.annotations.selection.get())).toEqual(new Set([a.id, b.id]))
    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
    expect(doc.annotations.selection.get()).toEqual([])
  })

  it('locked annotations do not move', async () => {
    const { doc, container, viewport, tools } = await setup()
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    doc.annotations.update(a.id, { locked: true })
    await settle()
    tools.set('select')
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    const el = host.querySelector(`[data-annotation="${a.id}"]`) as HTMLElement
    pointer(el, 'pointerdown', h.left + 110, h.top + 180)
    pointer(container, 'pointermove', h.left + 200, h.top + 200)
    expect(el.style.transform).toBe('')
    pointer(container, 'pointerup', h.left + 200, h.top + 200)
    expect(doc.annotations.get(a.id)!.rect.x).toBe(100)
  })
})

describe('interrupted gestures', () => {
  async function dragging(how: 'cancel' | 'hover') {
    const ctx = await setup()
    const { doc, container, viewport, tools } = ctx
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    await settle()
    tools.set('select')
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    const el = host.querySelector(`[data-annotation="${a.id}"]`) as HTMLElement
    const updates = vi.fn()
    cleanup.push(
      doc.annotations.on('change', (c) => {
        if (c.kind === 'update') updates(c)
      })
    )
    pointer(el, 'pointerdown', h.left + 110, h.top + 180)
    pointer(container, 'pointermove', h.left + 150, h.top + 200)
    expect(el.style.transform).toBe('translate(40px, 20px)')
    if (how === 'cancel') pointer(container, 'pointercancel', h.left + 150, h.top + 200)
    else pointer(container, 'pointermove', h.left + 170, h.top + 210, { buttons: 0 })
    expect(el.style.transform).toBe('')
    // A later release (or more hovering) must not move it either.
    pointer(container, 'pointermove', h.left + 180, h.top + 220, { buttons: 0 })
    expect(el.style.transform).toBe('')
    pointer(container, 'pointerup', h.left + 180, h.top + 220)
    expect(updates).not.toHaveBeenCalled()
    expect(doc.annotations.get(a.id)!.rect).toEqual({
      x: 100,
      y: 600,
      width: 50,
      height: 30,
    })
  }

  async function drawing(how: 'cancel' | 'hover') {
    const { doc, container, viewport, tools } = await setup()
    tools.set('redact-area')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 160, h.top + 140)
    expect(container.querySelector('[data-ink-draft="redact"]')).not.toBeNull()
    if (how === 'cancel') pointer(container, 'pointercancel', h.left + 160, h.top + 140)
    else pointer(container, 'pointermove', h.left + 180, h.top + 150, { buttons: 0 })
    expect(container.querySelector('[data-ink-draft]')).toBeNull()
    pointer(container, 'pointermove', h.left + 200, h.top + 160, { buttons: 0 })
    expect(container.querySelector('[data-ink-draft]')).toBeNull()
    pointer(container, 'pointerup', h.left + 200, h.top + 160)
    expect(doc.annotations.list.get()).toEqual([])
  }

  it('pointercancel mid-drag drops the live move without writing', () =>
    dragging('cancel'))
  it('a buttonless move mid-drag drops the live move without writing', () =>
    dragging('hover'))
  it('pointercancel mid-draw removes the redaction draft and adds nothing', () =>
    drawing('cancel'))
  it('a buttonless move mid-draw removes the redaction draft and adds nothing', () =>
    drawing('hover'))
})

describe('createPageMount', () => {
  it('composes the canvas, text layer and overlay and tears all three down', async () => {
    const { viewport, mounts } = await setup()
    const host = viewport.hostFor(0)!
    const m = mounts.get(0)!
    expect(host.contains(m.renderer.element)).toBe(true)
    expect(host.contains(m.textLayer.element)).toBe(true)
    expect(host.contains(m.overlay.element)).toBe(true)
    m.destroy()
    mounts.delete(0)
    expect(host.contains(m.renderer.element)).toBe(false)
    expect(host.contains(m.textLayer.element)).toBe(false)
    expect(host.contains(m.overlay.element)).toBe(false)
  })
})
