import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { readonly, writable } from '../model/readable'

import { createPageMount } from './page-mount'
import { getSelectionQuads } from './selection'
import {
  mountContainer,
  openFixtureInBrowser,
  settle,
  TEXT_LAYER_CSS,
  until,
} from './test-utils'
import {
  builtinTools,
  createToolController,
  type Tool,
  type ToolController,
} from './tools'
import { createPageTransform } from './transform'
import { TOOL_LABELS } from './ui'
import { createToolButton } from './viewer/controls'
import { mountViewer } from './viewer-engine'
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

import type { Annotation } from '../model/annotations/types'

/**
 * `controlled: true` opens the document with a host that applies each proposal a microtask
 * later, the way Vue's v-model does, so a tool's synchronous multi-step mutation runs before
 * any of it is applied.
 */
async function setup(
  name: 'text-simple' | 'cropbox-offset' = 'text-simple',
  {
    controlled = false,
    custom = false,
    tools: hostTools,
  }: { controlled?: boolean; custom?: boolean; tools?: Tool[] } = {}
) {
  let host: Annotation[] = []
  const doc = await openFixtureInBrowser(
    name,
    controlled
      ? {
          annotations: {
            mode: 'controlled',
            initial: [],
            onChange: (next) => {
              host = next
              queueMicrotask(() => doc.annotations.setControlledValue(host))
            },
          },
        }
      : {}
  )
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
          isCustom: () => custom,
        })
      ),
    onUpdate: (page, _host, transform) => mounts.get(page)?.update(transform),
    onUnmount: (page) => {
      mounts.get(page)?.destroy()
      mounts.delete(page)
    },
  })
  const tools: ToolController = createToolController({
    ...(hostTools ? { tools: hostTools } : {}),
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

  it('highlight turns a text selection into one highlight and clears the selection', async () => {
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

  it.each([false, true])(
    'highlight adds one annotation per page for a selection across two pages (controlled: %s)',
    async (controlled) => {
      const { doc, container, viewport, tools, mounts } = await setup('text-simple', {
        controlled,
      })
      await until(() => mounts.has(1))
      await mounts.get(1)!.textLayer.ready
      tools.set('highlight')
      const spans = (page: number) => [
        ...viewport.hostFor(page)!.querySelectorAll('[data-ink-text-layer] span'),
      ]
      const first = spans(0).find((s) => s.textContent?.includes('QQ123456C'))!
      const last = spans(1).find((s) => s.textContent?.includes('QQ123456C'))!
      const range = document.createRange()
      range.setStart(first, 0)
      range.setEnd(last, last.childNodes.length)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)
      const r = last.getBoundingClientRect()
      pointer(container, 'pointerup', r.right, r.bottom)
      await settle()
      const list = doc.annotations.list.get()
      expect(list.map((a) => [a.type, a.page])).toEqual([
        ['highlight', 0],
        ['highlight', 1],
      ])
      expect(window.getSelection()!.isCollapsed).toBe(true)
    }
  )

  it('note click adds a centred 20pt note, selects it and activates', async () => {
    const { doc, container, viewport, tools, onActivate } = await setup()
    tools.set('note')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 300, h.top + 400)
    pointer(container, 'pointerup', h.left + 300, h.top + 400)
    const [n] = doc.annotations.list.get()
    expect(n?.type).toBe('text')
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

  it("select: presses and keys inside a custom annotation's content stay with that content", async () => {
    const { doc, container, viewport, tools } = await setup('text-simple', {
      custom: true,
    })
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
    expect(el.hasAttribute('data-custom')).toBe(true)
    // What a host's annotation slot would render into the element.
    const button = document.createElement('button')
    const input = document.createElement('input')
    el.append(button, input)

    pointer(el, 'pointerdown', h.left + 110, h.top + 180)
    pointer(el, 'pointerup', h.left + 110, h.top + 180)
    expect(doc.annotations.selection.get()).toEqual([a.id])

    pointer(button, 'pointerdown', h.left + 110, h.top + 180)
    pointer(container, 'pointermove', h.left + 150, h.top + 200)
    expect(el.style.transform).toBe('')
    pointer(container, 'pointerup', h.left + 150, h.top + 200)
    expect(doc.annotations.get(a.id)!.rect).toEqual({
      x: 100,
      y: 600,
      width: 50,
      height: 30,
    })

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(doc.annotations.selection.get()).toEqual([a.id])
    // The element itself still answers to the tool.
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
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

describe('controlled mode', () => {
  it('note add then select reaches the selection before the host applies', async () => {
    const { doc, container, viewport, tools, onActivate } = await setup('text-simple', {
      controlled: true,
    })
    tools.set('note')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 300, h.top + 400)
    pointer(container, 'pointerup', h.left + 300, h.top + 400)
    expect(doc.annotations.list.get()).toEqual([])
    await settle()
    const [n] = doc.annotations.list.get()
    expect(n?.type).toBe('text')
    expect(doc.annotations.selection.get()).toEqual([n!.id])
    expect(onActivate).toHaveBeenCalledWith(n!.id)
  })

  it('select: Delete removes every selected annotation', async () => {
    const { doc, container, tools } = await setup('text-simple', { controlled: true })
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
    expect(doc.annotations.list.get()).toHaveLength(2)
    tools.set('select')
    doc.annotations.select([a.id, b.id])
    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })
    )
    await settle()
    expect(doc.annotations.list.get()).toEqual([])
  })
})

describe('controller and gesture edges', () => {
  it("restores the root's own inline cursor on destroy", async () => {
    const { doc, viewport } = await setup()
    const root = document.createElement('div')
    root.style.cursor = 'zoom-in'
    const c = createToolController({
      ctx: {
        store: doc.annotations,
        viewport,
        root,
        selectionQuads: () => [],
        clearSelection: () => undefined,
      },
      initial: 'note',
    })
    expect(root.style.cursor).toBe('copy')
    c.destroy()
    expect(root.style.cursor).toBe('zoom-in')
  })

  it('redact-area clamps a drag that leaves the page to the page edge', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('redact-area')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.right + 50, h.top - 40)
    const draft = container.querySelector<HTMLElement>('[data-ink-draft="redact"]')!
    expect(draft.style.top).toBe('0px')
    expect(draft.style.width).toBe(`${h.width - 100}px`)
    pointer(container, 'pointerup', h.right + 50, h.top - 40)
    const [r] = doc.annotations.list.get()
    // Letter page at zoom 1: x 100 → 612, css top 0 → 100 is user y 692 → 792.
    expect(r!.rect).toEqual({ x: 100, y: 692, width: 512, height: 100 })
  })

  it('switching tools mid-drag cancels the drag and keeps the release from the new tool', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('redact-area')
    const host = viewport.hostFor(0)!
    const span = [...host.querySelectorAll('[data-ink-text-layer] span')].find((s) =>
      s.textContent?.includes('QQ123456C')
    )!
    const range = document.createRange()
    range.selectNodeContents(span)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    const h = host.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 300)
    pointer(container, 'pointermove', h.left + 200, h.top + 350)
    tools.set('highlight')
    expect(container.querySelector('[data-ink-draft]')).toBeNull()
    pointer(container, 'pointerup', h.left + 200, h.top + 350)
    expect(doc.annotations.list.get()).toEqual([])
    // The next press and release are the new tool's.
    pointer(container, 'pointerdown', h.left + 200, h.top + 350)
    pointer(container, 'pointerup', h.left + 200, h.top + 350)
    expect(doc.annotations.list.get().map((a) => a.type)).toEqual(['highlight'])
  })

  it('drops a drag whose page host was unmounted mid-gesture', async () => {
    const { doc, container, viewport, tools } = await setup()
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
    cleanup.unshift(
      doc.annotations.on('change', (c) => {
        if (c.kind === 'update') updates(c)
      })
    )
    pointer(el, 'pointerdown', h.left + 110, h.top + 180)
    pointer(container, 'pointermove', h.left + 150, h.top + 200)
    const parent = host.parentElement!
    host.remove()
    pointer(container, 'pointerup', h.left + 170, h.top + 220)
    expect(updates).not.toHaveBeenCalled()
    tools.set('redact-area')
    parent.append(host)
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 160, h.top + 140)
    host.remove()
    pointer(container, 'pointermove', h.left + 170, h.top + 150)
    pointer(container, 'pointerup', h.left + 170, h.top + 150)
    expect(doc.annotations.list.get().map((x) => x.id)).toEqual([a.id])
    parent.append(host)
  })

  it('treats lostpointercapture as a cancel only while a press is live', async () => {
    const { doc, viewport } = await setup()
    const root = document.createElement('div')
    document.body.append(root)
    cleanup.push(() => root.remove())
    const onPointerCancel = vi.fn()
    const spy: Tool = {
      id: 'view',
      cursor: 'auto',
      activate() {},
      deactivate() {},
      onPointerDown: () => true,
      onPointerCancel,
    }
    const c = createToolController({
      ctx: {
        store: doc.annotations,
        viewport,
        root,
        selectionQuads: () => [],
        clearSelection: () => undefined,
      },
      tools: [spy],
    })
    cleanup.push(() => c.destroy())
    const lost = () =>
      root.dispatchEvent(
        new PointerEvent('lostpointercapture', {
          pointerId: 1,
          isPrimary: true,
          bubbles: true,
        })
      )
    pointer(root, 'pointerdown', 10, 10)
    pointer(root, 'pointerup', 10, 10)
    lost()
    expect(onPointerCancel).not.toHaveBeenCalled()
    pointer(root, 'pointerdown', 10, 10)
    lost()
    expect(onPointerCancel).toHaveBeenCalledTimes(1)
  })

  it('ignores releases of buttons other than the primary one', async () => {
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
    pointer(container, 'pointerup', r.right, r.bottom, { button: 2 })
    expect(doc.annotations.list.get()).toEqual([])
    expect(window.getSelection()!.isCollapsed).toBe(false)
  })

  it('ignores a second pointer while a gesture is live', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('redact-area')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 160, h.top + 140)
    const drafts = () => container.querySelectorAll('[data-ink-draft="redact"]')
    expect(drafts()).toHaveLength(1)
    const draft = drafts()[0] as HTMLElement
    const before = draft.style.cssText
    pointer(container, 'pointerdown', h.left + 300, h.top + 300, { pointerId: 2 })
    pointer(container, 'pointermove', h.left + 350, h.top + 350, { pointerId: 2 })
    expect(drafts()).toHaveLength(1)
    expect(draft.style.cssText).toBe(before)
    pointer(container, 'pointerup', h.left + 350, h.top + 350, { pointerId: 2 })
    expect(doc.annotations.list.get()).toEqual([])
    expect(draft.isConnected).toBe(true)
    pointer(container, 'pointerup', h.left + 160, h.top + 140)
    const list = doc.annotations.list.get()
    expect(list).toHaveLength(1)
    expect(list[0]!.rect).toEqual({ x: 100, y: 652, width: 60, height: 40 })
  })

  it('note: a cancelled press adds nothing on a later release', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('note')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 300, h.top + 400)
    pointer(container, 'pointercancel', h.left + 300, h.top + 400)
    pointer(container, 'pointerup', h.left + 300, h.top + 400)
    expect(doc.annotations.list.get()).toEqual([])
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
  it('forwards render and text layer failures to onError', async () => {
    const doc = await openFixtureInBrowser('text-simple')
    const host = mountContainer(612, 792)
    host.style.setProperty('--total-scale-factor', '1')
    const onError = vi.fn()
    const m = createPageMount({
      document: doc,
      page: 99,
      host,
      transform: createPageTransform(
        {
          index: 99,
          box: { x: 0, y: 0, width: 612, height: 792 },
          width: 612,
          height: 792,
          rotate: 0,
          userUnit: 1,
        },
        1
      ),
      store: doc.annotations,
      onError,
    })
    cleanup.push(() => {
      m.destroy()
      doc.destroy()
      host.remove()
    })
    await Promise.all([m.renderer.rendered, m.textLayer.ready])
    expect(onError).toHaveBeenCalledTimes(2)
  })

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
  it('select: Delete on a focused annotation removes only that one, once', async () => {
    const { doc, viewport, tools } = await setup()
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
    doc.annotations.select([a.id, b.id])
    const removed: string[] = []
    const off = doc.annotations.on('change', (c) => {
      if (c.kind === 'remove') removed.push(c.annotation.id)
    })
    cleanup.push(off)
    const el = viewport
      .hostFor(0)!
      .querySelector(`[data-annotation="${a.id}"]`) as HTMLElement
    el.focus()
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    // The overlay owns the key: the focused annotation goes, the rest of the selection stays.
    expect(removed).toEqual([a.id])
    expect(doc.annotations.get(b.id)).toBeDefined()
    expect(doc.annotations.selection.get()).toEqual([b.id])
  })
})

describe('keyboard creation', () => {
  function selectText(viewport: Viewport, needle: string): void {
    const span = [
      ...viewport.hostFor(0)!.querySelectorAll('[data-ink-text-layer] span'),
    ].find((s) => s.textContent?.includes(needle))!
    const range = document.createRange()
    range.selectNodeContents(span)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
  }
  const enter = (el: Element, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      ...init,
    })
    el.dispatchEvent(e)
    return e
  }

  it('highlight: Enter on the scroll element turns the selection into a highlight', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('highlight')
    container.tabIndex = 0
    container.focus()
    expect(enter(container).defaultPrevented).toBe(false)
    expect(doc.annotations.list.get()).toEqual([])
    selectText(viewport, 'QQ123456C')
    expect(enter(container).defaultPrevented).toBe(true)
    const [hl] = doc.annotations.list.get()
    expect(hl?.type).toBe('highlight')
    if (hl?.type === 'highlight') expect(hl.quads).toHaveLength(1)
    expect(window.getSelection()!.isCollapsed).toBe(true)
  })

  it('redact-area: Enter turns the selection into text redactions; modified Enter does not', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('redact-area')
    selectText(viewport, 'QQ123456C')
    enter(container, { ctrlKey: true })
    expect(doc.annotations.list.get()).toEqual([])
    enter(container)
    const [red] = doc.annotations.list.get()
    expect(red?.type).toBe('redact')
    if (red?.type === 'redact') expect(red.quads).toHaveLength(1)
    expect(window.getSelection()!.isCollapsed).toBe(true)
  })

  it('note: Enter on a <summary> or a role=menuitem control, in slot content or on the page, creates nothing', async () => {
    const { doc, viewport, tools } = await setup('text-simple', { custom: true })
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    await settle()
    tools.set('note')
    const host = viewport.hostFor(0)!
    const el = host.querySelector(`[data-annotation="${a.id}"]`)!
    // What a host's annotation slot might render: a disclosure widget.
    const inSlot = document.createElement('details')
    inSlot.innerHTML = '<summary>More</summary>'
    el.append(inSlot)
    // A custom control a host might render: not a native one, but focusable and keyed.
    const menuItem = document.createElement('div')
    menuItem.setAttribute('role', 'menuitem')
    menuItem.tabIndex = 0
    menuItem.textContent = 'Options'
    el.append(menuItem)
    const onPage = document.createElement('details')
    onPage.innerHTML = '<summary>Page notes</summary>'
    host.append(onPage)
    const session = () => doc.annotations.list.get().filter((x) => x.type === 'text')
    for (const summary of [inSlot, onPage].map((d) => d.querySelector('summary')!)) {
      summary.focus()
      enter(summary)
    }
    menuItem.focus()
    enter(menuItem)
    // Outside the slot too: a menu item placed straight on the page host.
    const loose = menuItem.cloneNode(true) as HTMLElement
    host.append(loose)
    enter(loose)
    expect(session()).toEqual([])
    // The page host itself still counts as the viewport, and so does text-layer content.
    enter(host)
    expect(session()).toHaveLength(1)
    enter(host.querySelector('[data-ink-text-layer] span')!)
    expect(session()).toHaveLength(2)
  })

  it('Enter on a focused annotation activates it and creates nothing', async () => {
    const { doc, viewport, tools, onActivate } = await setup()
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    await settle()
    tools.set('note')
    const el = viewport.hostFor(0)!.querySelector(`[data-annotation="${a.id}"]`)!
    enter(el)
    expect(doc.annotations.list.get().map((x) => x.id)).toEqual([a.id])
    expect(onActivate).toHaveBeenCalledWith(a.id)
  })

  it.each([false, true])(
    'note: Enter places a note at the centre of the current page and focuses it (controlled: %s)',
    async (controlled) => {
      const { doc, container, viewport, tools, onActivate } = await setup(
        'cropbox-offset',
        { controlled }
      )
      tools.set('note')
      container.tabIndex = 0
      container.focus()
      enter(container)
      const session = () =>
        doc.annotations.list.get().filter((a) => a.source === 'session')
      await until(() => session().length === 1)
      const [n] = session()
      expect(n?.type).toBe('text')
      expect(n!.page).toBe(viewport.currentPage.get())
      // CropBox [50 50 550 750]: centre (300, 400), a 20 pt box around it.
      expect(n!.rect).toEqual({ x: 290, y: 390, width: 20, height: 20 })
      expect(doc.annotations.selection.get()).toEqual([n!.id])
      expect(onActivate).toHaveBeenCalledWith(n!.id)
      await until(() => document.activeElement?.getAttribute('data-annotation') === n!.id)
    }
  )
})

describe('resize handles', () => {
  it('dragging the se handle grows the rect by the dragged points, in one update', async () => {
    const { doc, container, viewport, tools } = await setup()
    viewport.setZoom(1.5)
    await until(() => viewport.transformFor(0).zoom === 1.5)
    await settle()
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    tools.set('select')
    doc.annotations.select([a.id])
    await settle()
    const host = viewport.hostFor(0)!
    const t = viewport.transformFor(0)
    const handle = host.querySelector(
      `[data-annotation="${a.id}"] > [data-handle="se"]`
    ) as HTMLElement
    expect(handle).not.toBeNull()
    const el = handle.parentElement!
    const updates = vi.fn()
    cleanup.push(
      doc.annotations.on('change', (c) => {
        if (c.kind === 'update') updates(c)
      })
    )
    const h = host.getBoundingClientRect()
    const corner = t.toCss({ x: 150, y: 600 })
    const dx = t.toCssLength(20)
    const dy = t.toCssLength(10)
    pointer(handle, 'pointerdown', h.left + corner.x, h.top + corner.y)
    pointer(container, 'pointermove', h.left + corner.x + dx, h.top + corner.y + dy)
    expect(el.style.transform).toContain('scale(')
    expect(updates).not.toHaveBeenCalled()
    pointer(container, 'pointerup', h.left + corner.x + dx, h.top + corner.y + dy)
    expect(updates).toHaveBeenCalledTimes(1)
    expect(el.style.transform).toBe('')
    // The nw corner (100, 630) stays; the se corner moves 20 pt right and 10 pt down.
    const r = doc.annotations.get(a.id)!.rect
    expect(r.x).toBeCloseTo(100, 5)
    expect(r.y).toBeCloseTo(590, 5)
    expect(r.width).toBeCloseTo(70, 5)
    expect(r.height).toBeCloseTo(40, 5)
    expect(doc.annotations.selection.get()).toEqual([a.id])
  })

  it('a click on a handle without a drag leaves the rect as it was', async () => {
    const { doc, container, viewport, tools } = await setup()
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    tools.set('select')
    doc.annotations.select([a.id])
    await settle()
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    const handle = host.querySelector(
      `[data-annotation="${a.id}"] > [data-handle="se"]`
    ) as HTMLElement
    const updates = vi.fn()
    cleanup.push(
      doc.annotations.on('change', (c) => {
        if (c.kind === 'update') updates(c)
      })
    )
    // Pressed 3 px inside the corner: the corner keeps that offset, so it does not snap.
    pointer(handle, 'pointerdown', h.left + 147, h.top + 189)
    pointer(container, 'pointerup', h.left + 147, h.top + 189)
    expect(updates).not.toHaveBeenCalled()
    expect(doc.annotations.get(a.id)!.rect).toEqual({
      x: 100,
      y: 600,
      width: 50,
      height: 30,
    })
    // A drag from that press moves the corner by the travel only.
    pointer(handle, 'pointerdown', h.left + 147, h.top + 189)
    pointer(container, 'pointermove', h.left + 157, h.top + 189)
    pointer(container, 'pointerup', h.left + 157, h.top + 189)
    expect(doc.annotations.get(a.id)!.rect).toEqual({
      x: 100,
      y: 600,
      width: 60,
      height: 30,
    })
  })

  it('a drag past the opposite corner stops at 1 pt', async () => {
    const { doc, container, viewport, tools } = await setup()
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    tools.set('select')
    doc.annotations.select([a.id])
    await settle()
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    const handle = host.querySelector(
      `[data-annotation="${a.id}"] > [data-handle="se"]`
    ) as HTMLElement
    pointer(handle, 'pointerdown', h.left + 150, h.top + 192)
    pointer(container, 'pointermove', h.left + 20, h.top + 20)
    pointer(container, 'pointerup', h.left + 20, h.top + 20)
    expect(doc.annotations.get(a.id)!.rect).toEqual({
      x: 100,
      y: 629,
      width: 1,
      height: 1,
    })
  })

  it('shows handles only while the select tool is active', async () => {
    const { doc, viewport, tools } = await setup()
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    const handles = () =>
      viewport.hostFor(0)!.querySelectorAll(`[data-annotation="${a.id}"] > .ink-handle`)
    doc.annotations.select([a.id])
    await settle()
    // Selected under the view tool: nothing to drag them with, so no handles.
    expect(handles()).toHaveLength(0)
    tools.set('select')
    await until(() => handles().length === 4)
    tools.set('highlight')
    await until(() => handles().length === 0)
    expect(doc.annotations.selection.get()).toEqual([a.id])
    tools.set('select')
    await until(() => handles().length === 4)
  })

  it('a locked or text-derived annotation shows no handles', async () => {
    const { doc, viewport, tools } = await setup()
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    doc.annotations.update(a.id, { locked: true })
    tools.set('select')
    doc.annotations.select([a.id])
    await settle()
    const host = viewport.hostFor(0)!
    expect(host.querySelectorAll(`[data-annotation="${a.id}"] .ink-handle`)).toHaveLength(
      0
    )
  })
})

describe('tool registry and options', () => {
  /** A stand-in for a creation tool with options, recording what it sees on activate. */
  function optionTool(seen: object[]): Tool<{ kind: string; sides: number }> {
    return {
      id: 'shape',
      cursor: 'crosshair',
      styleGroup: 'shape',
      defaultOptions: { kind: 'rectangle', sides: 6 },
      activate(ctx) {
        seen.push(ctx.options())
      },
      deactivate() {},
    }
  }

  it('set(id, options) merges options and they persist across switches', async () => {
    const seen: object[] = []
    const { tools } = await setup('text-simple', {
      tools: [...builtinTools(), optionTool(seen)],
    })
    expect(tools.options('shape').get()).toEqual({ kind: 'rectangle', sides: 6 })
    tools.set('shape', { kind: 'ellipse' })
    expect(seen.at(-1)).toEqual({ kind: 'ellipse', sides: 6 })
    tools.set('select')
    tools.set('shape')
    expect(tools.options('shape').get()).toEqual({ kind: 'ellipse', sides: 6 })
    expect(seen.at(-1)).toEqual({ kind: 'ellipse', sides: 6 })
    tools.setOptions('shape', { sides: 8 })
    expect(tools.active.get()).toBe('shape')
    expect(tools.options('shape').get()).toEqual({ kind: 'ellipse', sides: 8 })
    // A tool without declared options starts empty.
    expect(tools.options('note').get()).toEqual({})
  })

  it('a host tool registers through mountViewer({ tools })', async () => {
    const doc = await openFixtureInBrowser('text-simple')
    const container = mountContainer(800, 600)
    const activate = vi.fn()
    const deactivate = vi.fn()
    const engine = mountViewer({
      container,
      document: doc,
      zoom: 0.5,
      tools: [{ id: 'stamp-x', cursor: 'copy', activate, deactivate }],
    })
    cleanup.push(() => {
      engine.destroy()
      doc.destroy()
      container.remove()
    })
    engine.tools.set('stamp-x')
    expect(container.dataset.inkTool).toBe('stamp-x')
    expect(container.style.cursor).toBe('copy')
    expect(activate).toHaveBeenCalledTimes(1)
    // The built-ins are still there.
    engine.tools.set('note')
    expect(deactivate).toHaveBeenCalledTimes(1)
    // Options outlive a rebuild.
    engine.tools.setOptions('stamp-x', { size: 2 })
    engine.rebuild({ gap: 20 })
    expect(engine.tools.options('stamp-x').get()).toEqual({ size: 2 })
    expect(engine.toolStyle.get('shape')).toEqual({})
  })

  it('an unknown id label falls back', () => {
    expect(TOOL_LABELS['stamp-x']).toBeUndefined()
    const tools = writable<ToolController | null>(null)
    const viewer = { tools: readonly(tools) } as unknown as Parameters<
      typeof createToolButton
    >[0]
    const labelled = createToolButton(viewer, 'stamp-x', { label: 'Stamp' })
    document.body.append(labelled)
    cleanup.push(() => labelled.remove())
    expect(labelled.getAttribute('aria-label')).toBe('Stamp')
    const bare = createToolButton(viewer, 'stamp-x')
    expect(bare.getAttribute('aria-label')).toBe('stamp-x')
  })
})
