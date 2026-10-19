import themeCss from '@inkbar/theme/theme.css?inline'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

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
  DEFAULT_FREETEXT_WIDTH,
  trackToolStyle,
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

import type { AnnotationChange } from '../model/annotations/store'
import type { Annotation } from '../model/annotations/types'
import type { InkDocument } from '../model/document'

/**
 * `controlled: true` opens the document with a host that applies each proposal a microtask
 * later, the way Vue's v-model does, so a tool's synchronous multi-step mutation runs before
 * any of it is applied.
 */
async function setup(
  name: 'text-simple' | 'cropbox-offset' | 'text-rotated-90' = 'text-simple',
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
  const tracker = trackToolStyle({ store: doc.annotations, history: doc.history })
  const tools: ToolController = createToolController({
    ...(hostTools ? { tools: hostTools } : {}),
    ctx: {
      toolStyle: tracker.toolStyle,
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
      history: doc.history,
    },
  })
  tools.active.subscribe((id) => tracker.setTool(id))
  cleanup.push(() => {
    tools.destroy()
    viewport.destroy()
    doc.destroy()
    container.remove()
  })
  await until(() => mounts.size > 0)
  await Promise.all([...mounts.values()].map((m) => m.textLayer.ready))
  return {
    doc,
    container,
    viewport,
    tools,
    onActivate,
    mounts,
    toolStyle: tracker.toolStyle,
  }
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
    expect(container.dataset.inkTool).toBe('select-text')
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

  it('rectangle select marquee selects intersecting annotations', async () => {
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

  it('freetext: a new box reaches onChange once, with its text, and is selected', async () => {
    const { doc, container, viewport, tools } = await setup('text-simple', {
      controlled: true,
    })
    tools.set('freetext')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointerup', h.left + 100, h.top + 100)
    // The editor opens at once, on a box that is not in the store yet.
    const editor = container.querySelector('[data-ink-editor]')
    expect(document.activeElement).toBe(editor)
    await userEvent.keyboard('Hello')
    await settle()
    expect(doc.annotations.list.get()).toEqual([])
    await userEvent.keyboard('{Escape}')
    await settle()
    const [box] = doc.annotations.list.get()
    expect(box).toMatchObject({ type: 'freetext', contents: 'Hello' })
    expect(doc.annotations.selection.get()).toEqual([box!.id])
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
      id: 'spy',
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
      initial: 'spy',
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

describe('shape tool', () => {
  const session = (doc: InkDocument) =>
    doc.annotations.list.get().filter((a) => a.source === 'session')
  const enter = (el: Element) =>
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )

  it('shape tool drag creates a square with the shape group style', async () => {
    const { doc, container, viewport, tools, toolStyle } = await setup('cropbox-offset')
    tools.set('shape')
    toolStyle.set({ border: '#00FF00', width: 3 }, { group: 'shape' })
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 160, h.top + 140)
    expect(container.querySelector('[data-ink-draft="shape"]')).not.toBeNull()
    pointer(container, 'pointerup', h.left + 160, h.top + 140)
    expect(container.querySelector('[data-ink-draft]')).toBeNull()
    const [sq] = session(doc)
    expect(sq).toMatchObject({ type: 'square', color: '#00FF00', width: 3 })
    // CropBox [50 50 550 750]: css (100,100) is user (150, 650); 60 x 40.
    expect(sq!.rect).toEqual({ x: 150, y: 610, width: 60, height: 40 })
    expect(doc.annotations.selection.get()).toEqual([sq!.id])
  })

  it('click without drag places a 72pt rectangle centred on the press', async () => {
    const { doc, container, viewport, tools } = await setup('cropbox-offset')
    tools.set('shape')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 200, h.top + 300)
    pointer(container, 'pointerup', h.left + 200, h.top + 300)
    const [sq] = session(doc)
    expect(sq?.type).toBe('square')
    // css (200,300) is user (250, 450).
    expect(sq!.rect).toEqual({ x: 214, y: 414, width: 72, height: 72 })
    expect(doc.annotations.selection.get()).toEqual([sq!.id])
  })

  it('Enter places a default shape at the page centre', async () => {
    const { doc, container, tools } = await setup('cropbox-offset')
    tools.set('shape', { kind: 'ellipse' })
    container.tabIndex = 0
    container.focus()
    enter(container)
    const [c] = session(doc)
    expect(c?.type).toBe('circle')
    expect(c!.rect).toEqual({ x: 264, y: 364, width: 72, height: 72 })
    expect(doc.annotations.selection.get()).toEqual([c!.id])
  })

  it('Shift drag makes a circle from ellipse kind', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('shape', { kind: 'ellipse' })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    const shift = { shiftKey: true }
    pointer(container, 'pointerdown', h.left + 100, h.top + 100, shift)
    pointer(container, 'pointermove', h.left + 200, h.top + 140, shift)
    pointer(container, 'pointerup', h.left + 200, h.top + 140, shift)
    const [c] = session(doc)
    expect(c?.type).toBe('circle')
    expect(c!.rect.width).toBe(100)
    expect(c!.rect.height).toBe(100)
  })

  it('arrow kind creates line with tail and intent', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('shape', { kind: 'arrow' })
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 220, h.top + 160)
    pointer(container, 'pointerup', h.left + 220, h.top + 160)
    const [l] = session(doc)
    const t = viewport.transformFor(0)
    expect(l).toMatchObject({
      type: 'line',
      tail: 'openArrow',
      intent: 'lineArrow',
      start: t.fromCss({ x: 100, y: 100 }),
      end: t.fromCss({ x: 220, y: 160 }),
    })
    // The overlay draws the tail ending.
    expect(
      host.querySelector(`[data-annotation="${l!.id}"] [data-ending="tail"]`)
    ).not.toBeNull()
  })

  it('star and polygon kinds create polygons from the options', async () => {
    const { doc, container, viewport, tools } = await setup()
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    tools.set('shape', { kind: 'star', points: 6 })
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointerup', h.left + 200, h.top + 200)
    tools.set('shape', { kind: 'polygon', sides: 8 })
    pointer(container, 'pointerdown', h.left + 300, h.top + 100)
    pointer(container, 'pointerup', h.left + 400, h.top + 200)
    const [star, poly] = session(doc)
    expect(star).toMatchObject({ type: 'polygon' })
    expect(star?.type === 'polygon' && star.vertices).toHaveLength(12)
    expect(poly?.type === 'polygon' && poly.vertices).toHaveLength(8)
  })

  it('rounded rectangle renders rx scaled to css px', async () => {
    const { doc, container, viewport, tools, mounts } = await setup()
    tools.set('shape', { kind: 'roundedRectangle' })
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 200, h.top + 160)
    pointer(container, 'pointerup', h.left + 200, h.top + 160)
    const [sq] = session(doc)
    expect(sq).toMatchObject({ type: 'square', cornerRadius: 8 })
    const rx = () =>
      host.querySelector(`[data-annotation="${sq!.id}"] rect`)?.getAttribute('rx')
    const before = viewport.transformFor(0).toCssLength(8)
    expect(Number(rx())).toBeCloseTo(before)
    viewport.setZoom(2)
    await until(
      () => viewport.transformFor(0).toCssLength(8) === before * 2 && mounts.size > 0
    )
    await until(() => Number(rx()) === before * 2)
  })

  it('rotated fixture: drag geometry lands in user space', async () => {
    const { doc, container, viewport, tools } = await setup('text-rotated-90')
    tools.set('shape')
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 160, h.top + 140)
    pointer(container, 'pointerup', h.left + 160, h.top + 140)
    const [sq] = session(doc)
    const t = viewport.transformFor(0)
    // A 60 x 40 css drag on a page rotated 90 degrees is 40 x 60 in user space, and maps back.
    expect(sq!.rect.width).toBeCloseTo(40)
    expect(sq!.rect.height).toBeCloseTo(60)
    const back = t.toCssRect(sq!.rect)
    expect(back.left).toBeCloseTo(100)
    expect(back.top).toBeCloseTo(100)
    expect(back.width).toBeCloseTo(60)
    expect(back.height).toBeCloseTo(40)
    // Enter still centres on the rotated page.
    container.tabIndex = 0
    container.focus()
    enter(container)
    const centred = session(doc)[1]!
    const c = t.toCssRect(centred.rect)
    const box = t.page.box
    const middle = t.toCss({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
    expect(c.left + c.width / 2).toBeCloseTo(middle.x)
    expect(c.top + c.height / 2).toBeCloseTo(middle.y)
  })

  it('a drag cancelled mid-way leaves no draft and no annotation', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('shape')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 160, h.top + 140)
    pointer(container, 'pointercancel', h.left + 160, h.top + 140)
    expect(container.querySelector('[data-ink-draft]')).toBeNull()
    expect(session(doc)).toEqual([])
  })

  it('in controlled mode the shape goes through onChange and is selected before the host applies', async () => {
    const { doc, container, viewport, tools } = await setup('text-simple', {
      controlled: true,
    })
    tools.set('shape')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 160, h.top + 140)
    pointer(container, 'pointerup', h.left + 160, h.top + 140)
    expect(doc.annotations.list.get()).toEqual([])
    await settle()
    const [sq] = doc.annotations.list.get()
    expect(sq?.type).toBe('square')
    expect(doc.annotations.selection.get()).toEqual([sq!.id])
  })
})

describe('speech bubble', () => {
  const session = (doc: InkDocument) =>
    doc.annotations.list.get().filter((a) => a.source === 'session')
  const editorIn = (root: Element) => root.querySelector<HTMLElement>('[data-ink-editor]')
  const drag = (container: Element, h: DOMRect) => {
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 220, h.top + 160)
    pointer(container, 'pointerup', h.left + 220, h.top + 160)
  }

  it('bubble starts editing on creation and an empty bubble is kept', async () => {
    const { doc, container, viewport, tools } = await setup('cropbox-offset')
    tools.set('shape', { kind: 'bubble' })
    drag(container, viewport.hostFor(0)!.getBoundingClientRect())
    const [bubble] = session(doc)
    expect(bubble).toMatchObject({
      type: 'freetext',
      intent: 'freeTextCallout',
      contents: '',
      cornerRadius: 8,
    })
    expect(doc.annotations.selection.get()).toEqual([bubble!.id])
    const editor = editorIn(container)
    expect(editor).not.toBeNull()
    expect(document.activeElement).toBe(editor)
    await userEvent.keyboard('{Escape}')
    expect(editorIn(container)).toBeNull()
    expect(session(doc)).toHaveLength(1)
    // Typing is a second step: undo removes the text, then the bubble.
    const again = viewport
      .hostFor(0)!
      .querySelector<HTMLElement>(`[data-annotation="${bubble!.id}"]`)!
    again.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    await until(() => editorIn(container) !== null)
    await userEvent.keyboard('Hello{Escape}')
    const typed = doc.annotations.get(bubble!.id)
    expect(typed).toMatchObject({ contents: 'Hello' })
    // Clearing an existing bubble's text keeps it too.
    again.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    await until(() => editorIn(container) !== null)
    document.getSelection()!.selectAllChildren(editorIn(container)!)
    await userEvent.keyboard('{Backspace}{Escape}')
    expect(doc.annotations.get(bubble!.id)).toMatchObject({ contents: '' })
  })

  it('creates with the shape group border and fill and the text group text style', async () => {
    const { doc, container, viewport, tools, toolStyle } = await setup('cropbox-offset')
    tools.set('shape', { kind: 'bubble' })
    toolStyle.set({ border: '#00FF00', fill: '#FFFF00', width: 3 }, { group: 'shape' })
    toolStyle.set({ textColor: '#FF0000', fontWeight: 'bold' }, { group: 'text' })
    drag(container, viewport.hostFor(0)!.getBoundingClientRect())
    const [bubble] = session(doc)
    expect(bubble).toMatchObject({
      borderColor: '#00FF00',
      color: '#FFFF00',
      width: 3,
      defaultStyle: { color: '#FF0000', fontWeight: 'bold' },
    })
  })

  it('click places a default bubble and its tail follows rotation', async () => {
    const { doc, container, viewport, tools } = await setup('text-rotated-90')
    tools.set('shape', { kind: 'bubble' })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 200, h.top + 300)
    pointer(container, 'pointerup', h.left + 200, h.top + 300)
    const [bubble] = session(doc)
    if (bubble?.type !== 'freetext') throw new Error('not free text')
    expect(bubble.rect.width).toBeCloseTo(72)
    expect(bubble.rect.height).toBeCloseTo(72)
    const [tip, knee] = bubble.callout!
    expect(knee!.x).toBeCloseTo(bubble.rect.x + 18)
    expect(knee!.y).toBeCloseTo(bubble.rect.y)
    expect(tip!.x).toBeCloseTo(knee!.x - 24)
    expect(tip!.y).toBeCloseTo(knee!.y - 24)
    await userEvent.keyboard('{Escape}')
  })

  it('in controlled mode the editor opens once the host has applied the bubble', async () => {
    const { doc, container, viewport, tools } = await setup('text-simple', {
      controlled: true,
    })
    tools.set('shape', { kind: 'bubble' })
    drag(container, viewport.hostFor(0)!.getBoundingClientRect())
    expect(doc.annotations.list.get()).toEqual([])
    await settle()
    const [bubble] = doc.annotations.list.get()
    expect(bubble?.type).toBe('freetext')
    expect(doc.annotations.selection.get()).toEqual([bubble!.id])
    await until(() => editorIn(container) !== null)
    await userEvent.keyboard('{Escape}')
  })
})

describe('freetext tool', () => {
  const session = (doc: InkDocument) =>
    doc.annotations.list.get().filter((a) => a.source === 'session')
  const editorIn = (root: Element) => root.querySelector<HTMLElement>('[data-ink-editor]')
  const enter = (el: Element) =>
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )

  it('is a built-in tool in the text style group, labelled Text', () => {
    const tool = builtinTools().find((t) => t.id === 'freetext')
    expect(tool?.styleGroup).toBe('text')
    expect(TOOL_LABELS.freetext).toBe('Text')
  })

  /** The stand-in a new box is typed into before it joins the store. */
  const pendingIn = (root: Element) =>
    root.querySelector<HTMLElement>('[data-ink-pending]')

  it('click places a box and focuses an editor', async () => {
    const { doc, container, viewport, tools, toolStyle } = await setup('cropbox-offset')
    tools.set('freetext')
    toolStyle.set({ textColor: '#FF0000', fontWeight: 'bold' }, { group: 'text' })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointerup', h.left + 100, h.top + 100)
    const editor = editorIn(container)
    expect(editor).not.toBeNull()
    expect(document.activeElement).toBe(editor)
    // Nothing joins the store until the box has text.
    expect(session(doc)).toEqual([])
    await userEvent.keyboard('Hi{Escape}')
    const [box] = session(doc)
    expect(box).toMatchObject({
      type: 'freetext',
      contents: 'Hi',
      defaultStyle: { color: '#FF0000', fontWeight: 'bold' },
    })
    // CropBox [50 50 550 750]: css (100,100) is user (150, 650), the box's top-left corner.
    expect(box!.rect.x).toBeCloseTo(150)
    expect(box!.rect.y + box!.rect.height).toBeCloseTo(650)
    expect(box!.rect.width).toBe(DEFAULT_FREETEXT_WIDTH)
    expect(doc.annotations.selection.get()).toEqual([box!.id])
    expect(pendingIn(container)).toBeNull()
    expect(document.activeElement).toBe(
      container.querySelector(`[data-annotation="${box!.id}"]`)
    )
  })

  it('drag sizes the box', async () => {
    const { doc, container, viewport, tools } = await setup('cropbox-offset')
    tools.set('freetext')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 260, h.top + 160)
    expect(container.querySelector('[data-ink-draft="freetext"]')).not.toBeNull()
    pointer(container, 'pointerup', h.left + 260, h.top + 160)
    expect(container.querySelector('[data-ink-draft]')).toBeNull()
    expect(document.activeElement).toBe(editorIn(container))
    await userEvent.keyboard('Hi{Escape}')
    const [box] = session(doc)
    expect(box!.rect).toEqual({ x: 150, y: 590, width: 160, height: 60 })
  })

  it('typing grows the box height and commits on Escape, as one undo step with the box', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('freetext')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointerup', h.left + 100, h.top + 100)
    const el = pendingIn(container)!
    const startHeight = parseFloat(el.style.height)
    const t = viewport.transformFor(0)
    const start = t.fromCssRect({
      left: parseFloat(el.style.left),
      top: parseFloat(el.style.top),
      width: parseFloat(el.style.width),
      height: startHeight,
    })
    await userEvent.keyboard('one{Enter}two{Enter}three')
    await until(() => parseFloat(el.style.height) > startHeight)
    const changes: AnnotationChange[] = []
    cleanup.push(doc.annotations.on('change', (c) => changes.push(c)))
    await userEvent.keyboard('{Escape}')
    expect(changes).toHaveLength(1)
    const [change] = changes
    expect(change?.kind).toBe('add')
    if (change?.kind !== 'add') return
    expect(change.annotation).toMatchObject({ contents: 'one\ntwo\nthree' })
    expect(change.annotation.rect.height).toBeGreaterThan(start.height * 2)
    expect(change.annotation.rect.y + change.annotation.rect.height).toBeCloseTo(
      start.y + start.height
    )
    expect(editorIn(container)).toBeNull()
    const drawn = container.querySelector(`[data-annotation="${change.annotation.id}"]`)!
    expect(drawn.querySelector('.ink-free-text')?.textContent).toBe('one\ntwo\nthree')
    // One undo takes the whole box away: nothing empty is left behind to export.
    doc.history.undo()
    expect(session(doc)).toEqual([])
  })

  it('an empty box never joins the store', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('freetext')
    const changes = vi.fn()
    cleanup.push(doc.annotations.on('change', changes))
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointerup', h.left + 100, h.top + 100)
    await userEvent.keyboard('   {Escape}')
    expect(session(doc)).toEqual([])
    expect(changes).not.toHaveBeenCalled()
    expect(pendingIn(container)).toBeNull()
    // Focus stays in the viewport.
    expect(document.activeElement).toBe(container)
  })

  it('a container resize mid-edit keeps the editor open with focus and the typed text', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('freetext')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointerup', h.left + 100, h.top + 100)
    await userEvent.keyboard('Hi')
    // An existing box being re-edited too.
    const a = doc.annotations.add({
      type: 'freetext',
      page: 0,
      rect: { x: 300, y: 300, width: 144, height: 20 },
      contents: 'Old',
    })
    await userEvent.keyboard('{Escape}')
    const el = container.querySelector<HTMLElement>(`[data-annotation="${a.id}"]`)!
    el.querySelector('.ink-free-text')!.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, detail: 2 })
    )
    await userEvent.keyboard('{End}er')
    const updates = vi.fn()
    viewport.layout.subscribe(updates)
    container.style.width = '700px'
    await until(() => updates.mock.calls.length > 0)
    await settle()
    expect(editorIn(el)).not.toBeNull()
    expect(document.activeElement).toBe(editorIn(el))
    await userEvent.keyboard('!{Escape}')
    expect(doc.annotations.get(a.id)).toMatchObject({ contents: 'Older!' })
    expect(session(doc).map((x) => x.type === 'freetext' && x.contents)).toEqual(
      expect.arrayContaining(['Hi', 'Older!'])
    )
  })

  it('a new box mid-edit survives a resize, and a zoom commits it with focus on the box', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('freetext')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointerup', h.left + 100, h.top + 100)
    await userEvent.keyboard('Hi')
    container.style.width = '700px'
    await settle(100)
    expect(document.activeElement).toBe(editorIn(container))
    viewport.setZoom(2)
    await until(() => editorIn(container) === null)
    const [box] = session(doc)
    expect(box).toMatchObject({ contents: 'Hi' })
    expect(document.activeElement).not.toBe(document.body)
  })

  it('a press on the page while editing commits without placing another box', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('freetext')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointerup', h.left + 100, h.top + 100)
    await userEvent.keyboard('Hi')
    pointer(container, 'pointerdown', h.left + 300, h.top + 500)
    pointer(container, 'pointerup', h.left + 300, h.top + 500)
    expect(session(doc)).toHaveLength(1)
    expect(session(doc)[0]).toMatchObject({ contents: 'Hi' })
    expect(editorIn(container)).toBeNull()
  })

  it('Enter on the viewport edits the one selected freetext, however it was selected', async () => {
    const { doc, container, tools } = await setup()
    tools.set('select')
    const a = doc.annotations.add({
      type: 'freetext',
      page: 0,
      rect: { x: 100, y: 600, width: 144, height: 20 },
      contents: 'Hi',
    })
    const b = doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 300, y: 300, width: 50, height: 50 },
    })
    container.tabIndex = 0
    container.focus()
    doc.annotations.select([a.id, b.id])
    enter(container)
    expect(editorIn(container)).toBeNull()
    doc.annotations.select([a.id])
    enter(container)
    const el = container.querySelector<HTMLElement>(`[data-annotation="${a.id}"]`)!
    expect(editorIn(el)?.textContent).toBe('Hi')
    expect(document.activeElement).toBe(editorIn(el))
    await userEvent.keyboard('{End}!{Escape}')
    expect(doc.annotations.get(a.id)).toMatchObject({ contents: 'Hi!' })
  })

  it('an embedded freetext stays read-only: neither Enter nor double-click edits it', async () => {
    const { doc, container, tools } = await setup()
    tools.set('select')
    // Embedded boxes are painted on the canvas; the overlay draws only a hit area. Unlocked
    // here so the embedded check alone has to refuse it.
    const a = doc.annotations.completeInput({
      type: 'freetext',
      page: 0,
      rect: { x: 100, y: 600, width: 144, height: 20 },
      contents: 'From the file',
    })
    doc.annotations._setEmbedded([{ ...a, id: 'pdf:0:9R', source: 'pdf' }])
    await settle()
    container.tabIndex = 0
    container.focus()
    doc.annotations.select(['pdf:0:9R'])
    enter(container)
    expect(editorIn(container)).toBeNull()
    const el = container.querySelector<HTMLElement>('[data-annotation="pdf:0:9R"]')!
    el.firstElementChild!.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, detail: 2 })
    )
    el.focus()
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    expect(editorIn(container)).toBeNull()
  })

  it('a new box over an existing annotation keeps its editor on top', async () => {
    const theme = document.createElement('style')
    theme.textContent = themeCss
    document.head.append(theme)
    cleanup.push(() => theme.remove())
    const { doc, container, viewport, tools } = await setup()
    const t = viewport.transformFor(0)
    const under = doc.annotations.add({
      type: 'square',
      page: 0,
      rect: t.fromCssRect({ left: 80, top: 80, width: 300, height: 100 }),
      interiorColor: '#00FF00',
    })
    tools.set('freetext')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointerup', h.left + 100, h.top + 100)
    const editor = editorIn(container)!
    const r = editor.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    expect(editor.contains(hit)).toBe(true)
    expect(hit?.closest(`[data-annotation="${under.id}"]`)).toBeNull()
  })

  it('double-click a freetext edits it; Enter on a selected freetext edits it', async () => {
    const { doc, container, tools } = await setup()
    tools.set('select-text')
    const a = doc.annotations.add({
      type: 'freetext',
      page: 0,
      rect: { x: 100, y: 600, width: 144, height: 20 },
      contents: 'Hi',
    })
    const el = container.querySelector<HTMLElement>(`[data-annotation="${a.id}"]`)!
    const box = el.querySelector('.ink-free-text')!
    box.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }))
    expect(editorIn(el)?.textContent).toBe('Hi')
    expect(document.activeElement).toBe(editorIn(el))
    // Escape commits nothing new and hands focus back to the box.
    await userEvent.keyboard('{Escape}')
    expect(editorIn(el)).toBeNull()
    expect(doc.annotations.get(a.id)).toBe(a)
    expect(document.activeElement).toBe(el)
    doc.annotations.select([a.id])
    await userEvent.keyboard('{Enter}')
    expect(editorIn(el)?.textContent).toBe('Hi')
    await userEvent.keyboard('{End}!{Escape}')
    expect(doc.annotations.get(a.id)).toMatchObject({ contents: 'Hi!' })
  })

  it('does not edit a locked freetext', async () => {
    const { doc, container } = await setup()
    const a = doc.annotations.add({
      type: 'freetext',
      page: 0,
      rect: { x: 100, y: 600, width: 144, height: 20 },
      contents: 'Hi',
    })
    doc.annotations.update(a.id, { locked: true })
    const el = container.querySelector<HTMLElement>(`[data-annotation="${a.id}"]`)!
    el.querySelector('.ink-free-text')!.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, detail: 2 })
    )
    expect(editorIn(el)).toBeNull()
  })

  it('Enter with the tool active places a box at the page centre and edits', async () => {
    const { doc, container, viewport, tools } = await setup('cropbox-offset')
    tools.set('freetext')
    container.tabIndex = 0
    container.focus()
    enter(container)
    expect(document.activeElement).toBe(editorIn(container))
    await userEvent.keyboard('Hi{Escape}')
    const [box] = session(doc)
    const t = viewport.transformFor(0)
    const c = t.toCssRect(box!.rect)
    const pb = t.page.box
    const middle = t.toCss({ x: pb.x + pb.width / 2, y: pb.y + pb.height / 2 })
    expect(c.left + c.width / 2).toBeCloseTo(middle.x)
    // Placed one 12pt line high, centred; typing may grow it downwards from there.
    expect(c.top).toBeCloseTo(middle.y - t.toCssLength(12 * 1.2) / 2)
  })

  it('editing works on the rotated fixture', async () => {
    const { doc, container, viewport, tools } = await setup('text-rotated-90')
    tools.set('freetext')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 260, h.top + 140)
    pointer(container, 'pointerup', h.left + 260, h.top + 140)
    const t = viewport.transformFor(0)
    const el = pendingIn(container)!
    await userEvent.keyboard('one{Enter}two{Enter}three{Enter}four')
    await until(() => parseFloat(el.style.height) > 40)
    await userEvent.keyboard('{Escape}')
    const [box] = session(doc)
    expect(box).toMatchObject({ contents: 'one\ntwo\nthree\nfour' })
    // A 160 x 40 css drag on a page rotated 90 degrees is 40 wide in user space, and grows
    // downwards on screen: along user x.
    expect(box!.rect.height).toBeCloseTo(160)
    const back = t.toCssRect(box!.rect)
    expect(back.left).toBeCloseTo(100)
    expect(back.top).toBeCloseTo(100)
    expect(back.width).toBeCloseTo(160)
    expect(back.height).toBeGreaterThan(40)
  })
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

  it('shows handles only while a select tool is active', async () => {
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
    // Selected under select-text, the default: it drags them too.
    expect(handles()).toHaveLength(4)
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

describe('selection editing', () => {
  /** The page host, its client rect and a client-point helper for a user-space point. */
  async function page0(viewport: Viewport) {
    await settle()
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    const t = viewport.transformFor(0)
    const at = (x: number, y: number) => {
      const c = t.toCss({ x, y })
      return [h.left + c.x, h.top + c.y] as const
    }
    const el = (id: string) =>
      host.querySelector(`[data-annotation="${id}"]`) as HTMLElement
    const handle = (id: string, name: string) =>
      host.querySelector<HTMLElement>(
        `[data-annotation="${id}"] > [data-handle="${name}"]`
      )
    return { host, at, el, handle }
  }

  it('select-text moves a selected square by drag', async () => {
    const { doc, container, viewport, tools } = await setup()
    expect(tools.active.get()).toBe('select-text')
    const a = doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
      interiorColor: '#00ff00',
    })
    const { at, el } = await page0(viewport)
    const [x, y] = at(110, 620)
    pointer(el(a.id), 'pointerdown', x, y)
    expect(doc.annotations.selection.get()).toEqual([a.id])
    pointer(container, 'pointermove', x + 20, y + 10)
    pointer(container, 'pointermove', x + 40, y + 20)
    expect(el(a.id).style.transform).toBe('translate(40px, 20px)')
    pointer(container, 'pointerup', x + 40, y + 20)
    expect(el(a.id).style.transform).toBe('')
    expect(doc.annotations.get(a.id)!.rect).toEqual({
      x: 140,
      y: 580,
      width: 50,
      height: 30,
    })
  })

  it('select-text resizes by corner handle', async () => {
    const { doc, container, viewport } = await setup()
    const a = doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    doc.annotations.select([a.id])
    const { at, handle } = await page0(viewport)
    const se = handle(a.id, 'se')!
    expect(se).not.toBeNull()
    const [x, y] = at(150, 600)
    pointer(se, 'pointerdown', x, y)
    pointer(container, 'pointermove', x + 20, y + 10)
    pointer(container, 'pointerup', x + 20, y + 10)
    const r = doc.annotations.get(a.id)!.rect
    expect(r.x).toBeCloseTo(100, 5)
    expect(r.y).toBeCloseTo(590, 5)
    expect(r.width).toBeCloseTo(70, 5)
    expect(r.height).toBeCloseTo(40, 5)
  })

  it('line shows two endpoint handles and dragging end moves only end', async () => {
    const { doc, container, viewport } = await setup()
    const a = doc.annotations.add({
      type: 'line',
      page: 0,
      start: { x: 100, y: 600 },
      end: { x: 200, y: 650 },
      width: 2,
    })
    doc.annotations.select([a.id])
    const { host, at, handle } = await page0(viewport)
    const names = [
      ...host.querySelectorAll(`[data-annotation="${a.id}"] > [data-handle]`),
    ].map((h) => (h as HTMLElement).dataset.handle)
    expect(names).toEqual(['start', 'end'])
    const end = handle(a.id, 'end')!
    const [x, y] = at(200, 650)
    pointer(end, 'pointerdown', x, y)
    pointer(container, 'pointermove', x + 10, y)
    pointer(container, 'pointermove', x + 20, y - 10)
    pointer(container, 'pointerup', x + 20, y - 10)
    const next = doc.annotations.get(a.id)!
    if (next.type !== 'line') throw new Error('not a line')
    expect(next.start).toEqual({ x: 100, y: 600 })
    expect(next.end.x).toBeCloseTo(220, 5)
    expect(next.end.y).toBeCloseTo(660, 5)
    expect(next.rect.x).toBeCloseTo(99, 5)
    expect(next.rect.y).toBeCloseTo(599, 5)
    expect(next.rect.width).toBeCloseTo(122, 5)
    expect(next.rect.height).toBeCloseTo(62, 5)
  })

  it('dragging the tail handle moves callout[0] only', async () => {
    const { doc, container, viewport } = await setup()
    const a = doc.annotations.add({
      type: 'freetext',
      page: 0,
      contents: 'Hi',
      intent: 'freeTextCallout',
      cornerRadius: 8,
      width: 1,
      rect: { x: 100, y: 600, width: 100, height: 40 },
      callout: [
        { x: 101, y: 576 },
        { x: 125, y: 600 },
      ],
    })
    doc.annotations.select([a.id])
    const { host, at, handle } = await page0(viewport)
    const names = [
      ...host.querySelectorAll(`[data-annotation="${a.id}"] > [data-handle]`),
    ].map((h) => (h as HTMLElement).dataset.handle)
    expect(names).toEqual(['nw', 'ne', 'sw', 'se', 'callout'])
    const tail = handle(a.id, 'callout')!
    const [x, y] = at(101, 576)
    pointer(tail, 'pointerdown', x, y)
    pointer(container, 'pointermove', x + 10, y)
    pointer(container, 'pointermove', x + 20, y + 10)
    pointer(container, 'pointerup', x + 20, y + 10)
    const next = doc.annotations.get(a.id)!
    if (next.type !== 'freetext') throw new Error('not free text')
    expect(next.rect).toEqual(a.type === 'freetext' ? a.rect : undefined)
    expect(next.callout![1]).toEqual({ x: 125, y: 600 })
    expect(next.callout![0]!.x).toBeCloseTo(121, 5)
    expect(next.callout![0]!.y).toBeCloseTo(566, 5)
  })

  it('ink scales by corner handle', async () => {
    const { doc, container, viewport } = await setup()
    const a = doc.annotations.add({
      type: 'ink',
      page: 0,
      inklist: [
        [
          { x: 100, y: 600 },
          { x: 150, y: 650 },
        ],
      ],
      width: 2,
    })
    doc.annotations.select([a.id])
    const { at, handle } = await page0(viewport)
    // The handles sit on the drawn box: the path's bounds padded by half the stroke.
    const se = handle(a.id, 'se')!
    expect(se).not.toBeNull()
    const [x, y] = at(151, 599)
    pointer(se, 'pointerdown', x, y)
    pointer(container, 'pointermove', x + 52, y + 52)
    pointer(container, 'pointerup', x + 52, y + 52)
    const next = doc.annotations.get(a.id)!
    if (next.type !== 'ink') throw new Error('not ink')
    const [p, q] = next.inklist[0]!
    expect(p!.x).toBeCloseTo(101, 5)
    expect(p!.y).toBeCloseTo(549, 5)
    expect(q!.x).toBeCloseTo(201, 5)
    expect(q!.y).toBeCloseTo(649, 5)
  })

  it('Shift locks aspect while resizing a square', async () => {
    const { doc, container, viewport } = await setup()
    const a = doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    doc.annotations.select([a.id])
    const { at, handle } = await page0(viewport)
    const [x, y] = at(150, 600)
    pointer(handle(a.id, 'se')!, 'pointerdown', x, y, { shiftKey: true })
    pointer(container, 'pointermove', x + 20, y + 2, { shiftKey: true })
    pointer(container, 'pointerup', x + 20, y + 2, { shiftKey: true })
    const r = doc.annotations.get(a.id)!.rect
    expect(r.width).toBeCloseTo(70, 5)
    expect(r.height).toBeCloseTo(42, 5)
    // The nw corner stays at (100, 630).
    expect(r.x).toBeCloseTo(100, 5)
    expect(r.y + r.height).toBeCloseTo(630, 5)
  })

  it('a multi-selection moves together in one undo step', async () => {
    const { doc, container, viewport } = await setup()
    const a = doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
      interiorColor: '#00ff00',
    })
    const b = doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 300, y: 500, width: 50, height: 30 },
      interiorColor: '#00ff00',
    })
    doc.annotations.select([a.id, b.id])
    const { at, el } = await page0(viewport)
    const [x, y] = at(110, 620)
    pointer(el(a.id), 'pointerdown', x, y)
    // Pressing a member of the selection keeps the rest selected.
    expect(new Set(doc.annotations.selection.get())).toEqual(new Set([a.id, b.id]))
    pointer(container, 'pointermove', x + 10, y)
    pointer(container, 'pointermove', x + 20, y)
    expect(el(b.id).style.transform).toBe('translate(20px, 0px)')
    pointer(container, 'pointerup', x + 20, y)
    expect(doc.annotations.get(a.id)!.rect.x).toBe(120)
    expect(doc.annotations.get(b.id)!.rect.x).toBe(320)
    doc.history.undo()
    expect(doc.annotations.get(a.id)!.rect.x).toBe(100)
    expect(doc.annotations.get(b.id)!.rect.x).toBe(300)
  })

  it('a click on a member of a multi-selection selects just that one', async () => {
    const { doc, viewport, onActivate } = await setup()
    const a = doc.annotations.add({
      type: 'text',
      page: 0,
      rect: { x: 100, y: 600, width: 20, height: 20 },
    })
    const b = doc.annotations.add({
      type: 'text',
      page: 0,
      rect: { x: 300, y: 600, width: 20, height: 20 },
    })
    doc.annotations.select([a.id, b.id])
    const { at, el } = await page0(viewport)
    const [x, y] = at(110, 610)
    pointer(el(a.id), 'pointerdown', x, y)
    pointer(el(a.id), 'pointerup', x, y)
    expect(doc.annotations.selection.get()).toEqual([a.id])
    expect(onActivate).toHaveBeenCalledWith(a.id)
  })

  /** A highlight over the fixture's "Hello" line, and a client point on it. */
  async function helloHighlight(
    doc: Awaited<ReturnType<typeof setup>>['doc'],
    viewport: Viewport
  ) {
    const { items } = await doc.text(0)
    const first = items.find((i) => i.str.startsWith('Hello'))!
    const hl = doc.annotations.add({ type: 'highlight', page: 0, quads: [first.quad] })
    const { at, el, host } = await page0(viewport)
    const [x, y] = at(first.rect.x + 4, first.rect.y + first.rect.height / 2)
    const poly = el(hl.id).querySelector('polygon')!
    return { hl, x, y, poly, host }
  }

  for (const tool of ['select-text', 'select'] as const) {
    it(`${tool}: Shift-click on markup adds it to the selection`, async () => {
      const { doc, viewport, tools } = await setup()
      tools.set(tool)
      const sq = doc.annotations.add({
        type: 'text',
        page: 0,
        rect: { x: 300, y: 300, width: 20, height: 20 },
      })
      const { hl, x, y, poly } = await helloHighlight(doc, viewport)
      doc.annotations.select([sq.id])
      pointer(poly, 'pointerdown', x, y, { shiftKey: true })
      pointer(poly, 'pointerup', x, y, { shiftKey: true })
      expect(new Set(doc.annotations.selection.get())).toEqual(new Set([sq.id, hl.id]))
      pointer(poly, 'pointerdown', x, y, { shiftKey: true })
      pointer(poly, 'pointerup', x, y, { shiftKey: true })
      expect(doc.annotations.selection.get()).toEqual([sq.id])
    })
  }

  it('select: a drag on a highlight selects and moves it, with no text selection', async () => {
    const { doc, container, viewport, tools, onActivate } = await setup()
    tools.set('select')
    const { hl, x, y, poly } = await helloHighlight(doc, viewport)
    window.getSelection()?.removeAllRanges()
    pointer(poly, 'pointerdown', x, y)
    expect(doc.annotations.selection.get()).toEqual([hl.id])
    expect(onActivate).toHaveBeenCalledWith(hl.id)
    pointer(container, 'pointermove', x + 20, y)
    pointer(container, 'pointermove', x + 40, y)
    pointer(container, 'pointerup', x + 40, y)
    const moved = doc.annotations.get(hl.id)!
    expect(moved.rect.x).toBeCloseTo(hl.rect.x + 40, 5)
    expect(moved.rect.y).toBeCloseTo(hl.rect.y, 5)
    expect(window.getSelection()?.toString()).toBe('')
  })

  it('select-text: a drag on a highlight selects text and leaves the highlight', async () => {
    const { doc, viewport } = await setup()
    const { hl, x, y, poly } = await helloHighlight(doc, viewport)
    pointer(poly, 'pointerdown', x, y)
    pointer(poly, 'pointermove', x + 20, y)
    pointer(poly, 'pointermove', x + 40, y)
    pointer(poly, 'pointerup', x + 40, y)
    expect(doc.annotations.selection.get()).toEqual([])
    expect(doc.annotations.get(hl.id)!.rect).toEqual(hl.rect)
    expect(window.getSelection()?.toString()).not.toBe('')
    window.getSelection()?.removeAllRanges()
  })

  it('a group move leaves a locked member in place, in one undo step', async () => {
    const { doc, container, viewport } = await setup()
    const rect = (x: number) => ({ x, y: 600, width: 50, height: 30 })
    const [a, b, c] = [100, 200, 300].map((x) =>
      doc.annotations.add({
        type: 'square',
        page: 0,
        rect: rect(x),
        interiorColor: '#00ff00',
      })
    ) as [Annotation, Annotation, Annotation]
    doc.annotations.update(c.id, { locked: true })
    doc.annotations.select([a.id, b.id, c.id])
    const { at, el } = await page0(viewport)
    const [x, y] = at(110, 620)
    pointer(el(a.id), 'pointerdown', x, y)
    pointer(container, 'pointermove', x + 10, y)
    pointer(container, 'pointermove', x + 20, y)
    expect(el(c.id).style.transform).toBe('')
    pointer(container, 'pointerup', x + 20, y)
    expect(doc.annotations.get(a.id)!.rect).toEqual(rect(120))
    expect(doc.annotations.get(b.id)!.rect).toEqual(rect(220))
    expect(doc.annotations.get(c.id)!.rect).toEqual(rect(300))
    doc.history.undo()
    expect(doc.annotations.get(a.id)!.rect).toEqual(rect(100))
    expect(doc.annotations.get(b.id)!.rect).toEqual(rect(200))
    expect(doc.annotations.get(c.id)!.locked).toBe(true)
  })

  it('a group move under a controlled store goes through onChange', async () => {
    const { doc, container, viewport } = await setup('text-simple', { controlled: true })
    const rect = (x: number) => ({ x, y: 600, width: 50, height: 30 })
    doc.annotations.add({
      type: 'square',
      page: 0,
      rect: rect(100),
      interiorColor: '#00ff00',
    })
    doc.annotations.add({
      type: 'square',
      page: 0,
      rect: rect(200),
      interiorColor: '#00ff00',
    })
    await until(() => doc.annotations.list.get().length === 2)
    const [a, b] = doc.annotations.list.get() as [Annotation, Annotation]
    doc.annotations.select([a.id, b.id])
    await until(() => doc.annotations.selection.get().length === 2)
    const { at, el } = await page0(viewport)
    const [x, y] = at(110, 620)
    pointer(el(a.id), 'pointerdown', x, y)
    pointer(container, 'pointermove', x + 20, y)
    pointer(container, 'pointerup', x + 20, y)
    // The host applies proposals a microtask later: nothing has moved yet.
    expect(doc.annotations.get(a.id)!.rect).toEqual(rect(100))
    await until(
      () =>
        doc.annotations.get(a.id)!.rect.x === 120 &&
        doc.annotations.get(b.id)!.rect.x === 220
    )
  })

  it('view is gone: tools.set("view") throws like any unknown id', async () => {
    const { tools } = await setup()
    // Like any unknown id.
    expect(() => tools.set('view')).toThrow(RangeError)
    expect(tools.active.get()).toBe('select-text')
    expect(builtinTools().map((t) => t.id)).not.toContain('view')
  })
})

describe('tool registry and options', () => {
  /** A stand-in for a creation tool with options, recording what it sees on activate. */
  function optionTool(seen: object[]): Tool<{ kind: string; sides: number }> {
    return {
      id: 'stand-in',
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
    expect(tools.options('stand-in').get()).toEqual({ kind: 'rectangle', sides: 6 })
    tools.set('stand-in', { kind: 'ellipse' })
    expect(seen.at(-1)).toEqual({ kind: 'ellipse', sides: 6 })
    tools.set('select')
    tools.set('stand-in')
    expect(tools.options('stand-in').get()).toEqual({ kind: 'ellipse', sides: 6 })
    expect(seen.at(-1)).toEqual({ kind: 'ellipse', sides: 6 })
    tools.setOptions('stand-in', { sides: 8 })
    expect(tools.active.get()).toBe('stand-in')
    expect(tools.options('stand-in').get()).toEqual({ kind: 'ellipse', sides: 8 })
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
