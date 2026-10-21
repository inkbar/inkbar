import themeCss from '@inkbar/theme/theme.css?inline'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import standardCallout from '../model/annotations/__fixtures__/standard-callout.json'
import {
  freeTextBox,
  isStandardCallout,
  withCalloutBounds,
} from '../model/annotations/callout'
import { staticDefaults } from '../model/annotations/defaults'
import { isBubble } from '../model/annotations/edit'
import { exportAnnotations, importAnnotations } from '../model/annotations/json'
import { createSnapshotHistory } from '../model/annotations/snapshot-history'
import { createAnnotationStore } from '../model/annotations/store'
import { readonly, writable } from '../model/readable'
import { createMemorySignatureStore, createSignatureLibrary } from '../model/signatures'

import { JOIN_GAP_MS } from './ink-stroke'
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
  type ToolContext,
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
import type { Rect } from '../model/geometry'
import type { SignatureLibrary, SignatureTemplate } from '../model/signatures'

/**
 * `controlled: true` opens the document with a host that applies each proposal a microtask
 * later, the way Vue's v-model does, so a tool's synchronous multi-step mutation runs before
 * any of it is applied.
 */
async function setup(
  name:
    | 'text-simple'
    | 'cropbox-offset'
    | 'text-rotated-90'
    | 'mixed-page-sizes' = 'text-simple',
  {
    controlled = false,
    custom = false,
    tools: hostTools,
    snapshotHistory = false,
    signatures,
  }: {
    controlled?: boolean
    custom?: boolean
    tools?: Tool[]
    /** The signature templates the `signature` tool places from. */
    signatures?: SignatureLibrary
    /** Controlled only: undo and redo over the host's list, as the bindings give such hosts. */
    snapshotHistory?: boolean
  } = {}
) {
  let host: Annotation[] = []
  const snapshot = snapshotHistory
    ? createSnapshotHistory({
        apply: (list) => doc.annotations.replaceAll(list, 'history'),
        enabled: () => true,
      })
    : undefined
  snapshot?.observe(host)
  const doc = await openFixtureInBrowser(
    name,
    controlled
      ? {
          annotations: {
            mode: 'controlled',
            initial: [],
            onChange: (next) => {
              host = next
              queueMicrotask(() => {
                doc.annotations.setControlledValue(host)
                snapshot?.observe(host)
              })
            },
          },
        }
      : {}
  )
  const history = snapshot ?? doc.history
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
  const tracker = trackToolStyle({ store: doc.annotations, history })
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
      history,
      ...(signatures ? { signatures } : {}),
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
    history,
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

  /** Selects the text of the span holding `text` on page 0 and releases the pointer on it. */
  function selectSpanAndRelease(
    container: HTMLElement,
    viewport: Viewport,
    text = 'QQ123456C'
  ): void {
    const span = [
      ...viewport.hostFor(0)!.querySelectorAll('[data-ink-text-layer] span'),
    ].find((s) => s.textContent?.includes(text))!
    const range = document.createRange()
    range.selectNodeContents(span)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    const r = span.getBoundingClientRect()
    pointer(container, 'pointerup', r.right, r.bottom)
  }

  it('highlight tool no longer copies selected text into contents', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('highlight')
    selectSpanAndRelease(container, viewport)
    const [hl] = doc.annotations.list.get()
    expect(hl?.type).toBe('highlight')
    expect(hl?.contents).toBeUndefined()
  })

  it('highlight selects the new markup', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('highlight')
    selectSpanAndRelease(container, viewport)
    const [hl] = doc.annotations.list.get()
    expect(doc.annotations.selection.get()).toEqual([hl!.id])
  })

  it('underline kind creates underline', async () => {
    const { doc, container, viewport, tools } = await setup()
    expect(tools.options('highlight').get()).toEqual({ kind: 'highlight' })
    tools.set('highlight', { kind: 'underline' })
    selectSpanAndRelease(container, viewport)
    tools.set('highlight', { kind: 'squiggly' })
    selectSpanAndRelease(container, viewport)
    tools.set('highlight', { kind: 'strikeout' })
    selectSpanAndRelease(container, viewport)
    expect(doc.annotations.list.get().map((a) => a.type)).toEqual([
      'underline',
      'squiggly',
      'strikeout',
    ])
  })

  it.each(['text-simple', 'text-rotated-90'] as const)(
    'commented highlight shows .ink-comment-marker (%s)',
    async (fixture) => {
      const { doc, viewport } = await setup(fixture)
      const quad = (x: number, y: number) => ({
        p1: { x, y: y + 12 },
        p2: { x: x + 60, y: y + 12 },
        p3: { x, y },
        p4: { x: x + 60, y },
      })
      const hl = doc.annotations.add({
        type: 'highlight',
        page: 0,
        quads: [quad(72, 700), quad(72, 680)],
      })
      await settle()
      const el = () =>
        viewport.hostFor(0)!.querySelector<HTMLElement>(`[data-annotation="${hl.id}"]`)!
      expect(el().querySelector('.ink-comment-marker')).toBeNull()
      doc.annotations.update(hl.id, { contents: 'Check this' })
      await settle()
      const marker = el().querySelector<HTMLElement>('span.ink-comment-marker')
      expect(marker).not.toBeNull()
      expect(el().getAttribute('aria-label')).toBe('Highlight with comment')
      // At the last quad's top-right corner, wherever the page's rotation puts it.
      const t = viewport.transformFor(0)
      const corner = t.toCss({ x: 132, y: 692 })
      const box = el().getBoundingClientRect()
      const host = viewport.hostFor(0)!.getBoundingClientRect()
      expect(box.left - host.left + parseFloat(marker!.style.left)).toBeCloseTo(
        corner.x,
        0
      )
      expect(box.top - host.top + parseFloat(marker!.style.top)).toBeCloseTo(corner.y, 0)
      doc.annotations.update(hl.id, { contents: ' ' })
      await settle()
      expect(el().querySelector('.ink-comment-marker')).toBeNull()
    }
  )

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
      // Both are selected, through the host too.
      expect(doc.annotations.selection.get()).toEqual(list.map((a) => a.id))
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

  it('loupe: goes through onChange, then draws its lens once the host applies it', async () => {
    const { doc, container, viewport, tools } = await setup('text-simple', {
      controlled: true,
    })
    tools.set('shape', { kind: 'loupe' })
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointerup', h.left + 100, h.top + 100)
    expect(doc.annotations.list.get()).toEqual([])
    await settle()
    const [loupe] = doc.annotations.list.get()
    expect(loupe).toMatchObject({ type: 'loupe', magnification: 2 })
    expect(doc.annotations.selection.get()).toEqual([loupe!.id])
    const lens = host.querySelector<HTMLCanvasElement>(
      `[data-annotation="${loupe!.id}"] canvas[data-ink-loupe]`
    )!
    await until(() => lens.width > 0)
  })

  it('freetext: a new box reaches onChange once, with its text', async () => {
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
    // Escape commits and ends the tool's use, which clears the selection.
    expect(tools.active.get()).toBe('select-text')
    expect(doc.annotations.selection.get()).toEqual([])
  })

  it('sketch: the ink and the swap to its shape go through onChange, as two undo steps', async () => {
    const { doc, container, viewport, tools, history } = await setup('text-simple', {
      controlled: true,
      snapshotHistory: true,
    })
    tools.set('sketch')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    const r = 60
    pointer(container, 'pointerdown', h.left + 200 + r, h.top + 200)
    for (let i = 1; i <= 64; i++) {
      const t = (i / 60) * Math.PI * 2
      pointer(
        container,
        'pointermove',
        h.left + 200 + r * Math.cos(t),
        h.top + 200 + r * Math.sin(t)
      )
    }
    pointer(container, 'pointerup', h.left + 200 + r, h.top + 200)
    // Nothing is written until the host applies it: first the ink, then the swap.
    expect(doc.annotations.list.get()).toEqual([])
    await until(() => doc.annotations.list.get()[0]?.type === 'circle')
    await settle()
    expect(doc.annotations.list.get().map((a) => a.type)).toEqual(['circle'])
    history.undo()
    await until(() => doc.annotations.list.get()[0]?.type === 'ink')
    history.undo()
    await until(() => doc.annotations.list.get().length === 0)
  })

  it('signature: a placed signature goes through onChange and is selected', async () => {
    const signatures = await library([INK_TEMPLATE])
    const { doc, container, viewport, tools } = await setup('text-simple', {
      controlled: true,
      signatures,
    })
    tools.set('signature', { templateId: INK_TEMPLATE.id })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 300, h.top + 400)
    pointer(container, 'pointerup', h.left + 300, h.top + 400)
    // Nothing is written until the host applies it.
    expect(doc.annotations.list.get()).toEqual([])
    await settle()
    const list = doc.annotations.list.get()
    expect(list).toHaveLength(1)
    const [sig] = list
    expect(sig).toMatchObject({ type: 'ink', subject: 'Signature' })
    expect(doc.annotations.selection.get()).toEqual([sig!.id])
  })

  it.each(['switching tool', 'destroying the controller'])(
    'sketch: %s before a controlled host applies the ink leaves the ink and fires nothing later',
    async (how) => {
      const { doc, container, viewport, tools } = await setup('text-simple', {
        controlled: true,
      })
      tools.set('sketch')
      const h = viewport.hostFor(0)!.getBoundingClientRect()
      pointer(container, 'pointerdown', h.left + 260, h.top + 200)
      for (let i = 1; i <= 64; i++) {
        const t = (i / 60) * Math.PI * 2
        pointer(
          container,
          'pointermove',
          h.left + 200 + 60 * Math.cos(t),
          h.top + 200 + 60 * Math.sin(t)
        )
      }
      pointer(container, 'pointerup', h.left + 260, h.top + 200)
      if (how === 'switching tool') tools.set('select')
      else tools.destroy()
      await settle(100)
      expect(doc.annotations.list.get().map((a) => a.type)).toEqual(['ink'])
    }
  )

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
      tail: 'OpenArrow',
      intent: 'LineArrow',
      start: t.fromCss({ x: 100, y: 100 }),
      end: t.fromCss({ x: 220, y: 160 }),
    })
    // The overlay draws the tail ending.
    expect(
      host.querySelector(`[data-annotation="${l!.id}"] [data-ending="tail"]`)
    ).not.toBeNull()
  })

  it('a plain line has no line endings until the line style picks them', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('shape', { kind: 'line' })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointerup', h.left + 220, h.top + 160)
    const [l] = session(doc)
    expect(l?.type === 'line' && [l.head, l.tail]).toEqual(['None', 'None'])
  })

  it.each([
    ['line', { head: 'OpenArrow', tail: 'OpenArrow' }],
    ['line', { head: 'OpenArrow', tail: 'None' }],
    ['arrow', { head: 'None', tail: 'None' }],
    ['arrow', { head: 'OpenArrow', tail: 'OpenArrow' }],
  ] as const)('a new %s takes its ends from the line style %o', async (kind, ends) => {
    const { doc, container, viewport, tools, toolStyle } = await setup()
    toolStyle.set(ends, { group: 'shape' })
    tools.set('shape', { kind })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointerup', h.left + 220, h.top + 160)
    const [l] = session(doc)
    expect(l).toMatchObject({ type: 'line', ...ends })
  })

  it('star and polygon kinds fill the dragged box', async () => {
    const { doc, container, viewport, tools } = await setup()
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    const t = viewport.transformFor(0)
    tools.set('shape', { kind: 'star', points: 5 })
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointerup', h.left + 200, h.top + 160)
    tools.set('shape', { kind: 'polygon', sides: 6 })
    pointer(container, 'pointerdown', h.left + 300, h.top + 100)
    pointer(container, 'pointerup', h.left + 400, h.top + 160)
    const [star, poly] = session(doc)
    const drag = (x: number) => {
      const a = t.fromCss({ x, y: 100 })
      const b = t.fromCss({ x: x + 100, y: 160 })
      return {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
      }
    }
    for (const [shape, box] of [
      [star, drag(100)],
      [poly, drag(300)],
    ] as const) {
      expect(shape!.rect.x).toBeCloseTo(box.x)
      expect(shape!.rect.y).toBeCloseTo(box.y)
      expect(shape!.rect.width).toBeCloseTo(box.width)
      expect(shape!.rect.height).toBeCloseTo(box.height)
    }
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

  it('loupe kind: a drag makes a square loupe with the shape group rim, a circle draft first', async () => {
    const { doc, container, viewport, tools, toolStyle } = await setup('cropbox-offset')
    tools.set('shape', { kind: 'loupe' })
    toolStyle.set({ border: '#00FF00', width: 3 }, { group: 'shape' })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 160, h.top + 140)
    const draft = container.querySelector<HTMLElement>('[data-ink-draft="shape"]')!
    expect(draft.dataset.inkShape).toBe('loupe')
    expect(draft.querySelector('ellipse')).not.toBeNull()
    expect(draft.style.width).toBe('60px')
    expect(draft.style.height).toBe('60px')
    pointer(container, 'pointerup', h.left + 160, h.top + 140)
    const [loupe] = session(doc)
    expect(loupe).toMatchObject({
      type: 'loupe',
      magnification: 2,
      color: '#00FF00',
      width: 3,
    })
    // CropBox [50 50 550 750]: css (100,100) is user (150, 650); the square takes the 60.
    expect(loupe!.rect).toEqual({ x: 150, y: 590, width: 60, height: 60 })
    expect(doc.annotations.selection.get()).toEqual([loupe!.id])
  })

  it('loupe kind: a click places a 72pt loupe, Enter places none', async () => {
    const { doc, container, viewport, tools } = await setup('cropbox-offset')
    tools.set('shape', { kind: 'loupe' })
    container.tabIndex = 0
    container.focus()
    enter(container)
    expect(session(doc)).toEqual([])
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 200, h.top + 300)
    pointer(container, 'pointerup', h.left + 200, h.top + 300)
    const [loupe] = session(doc)
    expect(loupe?.type).toBe('loupe')
    expect(loupe!.rect).toEqual({ x: 214, y: 414, width: 72, height: 72 })
  })

  it('loupe kind on the rotated fixture at view rotation 270: a square under the drag', async () => {
    const { doc, container, viewport, tools } = await setup('text-rotated-90')
    viewport.setRotation(270)
    await until(() => viewport.transformFor(0).rotation === 270)
    await settle()
    tools.set('shape', { kind: 'loupe' })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 180, h.top + 140)
    pointer(container, 'pointerup', h.left + 180, h.top + 140)
    const [loupe] = session(doc)
    const t = viewport.transformFor(0)
    expect(loupe!.rect.width).toBeCloseTo(80)
    expect(loupe!.rect.height).toBeCloseTo(80)
    // The square grows from the press along the drag: right and down on screen.
    const back = t.toCssRect(loupe!.rect)
    expect(back.left).toBeCloseTo(100)
    expect(back.top).toBeCloseTo(100)
    expect(back.width).toBeCloseTo(80)
    expect(back.height).toBeCloseTo(80)
  })

  it('mask kind: a drag makes a rect mask, a draft box first, and ignores the shape style', async () => {
    const { doc, container, viewport, tools, toolStyle } = await setup('cropbox-offset')
    tools.set('shape', { kind: 'mask' })
    toolStyle.set({ border: '#00FF00', fill: '#0000FF', width: 5 }, { group: 'shape' })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 220, h.top + 160)
    const draft = container.querySelector<HTMLElement>('[data-ink-draft="shape"]')!
    expect(draft.dataset.inkShape).toBe('mask')
    expect(draft.querySelector('rect')).not.toBeNull()
    expect(draft.style.width).toBe('120px')
    pointer(container, 'pointerup', h.left + 220, h.top + 160)
    const [mask] = session(doc)
    expect(mask).toMatchObject({
      type: 'mask',
      shape: 'rect',
      dim: 0.5,
      color: '#000000',
    })
    expect(mask).not.toHaveProperty('interiorColor')
    // CropBox [50 50 550 750]: css (100,100) is user (150, 650).
    expect(mask!.rect).toEqual({ x: 150, y: 590, width: 120, height: 60 })
    expect(doc.annotations.selection.get()).toEqual([mask!.id])
    // The page is dimmed outside it.
    expect(
      viewport.hostFor(0)!.querySelector('svg[data-ink-mask-layer] path')
    ).not.toBeNull()
  })

  it('mask kind: an oval mask drags an ellipse, Shift a circle', async () => {
    const { doc, container, viewport, tools } = await setup('cropbox-offset')
    tools.set('shape', { kind: 'ovalMask' })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 220, h.top + 160, { shiftKey: true })
    const draft = container.querySelector<HTMLElement>('[data-ink-draft="shape"]')!
    expect(draft.querySelector('ellipse')).not.toBeNull()
    pointer(container, 'pointerup', h.left + 220, h.top + 160, { shiftKey: true })
    const [mask] = session(doc)
    expect(mask).toMatchObject({ type: 'mask', shape: 'ellipse' })
    expect(mask!.rect.width).toBe(120)
    expect(mask!.rect.height).toBe(120)
  })

  it('mask kind: a click places a 72pt mask, Enter places none', async () => {
    const { doc, container, viewport, tools } = await setup('cropbox-offset')
    tools.set('shape', { kind: 'mask' })
    container.tabIndex = 0
    container.focus()
    enter(container)
    expect(session(doc)).toEqual([])
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 200, h.top + 300)
    pointer(container, 'pointerup', h.left + 200, h.top + 300)
    const [mask] = session(doc)
    expect(mask?.type).toBe('mask')
    expect(mask!.rect).toEqual({ x: 214, y: 414, width: 72, height: 72 })
    tools.set('shape', { kind: 'ovalMask' })
    enter(container)
    expect(session(doc)).toHaveLength(1)
  })

  it('mask kind: a second mask on the page replaces the first, one undo brings it back', async () => {
    const { doc, container, viewport, tools, history } = await setup()
    tools.set('shape', { kind: 'mask' })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    const drag = (x0: number, y0: number, x: number, y: number) => {
      // The shape tool is one-shot: each mask is a fresh pick.
      tools.set('shape', { kind: 'mask' })
      pointer(container, 'pointerdown', h.left + x0, h.top + y0)
      pointer(container, 'pointermove', h.left + x, h.top + y)
      pointer(container, 'pointerup', h.left + x, h.top + y)
    }
    drag(100, 100, 200, 200)
    const [first] = session(doc)
    drag(300, 300, 400, 350)
    const [second, ...rest] = session(doc)
    expect(rest).toEqual([])
    expect(second!.id).not.toBe(first!.id)
    expect(doc.annotations.selection.get()).toEqual([second!.id])
    const host = viewport.hostFor(0)!
    expect(host.querySelectorAll('[data-type="mask"]')).toHaveLength(1)
    history.undo()
    expect(session(doc).map((a) => a.id)).toEqual([first!.id])
    expect(host.querySelectorAll('svg[data-ink-mask-layer]')).toHaveLength(1)
  })

  it('mask kind: in controlled mode the replacement reaches the host as one change', async () => {
    const { doc, container, viewport, tools } = await setup('text-simple', {
      controlled: true,
    })
    tools.set('shape', { kind: 'mask' })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    const drag = (x0: number, y0: number, x: number, y: number) => {
      // The shape tool is one-shot: each mask is a fresh pick.
      tools.set('shape', { kind: 'mask' })
      pointer(container, 'pointerdown', h.left + x0, h.top + y0)
      pointer(container, 'pointermove', h.left + x, h.top + y)
      pointer(container, 'pointerup', h.left + x, h.top + y)
    }
    drag(100, 100, 200, 200)
    await settle()
    const [first] = session(doc)
    expect(first?.type).toBe('mask')
    drag(300, 300, 400, 350)
    expect(session(doc).map((a) => a.id)).toEqual([first!.id])
    await settle()
    const [second, ...rest] = session(doc)
    expect(rest).toEqual([])
    expect(second!.id).not.toBe(first!.id)
    expect(doc.annotations.selection.get()).toEqual([second!.id])
  })

  it('mask kind on the rotated fixture at view rotation 270: a box under the drag', async () => {
    const { doc, container, viewport, tools } = await setup('text-rotated-90')
    viewport.setRotation(270)
    await until(() => viewport.transformFor(0).rotation === 270)
    await settle()
    tools.set('shape', { kind: 'mask' })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointermove', h.left + 180, h.top + 140)
    pointer(container, 'pointerup', h.left + 180, h.top + 140)
    const [mask] = session(doc)
    const t = viewport.transformFor(0)
    const back = t.toCssRect(mask!.rect)
    expect(back.left).toBeCloseTo(100)
    expect(back.top).toBeCloseTo(100)
    expect(back.width).toBeCloseTo(80)
    expect(back.height).toBeCloseTo(40)
    // The layer spans the rotated page.
    const svg = viewport.hostFor(0)!.querySelector('svg[data-ink-mask-layer]')!
    expect(svg.getAttribute('width')).toBe(String(t.cssWidth))
    expect(svg.getAttribute('height')).toBe(String(t.cssHeight))
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

describe('draw tool', () => {
  const inks = (doc: InkDocument) =>
    doc.annotations.list.get().filter((a) => a.type === 'ink')
  const pen = (pressure: number, extra: PointerEventInit = {}): PointerEventInit => ({
    pointerType: 'pen',
    pressure,
    ...extra,
  })

  /** One press-drag-release stroke along `moves` (CSS offsets in the page host). */
  function stroke(
    container: Element,
    h: DOMRect,
    moves: [number, number, number][],
    pointerType = 'pen'
  ): void {
    const [first, ...rest] = moves
    const at = (m: [number, number, number], extra: PointerEventInit = {}) =>
      ({ pointerType, pressure: m[2], ...extra }) satisfies PointerEventInit
    pointer(container, 'pointerdown', h.left + first![0], h.top + first![1], at(first!))
    for (const m of rest)
      pointer(container, 'pointermove', h.left + m[0], h.top + m[1], at(m))
    const last = moves[moves.length - 1]!
    pointer(
      container,
      'pointerup',
      h.left + last[0],
      h.top + last[1],
      at(last, { pressure: 0 })
    )
  }

  it('draw creates ink with pressure when the pen reports it', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('draw')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100, pen(0.2))
    pointer(container, 'pointermove', h.left + 130, h.top + 120, pen(0.6))
    expect(container.querySelector('[data-ink-draft="draw"] path')).not.toBeNull()
    pointer(container, 'pointermove', h.left + 160, h.top + 120, pen(0.9))
    pointer(container, 'pointerup', h.left + 160, h.top + 120, pen(0, { buttons: 0 }))
    expect(container.querySelector('[data-ink-draft]')).toBeNull()
    const [ink] = inks(doc)
    if (ink?.type !== 'ink') throw new Error('no ink')
    expect(ink.inklist).toHaveLength(1)
    expect(ink.pressure).toEqual([[0.2, 0.6, 0.9]])
    expect(ink.inklist[0]).toHaveLength(3)
  })

  it('mouse input omits pressure', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('draw')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    stroke(
      container,
      h,
      [
        [100, 100, 0.5],
        [140, 130, 0.5],
        [180, 130, 0.5],
      ],
      'mouse'
    )
    const [ink] = inks(doc)
    expect(ink?.type).toBe('ink')
    expect(ink).not.toHaveProperty('pressure')
  })

  it('drops pressure from a pen that always reports 0 or 0.5', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('draw')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    stroke(
      container,
      h,
      [
        [100, 100, 0.5],
        [140, 130, 0.5],
        [180, 130, 0.5],
      ],
      'pen'
    )
    expect(inks(doc)[0]).not.toHaveProperty('pressure')
  })

  it('strokes within JOIN_GAP_MS join one annotation; each stroke is one undo step', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('draw')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    stroke(container, h, [
      [100, 100, 0.3],
      [140, 120, 0.6],
      [180, 120, 0.6],
    ])
    stroke(container, h, [
      [100, 200, 0.4],
      [140, 220, 0.7],
      [180, 220, 0.7],
    ])
    stroke(container, h, [
      [100, 300, 0.4],
      [140, 320, 0.7],
      [180, 320, 0.7],
    ])
    const [ink, ...others] = inks(doc)
    if (ink?.type !== 'ink') throw new Error('no ink')
    expect(others).toEqual([])
    expect(ink.inklist).toHaveLength(3)
    expect(ink.pressure?.map((p) => p.length)).toEqual(ink.inklist.map((p) => p.length))
    // The rect grew to hold every stroke.
    expect(ink.rect.height).toBeGreaterThan(190)
    doc.history.undo()
    const afterUndo = inks(doc)[0]
    expect(afterUndo?.type === 'ink' && afterUndo.inklist).toHaveLength(2)
    doc.history.undo()
    const first = inks(doc)[0]
    expect(first?.type === 'ink' && first.inklist).toHaveLength(1)
    doc.history.undo()
    expect(inks(doc)).toEqual([])
  })

  it('a pen stroke joining mouse ink keeps its pressure', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('draw')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    stroke(
      container,
      h,
      [
        [100, 100, 0.5],
        [140, 120, 0.5],
      ],
      'mouse'
    )
    stroke(container, h, [
      [100, 200, 0.3],
      [140, 220, 0.8],
    ])
    const [ink] = inks(doc)
    if (ink?.type !== 'ink') throw new Error('no ink')
    expect(ink.inklist).toHaveLength(2)
    // The mouse stroke takes 0.5 throughout, which draws as it did with no pressure.
    expect(ink.pressure?.[0]?.every((p) => p === 0.5)).toBe(true)
    expect(ink.pressure?.[1]).toContain(0.8)
    expect(ink.pressure?.map((p) => p.length)).toEqual(ink.inklist.map((p) => p.length))
  })

  it('quick strokes join one annotation under a host that applies changes later', async () => {
    const { doc, container, viewport, tools } = await setup('text-simple', {
      controlled: true,
    })
    tools.set('draw')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    stroke(container, h, [
      [100, 100, 0.3],
      [140, 120, 0.6],
    ])
    stroke(container, h, [
      [100, 200, 0.4],
      [140, 220, 0.7],
    ])
    await settle()
    const list = inks(doc)
    expect(list).toHaveLength(1)
    expect(list[0]?.type === 'ink' && list[0].inklist).toHaveLength(2)
  })

  it('a stroke after the gap starts a new annotation', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('draw')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(10_000)
    stroke(container, h, [
      [100, 100, 0.3],
      [140, 120, 0.6],
    ])
    now.mockReturnValue(10_000 + JOIN_GAP_MS + 1)
    stroke(container, h, [
      [100, 200, 0.3],
      [140, 220, 0.6],
    ])
    now.mockRestore()
    expect(inks(doc)).toHaveLength(2)
  })

  it("the gap runs to the next stroke's press, not its release", async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('draw')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(10_000)
    stroke(container, h, [
      [100, 100, 0.3],
      [140, 120, 0.6],
    ])
    // Pressed 600 ms after the first stroke ended, released 1.2 s after: still joins.
    now.mockReturnValue(10_600)
    pointer(container, 'pointerdown', h.left + 100, h.top + 200, pen(0.3))
    pointer(container, 'pointermove', h.left + 140, h.top + 220, pen(0.6))
    now.mockReturnValue(11_200)
    pointer(container, 'pointerup', h.left + 140, h.top + 220, pen(0, { buttons: 0 }))
    now.mockRestore()
    expect(inks(doc)).toHaveLength(1)
  })

  it('a stroke within the gap on another page starts a new annotation', async () => {
    const { doc, container, viewport, tools } = await setup()
    await until(() => viewport.hostFor(1) !== undefined)
    tools.set('draw')
    const h0 = viewport.hostFor(0)!.getBoundingClientRect()
    stroke(container, h0, [
      [100, 100, 0.3],
      [140, 120, 0.6],
    ])
    const h1 = viewport.hostFor(1)!.getBoundingClientRect()
    stroke(container, h1, [
      [100, 100, 0.3],
      [140, 120, 0.6],
    ])
    expect(
      inks(doc)
        .map((a) => a.page)
        .sort()
    ).toEqual([0, 1])
  })

  it('a stroke within the gap after the annotation was undone starts a new one', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('draw')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    stroke(container, h, [
      [100, 100, 0.3],
      [140, 120, 0.6],
    ])
    doc.history.undo()
    expect(inks(doc)).toEqual([])
    stroke(container, h, [
      [100, 200, 0.3],
      [140, 220, 0.6],
    ])
    const [ink, ...others] = inks(doc)
    expect(others).toEqual([])
    expect(ink?.type === 'ink' && ink.inklist).toHaveLength(1)
  })

  it('Escape or switching tool ends the annotation', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('draw')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    stroke(container, h, [
      [100, 100, 0.3],
      [140, 120, 0.6],
    ])
    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
    stroke(container, h, [
      [100, 200, 0.3],
      [140, 220, 0.6],
    ])
    expect(inks(doc)).toHaveLength(2)
    tools.set('select')
    tools.set('draw')
    stroke(container, h, [
      [100, 300, 0.3],
      [140, 320, 0.6],
    ])
    expect(inks(doc)).toHaveLength(3)
  })

  it.each(['draw', 'sketch'] as const)(
    '%s: Escape mid-stroke drops the stroke',
    async (tool) => {
      const { doc, container, viewport, tools } = await setup()
      tools.set(tool)
      const h = viewport.hostFor(0)!.getBoundingClientRect()
      pointer(container, 'pointerdown', h.left + 100, h.top + 100)
      pointer(container, 'pointermove', h.left + 160, h.top + 140)
      pointer(container, 'pointermove', h.left + 220, h.top + 100)
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
      expect(container.querySelector('[data-ink-draft]')).toBeNull()
      pointer(container, 'pointerup', h.left + 220, h.top + 100)
      await settle()
      expect(doc.annotations.list.get()).toEqual([])
    }
  )

  it('uses getCoalescedEvents when available', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('draw')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    for (const x of [140, 180]) {
      const move = new PointerEvent('pointermove', {
        clientX: h.left + x,
        clientY: h.top + 100,
        bubbles: true,
        pointerId: 1,
        buttons: 1,
        isPrimary: true,
      })
      const sub = (dx: number) =>
        new PointerEvent('pointermove', {
          clientX: h.left + x + dx,
          clientY: h.top + 100,
        })
      Object.defineProperty(move, 'getCoalescedEvents', {
        value: () => [sub(-10), sub(-5), sub(0)],
      })
      container.dispatchEvent(move)
    }
    // The release lands where the last move ended: no extra sample.
    pointer(container, 'pointerup', h.left + 180, h.top + 100)
    const [ink] = inks(doc)
    if (ink?.type !== 'ink') throw new Error('no ink')
    expect(ink.inklist[0]).toHaveLength(1 + 3 * 2)
  })

  it('draws in page space on a page with /Rotate 90', async () => {
    const { doc, container, viewport, tools } = await setup('text-rotated-90')
    tools.set('draw')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    stroke(
      container,
      h,
      [
        [100, 100, 0.5],
        [160, 100, 0.5],
        [160, 160, 0.5],
      ],
      'mouse'
    )
    const [ink] = inks(doc)
    if (ink?.type !== 'ink') throw new Error('no ink')
    const t = viewport.transformFor(0)
    expect(ink.inklist[0]![0]).toEqual(t.fromCss({ x: 100, y: 100 }))
    expect(ink.inklist[0]![2]).toEqual(t.fromCss({ x: 160, y: 160 }))
    expect(ink.rect.width).toBeGreaterThan(0)
  })

  it('in controlled mode each stroke goes through onChange', async () => {
    const { doc, container, viewport, tools } = await setup('text-simple', {
      controlled: true,
    })
    tools.set('draw')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    stroke(container, h, [
      [100, 100, 0.3],
      [140, 120, 0.6],
    ])
    expect(doc.annotations.list.get()).toEqual([])
    await settle()
    expect(inks(doc)).toHaveLength(1)
    stroke(container, h, [
      [100, 200, 0.3],
      [140, 220, 0.6],
    ])
    const pending = inks(doc)[0]
    expect(pending?.type === 'ink' && pending.inklist).toHaveLength(1)
    await settle()
    const [ink, ...others] = inks(doc)
    expect(others).toEqual([])
    expect(ink?.type === 'ink' && ink.inklist).toHaveLength(2)
  })
})

describe('sketch tool', () => {
  const session = (doc: InkDocument) =>
    doc.annotations.list.get().filter((a) => a.source === 'session')

  /** A mouse stroke through `points`, CSS offsets in the page host. */
  function stroke(container: Element, h: DOMRect, points: [number, number][]): void {
    const [first, ...rest] = points
    pointer(container, 'pointerdown', h.left + first![0], h.top + first![1])
    for (const [x, y] of rest) pointer(container, 'pointermove', h.left + x, h.top + y)
    const last = points[points.length - 1]!
    pointer(container, 'pointerup', h.left + last[0], h.top + last[1])
  }

  /** A hand-drawn circle round (cx, cy): a little lumpy, overshooting its start. */
  const circle = (cx: number, cy: number, r: number): [number, number][] =>
    Array.from({ length: 64 }, (_, i) => {
      const t = 0.5 + (i / 60) * Math.PI * 2
      const lump = r * (1 + 0.03 * Math.sin(t * 3))
      return [cx + lump * Math.cos(t), cy + lump * Math.sin(t)]
    })

  /** A run of cursive loops, like a signature. */
  const scrawl = (x: number, y: number): [number, number][] =>
    Array.from({ length: 160 }, (_, i) => {
      const t = (i / 159) * Math.PI * 8
      return [x + 6 * t - 14 * Math.sin(t), y - 14 * Math.cos(t)]
    })

  /** A box traced from its top-left corner, back to where it began. */
  const box = (l: number, t: number, r: number, b: number): [number, number][] => {
    const corners: [number, number][] = [
      [l, t],
      [r, t],
      [r, b],
      [l, b],
      [l, t + 4],
    ]
    return corners.flatMap(([x, y], i) => {
      if (i === 0) return [[x, y] as [number, number]]
      const [px, py] = corners[i - 1]!
      return Array.from({ length: 12 }, (_, k): [number, number] => [
        px + ((x - px) * (k + 1)) / 12,
        py + ((y - py) * (k + 1)) / 12,
      ])
    })
  }

  it('is a built-in tool in the ink style group, labelled Sketch', () => {
    const sketch = builtinTools().find((t) => t.id === 'sketch')
    expect(sketch?.styleGroup).toBe('ink')
    expect(TOOL_LABELS.sketch).toBe('Sketch')
  })

  it('a rough circle becomes a circle annotation with the shape group style', async () => {
    const { doc, container, viewport, tools, toolStyle } = await setup()
    tools.set('sketch')
    toolStyle.set({ border: '#00FF00', width: 3 }, { group: 'shape' })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    const points = circle(200, 200, 60)
    pointer(container, 'pointerdown', h.left + points[0]![0], h.top + points[0]![1])
    pointer(container, 'pointermove', h.left + points[1]![0], h.top + points[1]![1])
    expect(container.querySelector('[data-ink-draft="sketch"] path')).not.toBeNull()
    for (const [x, y] of points.slice(2))
      pointer(container, 'pointermove', h.left + x, h.top + y)
    const last = points[points.length - 1]!
    pointer(container, 'pointerup', h.left + last[0], h.top + last[1])
    expect(container.querySelector('[data-ink-draft]')).toBeNull()
    const [shape, ...others] = session(doc)
    expect(others).toEqual([])
    expect(shape).toMatchObject({ type: 'circle', color: '#00FF00', width: 3 })
    // The circle fills the box the stroke spans, in user space.
    const t = viewport.transformFor(0)
    const spans = t.fromCss({ x: 140, y: 140 })
    const ends = t.fromCss({ x: 260, y: 260 })
    const expected = {
      x: Math.min(spans.x, ends.x),
      y: Math.min(spans.y, ends.y),
      width: Math.abs(ends.x - spans.x),
      height: Math.abs(ends.y - spans.y),
    }
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(Math.abs(shape!.rect[key] - expected[key])).toBeLessThan(4)
  })

  it('an unrecognised stroke stays ink', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('sketch')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    stroke(container, h, scrawl(100, 300))
    const [ink, ...others] = session(doc)
    expect(others).toEqual([])
    if (ink?.type !== 'ink') throw new Error('not ink')
    expect(ink.inklist).toHaveLength(1)
    expect(ink.inklist[0]).toHaveLength(160)
  })

  // A click, or a click's jitter, is too small to read as a shape: it stays a visible dot of
  // ink, as with Draw, not an invisible sliver of a line.
  it('a click or a tiny stroke stays ink', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('sketch')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    stroke(container, h, [[200, 200]])
    stroke(container, h, [
      [250, 250],
      [250.4, 250.2],
    ])
    stroke(container, h, [
      [300, 300],
      [301, 300],
      [302, 301],
    ])
    expect(session(doc).map((a) => a.type)).toEqual(['ink', 'ink', 'ink'])
  })

  it('undo after recognition restores the ink stroke; a second undo removes it', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('sketch')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    stroke(container, h, box(100, 100, 260, 220))
    expect(session(doc).map((a) => a.type)).toEqual(['square'])
    doc.history.undo()
    const [ink, ...others] = session(doc)
    expect(others).toEqual([])
    expect(ink?.type === 'ink' && ink.inklist[0]).toHaveLength(49)
    doc.history.undo()
    expect(session(doc)).toEqual([])
    doc.history.redo()
    doc.history.redo()
    expect(session(doc).map((a) => a.type)).toEqual(['square'])
  })

  it('sketch does not join strokes', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('sketch')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    stroke(container, h, scrawl(100, 200))
    stroke(container, h, scrawl(100, 300))
    stroke(container, h, circle(200, 500, 50))
    expect(session(doc).map((a) => a.type)).toEqual(['ink', 'ink', 'circle'])
    for (const a of session(doc)) if (a.type === 'ink') expect(a.inklist).toHaveLength(1)
  })

  it('a box on a page with /Rotate 90 becomes a square over the stroke, in page space', async () => {
    const { doc, container, viewport, tools } = await setup('text-rotated-90')
    tools.set('sketch')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    stroke(container, h, box(100, 100, 260, 220))
    const [square] = session(doc)
    expect(square?.type).toBe('square')
    const t = viewport.transformFor(0)
    const a = t.fromCss({ x: 100, y: 100 })
    const b = t.fromCss({ x: 260, y: 220 })
    // Rotated, the box's CSS width is its user-space height.
    expect(Math.abs(square!.rect.width - Math.abs(b.x - a.x))).toBeLessThan(3)
    expect(Math.abs(square!.rect.height - Math.abs(b.y - a.y))).toBeLessThan(3)
    expect(square!.rect.width).toBeLessThan(square!.rect.height)
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
      intent: 'FreeTextCallout',
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

  it('growing the box carries a tail below it down, in one update and one undo step', async () => {
    const { doc, container, viewport, tools } = await setup('cropbox-offset')
    tools.set('shape', { kind: 'bubble' })
    drag(container, viewport.hostFor(0)!.getBoundingClientRect())
    const [made] = session(doc)
    if (made?.type !== 'freetext') throw new Error('not free text')
    await userEvent.keyboard('{Escape}')
    const t = viewport.transformFor(0)
    const updates: unknown[] = []
    const stop = doc.annotations.on('change', (c) => {
      if (c.kind === 'update') updates.push(c)
    })
    const el = viewport
      .hostFor(0)!
      .querySelector<HTMLElement>(`[data-annotation="${made.id}"]`)!
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    await until(() => editorIn(container) !== null)
    await userEvent.keyboard(
      '1{Enter}2{Enter}3{Enter}4{Enter}5{Enter}6{Enter}7{Enter}8{Escape}'
    )
    stop()
    expect(updates).toHaveLength(1)
    const grown = doc.annotations.get(made.id)
    if (grown?.type !== 'freetext') throw new Error('not free text')
    const before = freeTextBox(made)
    const after = freeTextBox(grown)
    // The box grows down: its top stays.
    expect(after.y + after.height).toBeCloseTo(before.y + before.height)
    const growth = before.y - after.y
    expect(growth).toBeGreaterThan(24)
    for (const i of [0, 1]) {
      expect(grown.callout![i]!.x).toBeCloseTo(made.callout![i]!.x)
      expect(grown.callout![i]!.y).toBeCloseTo(made.callout![i]!.y - growth)
    }
    // The rect still covers the box and the tip.
    expect(grown.rect.y).toBeCloseTo(made.rect.y - growth)
    expect(grown.rect.height).toBeCloseTo(made.rect.height + growth)
    // The tail still leaves the bottom edge and reaches the tip.
    const origin = t.toCssRect(grown.rect)
    const box = t.toCssRect(after)
    const tip = t.toCss(grown.callout![0]!)
    expect(tip.y - (box.top + box.height)).toBeCloseTo(t.toCssLength(24))
    const fmt = (n: number) => String(Math.round(n * 1000) / 1000 + 0)
    const d = el.querySelector('path.ink-bubble')!.getAttribute('d')!
    expect(d).toContain(`L${fmt(tip.x - origin.left)} ${fmt(tip.y - origin.top)}`)
    // The bottom edge's spike base sits on it.
    expect(d).toContain(
      ` ${fmt(box.top + box.height - origin.top)}L${fmt(tip.x - origin.left)}`
    )
    doc.history.undo()
    expect(doc.annotations.get(made.id)).toEqual(made)
  })

  it('growing a bubble whose tail leaves the top keeps the tail where it is', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('select')
    const tip = { x: 150, y: 700 }
    const base = { x: 160, y: 640 }
    const box = { x: 100, y: 600, width: 144, height: 40 }
    const bubble = doc.annotations.add({
      type: 'freetext',
      page: 0,
      intent: 'FreeTextCallout',
      cornerRadius: 8,
      width: 1,
      ...withCalloutBounds(box, [tip, base], 1, undefined),
      contents: '',
      callout: [tip, base],
    })
    await settle()
    const el = viewport
      .hostFor(0)!
      .querySelector<HTMLElement>(`[data-annotation="${bubble.id}"]`)!
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    await until(() => editorIn(container) !== null)
    await userEvent.keyboard('1{Enter}2{Enter}3{Enter}4{Enter}5{Enter}6{Escape}')
    const grown = doc.annotations.get(bubble.id)
    if (grown?.type !== 'freetext') throw new Error('not free text')
    const after = freeTextBox(grown)
    expect(after.height).toBeGreaterThan(40)
    expect(after.y + after.height).toBeCloseTo(640)
    expect(grown.callout).toEqual([tip, base])
    // The rect grows to cover the box.
    expect(grown.rect.y).toBeCloseTo(after.y - 0.5)
    expect(grown.rect.y + grown.rect.height).toBeCloseTo(700.5)
    doc.history.undo()
    expect(doc.annotations.get(bubble.id)).toEqual(bubble)
  })

  it('a commit keeps a rect the box was given while its editor was open', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('select')
    const box = doc.annotations.add({
      type: 'freetext',
      page: 0,
      rect: { x: 100, y: 600, width: 144, height: 40 },
      contents: 'Hi',
    })
    await settle()
    viewport
      .hostFor(0)!
      .querySelector<HTMLElement>(`[data-annotation="${box.id}"]`)!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      )
    await until(() => editorIn(container) !== null)
    const moved = { x: 200, y: 500, width: 144, height: 40 }
    doc.annotations.update(box.id, { rect: moved })
    await userEvent.keyboard('!')
    editorIn(container)?.focus()
    await userEvent.keyboard('{Escape}')
    await until(() => editorIn(container) === null)
    expect(doc.annotations.get(box.id)?.rect).toEqual(moved)
  })

  it('creating, typing and dragging the tail are separate undo steps', async () => {
    const { doc, container, viewport, tools } = await setup('cropbox-offset')
    tools.set('shape', { kind: 'bubble' })
    drag(container, viewport.hostFor(0)!.getBoundingClientRect())
    const [made] = session(doc)
    await userEvent.keyboard('Hi{Escape}')
    expect(doc.annotations.get(made!.id)).toMatchObject({ contents: 'Hi' })
    doc.history.undo()
    expect(doc.annotations.get(made!.id)).toMatchObject({ contents: '' })
    doc.history.undo()
    expect(session(doc)).toEqual([])
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

  // As a signature is: along the page as the file displays it, whatever its /Rotate.
  it('a click places a line or arrow that runs left to right on a turned page', async () => {
    const { doc, container, viewport, tools } = await setup('text-rotated-90')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    const t = viewport.transformFor(0)
    for (const [kind, x] of [
      ['arrow', 200],
      ['line', 300],
    ] as const) {
      tools.set('shape', { kind })
      pointer(container, 'pointerdown', h.left + x, h.top + 300)
      pointer(container, 'pointerup', h.left + x, h.top + 300)
    }
    for (const a of session(doc)) {
      if (a.type !== 'line') throw new Error('not a line')
      const start = t.toCss(a.start)
      const end = t.toCss(a.end)
      expect(start.y).toBeCloseTo(end.y)
      expect(end.x - start.x).toBeCloseTo(t.toCssLength(72))
    }
    expect(session(doc)).toHaveLength(2)
  })

  it('click places a default bubble and its tail follows rotation', async () => {
    const { doc, container, viewport, tools } = await setup('text-rotated-90')
    tools.set('shape', { kind: 'bubble' })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 200, h.top + 300)
    pointer(container, 'pointerup', h.left + 200, h.top + 300)
    const [bubble] = session(doc)
    if (bubble?.type !== 'freetext') throw new Error('not free text')
    const box = freeTextBox(bubble)
    expect(box.width).toBeCloseTo(72)
    expect(box.height).toBeCloseTo(72)
    const [tip, knee] = bubble.callout!
    expect(knee!.x).toBeCloseTo(box.x + 18)
    expect(knee!.y).toBeCloseTo(box.y)
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
    // Escape ends the tool's use too.
    expect(doc.annotations.selection.get()).toEqual([])
    expect(tools.active.get()).toBe('select-text')
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

  it('a new box mid-edit is committed when its page unmounts', async () => {
    const { doc, container, viewport, tools } = await setup('mixed-page-sizes')
    viewport.setZoom(3)
    await settle()
    tools.set('freetext')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 100, h.top + 100)
    pointer(container, 'pointerup', h.left + 100, h.top + 100)
    await userEvent.keyboard('Hi')
    // The window is in the background (a wheel scroll there), so focus leaving the editor as
    // its page goes does not commit it.
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    cleanup.push(() => hasFocus.mockRestore())
    container.scrollTop = container.scrollHeight
    await until(() => viewport.hostFor(0) === undefined)
    await settle()
    expect(session(doc)).toMatchObject([{ type: 'freetext', page: 0, contents: 'Hi' }])
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
    expect(document.activeElement).toBe(
      container.querySelector(`[data-annotation="${box!.id}"]`)
    )
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

const INK_TEMPLATE: SignatureTemplate = {
  id: 'sig-ink',
  kind: 'ink',
  inklist: [
    [
      { x: 0, y: 0 },
      { x: 0.5, y: 1 },
      { x: 1, y: 0 },
    ],
  ],
  aspect: 3,
}
/** A 3x1 red PNG. */
const PNG_3x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAABCAYAAAAb4BS0AAAADklEQVR4nGP4z8DwH4YBJuYF+2EsXwgAAAAASUVORK5CYII='
const IMAGE_TEMPLATE: SignatureTemplate = {
  id: 'sig-image',
  kind: 'image',
  imagedata: PNG_3x1,
  aspect: 3,
}

/** A library over a memory store holding `templates`, loaded. */
async function library(templates: SignatureTemplate[]): Promise<SignatureLibrary> {
  const lib = createSignatureLibrary(createMemorySignatureStore(templates))
  await lib.refresh()
  return lib
}

describe('signature tool', () => {
  it('signature tool click places the selected template centred', async () => {
    const signatures = await library([INK_TEMPLATE, IMAGE_TEMPLATE])
    const { doc, container, viewport, tools } = await setup('text-simple', { signatures })
    tools.set('signature', { templateId: INK_TEMPLATE.id })
    expect(container.dataset.inkTool).toBe('signature')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 300, h.top + 400)
    pointer(container, 'pointerup', h.left + 300, h.top + 400)
    const [sig] = doc.annotations.list.get()
    if (sig?.type !== 'ink') throw new Error('no ink')
    const at = viewport.transformFor(0).fromCss({ x: 300, y: 400 })
    expect(sig).toMatchObject({ subject: 'Signature', width: 2 })
    expect(sig.rect.width).toBeCloseTo(150, 5)
    expect(sig.rect.height).toBeCloseTo(50, 5)
    expect(sig.rect.x + sig.rect.width / 2).toBeCloseTo(at.x, 5)
    expect(sig.rect.y + sig.rect.height / 2).toBeCloseTo(at.y, 5)
    // The ink group's colour.
    expect(sig.color).toBe('#151820')
    expect(doc.annotations.selection.get()).toEqual([sig.id])

    tools.set('signature', { templateId: IMAGE_TEMPLATE.id })
    pointer(container, 'pointerdown', h.left + 200, h.top + 200)
    pointer(container, 'pointerup', h.left + 200, h.top + 200)
    const stamp = doc.annotations.list.get()[1]
    if (stamp?.type !== 'stamp') throw new Error('no stamp')
    expect(stamp).toMatchObject({ subject: 'Signature', imagedata: PNG_3x1 })
    expect(stamp.rotation).toBeUndefined()
    expect(stamp.rect.width).toBeCloseTo(150, 5)
  })

  it('places nothing without a template, or on a press over an annotation', async () => {
    const signatures = await library([INK_TEMPLATE])
    const { doc, container, viewport, tools } = await setup('text-simple', { signatures })
    tools.set('signature')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 300, h.top + 400)
    pointer(container, 'pointerup', h.left + 300, h.top + 400)
    expect(doc.annotations.list.get()).toEqual([])
    const sq = doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    await settle()
    tools.set('signature', { templateId: INK_TEMPLATE.id })
    const el = container.querySelector(`[data-annotation="${sq.id}"] svg *`)!
    const c = viewport.transformFor(0).toCss({ x: 125, y: 615 })
    pointer(el, 'pointerdown', h.left + c.x, h.top + c.y)
    pointer(container, 'pointerup', h.left + c.x, h.top + c.y)
    expect(doc.annotations.list.get()).toEqual([sq])
  })

  it('places a template saved after the library last loaded', async () => {
    const store = createMemorySignatureStore()
    const signatures = createSignatureLibrary(store)
    const { doc, container, viewport, tools } = await setup('text-simple', { signatures })
    await store.save(INK_TEMPLATE)
    tools.set('signature', { templateId: INK_TEMPLATE.id })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 300, h.top + 400)
    pointer(container, 'pointerup', h.left + 300, h.top + 400)
    await until(() => doc.annotations.list.get().length === 1)
    expect(doc.annotations.list.get()[0]).toMatchObject({ subject: 'Signature' })
  })

  it('places nothing from a load that finishes after the tool was switched away and back', async () => {
    const store = createMemorySignatureStore()
    const signatures = createSignatureLibrary(store)
    const { doc, container, viewport, tools } = await setup('text-simple', { signatures })
    await store.save(INK_TEMPLATE)
    let finish!: () => void
    const list = store.list.bind(store)
    store.list = () => new Promise((resolve) => (finish = () => resolve(list())))
    tools.set('signature', { templateId: INK_TEMPLATE.id })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 300, h.top + 400)
    pointer(container, 'pointerup', h.left + 300, h.top + 400)
    tools.set('select')
    tools.set('signature', { templateId: INK_TEMPLATE.id })
    finish()
    await until(() => signatures.get(INK_TEMPLATE.id) !== undefined)
    await settle()
    expect(doc.annotations.list.get()).toEqual([])
  })

  it('places nothing when the release was missed', async () => {
    const signatures = await library([INK_TEMPLATE])
    const { doc, container, viewport, tools } = await setup('text-simple', { signatures })
    tools.set('signature', { templateId: INK_TEMPLATE.id })
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 300, h.top + 400)
    pointer(container, 'pointermove', h.left + 302, h.top + 400, { buttons: 0 })
    pointer(container, 'pointerup', h.left + 302, h.top + 400)
    expect(doc.annotations.list.get()).toEqual([])
  })

  it('Enter places it at page centre', async () => {
    const signatures = await library([IMAGE_TEMPLATE])
    const { doc, container, viewport, tools } = await setup('text-simple', { signatures })
    tools.set('signature', { templateId: IMAGE_TEMPLATE.id })
    container.focus()
    await userEvent.keyboard('{Enter}')
    const [stamp] = doc.annotations.list.get()
    if (stamp?.type !== 'stamp') throw new Error('no stamp')
    const { box } = viewport.transformFor(viewport.currentPage.get()).page
    expect(stamp.rect.x + stamp.rect.width / 2).toBeCloseTo(box.x + box.width / 2, 5)
    expect(stamp.rect.y + stamp.rect.height / 2).toBeCloseTo(box.y + box.height / 2, 5)
    expect(doc.annotations.selection.get()).toEqual([stamp.id])
  })

  it('stamp renders as img with the data URL', async () => {
    const { doc, viewport } = await setup()
    const a = doc.annotations.add({
      type: 'stamp',
      page: 0,
      rect: { x: 100, y: 600, width: 90, height: 30 },
      imagedata: PNG_3x1,
      subject: 'Signature',
    })
    await settle()
    const el = viewport
      .hostFor(0)!
      .querySelector<HTMLElement>(`[data-annotation="${a.id}"]`)!
    const img = el.querySelector('img')!
    expect(img.getAttribute('src')).toBe(PNG_3x1)
    expect(img.classList.contains('ink-stamp')).toBe(true)
    expect(el.getAttribute('aria-label')).toBe('Signature')
    const box = viewport.transformFor(0).toCssRect(a.rect)
    const r = img.getBoundingClientRect()
    expect(r.width).toBeCloseTo(box.width, 0)
    expect(r.height).toBeCloseTo(box.height, 0)
  })

  it('resizing a stamp keeps aspect', async () => {
    const { doc, container, viewport, tools } = await setup()
    const a = doc.annotations.add({
      type: 'stamp',
      page: 0,
      rect: { x: 100, y: 600, width: 90, height: 30 },
      imagedata: PNG_3x1,
    })
    tools.set('select')
    doc.annotations.select([a.id])
    await settle()
    const host = viewport.hostFor(0)!
    const handle = host.querySelector<HTMLElement>(
      `[data-annotation="${a.id}"] > [data-handle="se"]`
    )!
    expect(handle).not.toBeNull()
    const h = host.getBoundingClientRect()
    const t = viewport.transformFor(0)
    const c = t.toCss({ x: 190, y: 600 })
    pointer(handle, 'pointerdown', h.left + c.x, h.top + c.y)
    pointer(container, 'pointermove', h.left + c.x + 30, h.top + c.y + 2)
    pointer(container, 'pointerup', h.left + c.x + 30, h.top + c.y + 2)
    const r = doc.annotations.get(a.id)!.rect
    expect(r.width).toBeGreaterThan(90)
    expect(r.width / r.height).toBeCloseTo(3, 5)
    // The nw corner stays at (100, 630).
    expect(r.x).toBeCloseTo(100, 5)
    expect(r.y + r.height).toBeCloseTo(630, 5)
  })

  /** Places the ink template at (200, 150) and the image one at (200, 350), CSS px on page 0. */
  async function placeBoth(view: 0 | 270) {
    const signatures = await library([INK_TEMPLATE, IMAGE_TEMPLATE])
    const { doc, container, viewport, tools } = await setup('text-rotated-90', {
      signatures,
    })
    if (view) {
      viewport.setRotation(view)
      await until(() => viewport.transformFor(0).rotation === view)
    }
    await settle()
    const t = viewport.transformFor(0)
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    tools.set('signature', { templateId: INK_TEMPLATE.id })
    pointer(container, 'pointerdown', h.left + 200, h.top + 150)
    pointer(container, 'pointerup', h.left + 200, h.top + 150)
    tools.set('signature', { templateId: IMAGE_TEMPLATE.id })
    pointer(container, 'pointerdown', h.left + 200, h.top + 350)
    pointer(container, 'pointerup', h.left + 200, h.top + 350)
    await settle()
    const [ink, stamp] = doc.annotations.list.get()
    if (ink?.type !== 'ink' || stamp?.type !== 'stamp') throw new Error('not placed')
    const img = host.querySelector(`[data-annotation="${stamp.id}"] img`)!
    return { t, ink, stamp, img }
  }

  it('reads upright on a page with /Rotate 90', async () => {
    const { t, ink, stamp, img } = await placeBoth(0)
    // Centred on the press, 150 wide and 50 high on screen.
    for (const [a, y] of [
      [ink, 150],
      [stamp, 350],
    ] as const) {
      const box = t.toCssRect(a.rect)
      expect(box.left + box.width / 2).toBeCloseTo(200, 5)
      expect(box.top + box.height / 2).toBeCloseTo(y, 5)
      expect(box.width).toBeCloseTo(t.toCssLength(150), 5)
      expect(box.height).toBeCloseTo(t.toCssLength(50), 5)
    }
    // The ink's first point, the template's bottom-left, is at the box's bottom-left on screen.
    const first = t.toCss(ink.inklist[0]![0]!)
    const inkBox = t.toCssRect(ink.rect)
    expect(first.x).toBeLessThan(inkBox.left + inkBox.width / 4)
    expect(first.y).toBeGreaterThan(inkBox.top + (inkBox.height * 3) / 4)
    // The stamp is turned against the page, and its image drawn upright to fill its box.
    expect(stamp.rotation).toBe(90)
    const r = img.getBoundingClientRect()
    expect(r.width).toBeCloseTo(t.toCssLength(150), 0)
    expect(r.height).toBeCloseTo(t.toCssLength(50), 0)
  })

  it('follows the page, not a view rotation, and turns with the page in the view', async () => {
    // /Rotate 90 plus a view rotation of 270: the page shows unrotated, and the signature,
    // placed for the page as the file displays it, turns with it like any annotation.
    const { t, ink, stamp, img } = await placeBoth(270)
    expect(t.totalRotation).toBe(0)
    expect(stamp.rotation).toBe(90)
    for (const [a, y] of [
      [ink, 150],
      [stamp, 350],
    ] as const) {
      const box = t.toCssRect(a.rect)
      expect(box.left + box.width / 2).toBeCloseTo(200, 5)
      expect(box.top + box.height / 2).toBeCloseTo(y, 5)
      // Sideways on screen: 50 wide, 150 high.
      expect(box.width).toBeCloseTo(t.toCssLength(50), 5)
      expect(box.height).toBeCloseTo(t.toCssLength(150), 5)
    }
    const r = img.getBoundingClientRect()
    expect(r.width).toBeCloseTo(t.toCssLength(50), 0)
    expect(r.height).toBeCloseTo(t.toCssLength(150), 0)
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
      intent: 'FreeTextCallout',
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
    // The box stays where it was; the rect grows to hold the moved tip.
    expect(freeTextBox(next)).toEqual(a.type === 'freetext' ? a.rect : undefined)
    expect(next.callout![1]).toEqual({ x: 125, y: 600 })
    expect(next.callout![0]!.x).toBeCloseTo(121, 5)
    expect(next.callout![0]!.y).toBeCloseTo(566, 5)
    // The drag was one history step.
    doc.history.undo()
    expect(doc.annotations.get(a.id)).toEqual(a)
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

  // A highlight is anchored to its text and may carry a comment: dragging something else in
  // the selection leaves it where it is.
  it('a group move leaves selected text markup on its text', async () => {
    const { doc, container, viewport } = await setup()
    const sq = doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
      interiorColor: '#00ff00',
    })
    const { hl } = await helloHighlight(doc, viewport)
    doc.annotations.select([sq.id, hl.id])
    const { at, el } = await page0(viewport)
    const [x, y] = at(110, 620)
    pointer(el(sq.id), 'pointerdown', x, y)
    pointer(container, 'pointermove', x + 10, y)
    pointer(container, 'pointermove', x + 20, y)
    expect(el(hl.id).style.transform).toBe('')
    pointer(container, 'pointerup', x + 20, y)
    expect(doc.annotations.get(sq.id)!.rect.x).toBe(120)
    expect(doc.annotations.get(hl.id)).toEqual(hl)
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

  // A drag from markup must not leave a text selection for the next click to redact.
  it('redact-area: a drag that starts on a highlight draws an area, not a text selection', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('redact-area')
    const { hl, x, y, poly } = await helloHighlight(doc, viewport)
    window.getSelection()?.removeAllRanges()
    pointer(poly, 'pointerdown', x, y)
    pointer(container, 'pointermove', x + 30, y + 20)
    pointer(container, 'pointermove', x + 60, y + 40)
    pointer(container, 'pointerup', x + 60, y + 40)
    expect(window.getSelection()?.toString()).toBe('')
    const added = doc.annotations.list.get().filter((a) => a.id !== hl.id)
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ type: 'redact' })
    expect(added[0]).not.toHaveProperty('quads')
    // A later click on the page redacts nothing more.
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 400, h.top + 600)
    pointer(container, 'pointerup', h.left + 400, h.top + 600)
    expect(doc.annotations.list.get()).toHaveLength(2)
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

  it('a highlight with a reply draws no note, and a drag across it still selects text', async () => {
    const { doc, viewport, tools, container } = await setup()
    const { hl, x, y, host } = await helloHighlight(doc, viewport)
    doc.annotations.update(hl.id, { contents: 'Why?' })
    const reply = doc.annotations.add({
      type: 'text',
      page: 0,
      rect: hl.rect,
      contents: 'Because',
      inReplyTo: hl.id,
    })
    await settle()
    // Replies live in the thread popover only: no element, no hit area, no tab stop.
    expect(host.querySelector(`[data-annotation="${reply.id}"]`)).toBeNull()
    expect(host.querySelectorAll('[data-type="text"]')).toHaveLength(0)
    // Whatever is on top at the press is what a pointer reaches.
    const top = document.elementFromPoint(x, y)!
    expect(top.closest('[data-annotation]')?.getAttribute('data-annotation')).toBe(hl.id)
    window.getSelection()?.removeAllRanges()
    pointer(top, 'pointerdown', x, y)
    pointer(top, 'pointermove', x + 20, y)
    pointer(top, 'pointermove', x + 40, y)
    pointer(top, 'pointerup', x + 40, y)
    expect(doc.annotations.selection.get()).toEqual([])
    expect(window.getSelection()?.toString()).not.toBe('')
    window.getSelection()?.removeAllRanges()
    // A marquee over the highlight picks the highlight, never its reply.
    tools.set('select')
    const h = host.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 2, h.top + 2)
    pointer(container, 'pointermove', h.right - 2, h.bottom - 2)
    pointer(container, 'pointerup', h.right - 2, h.bottom - 2)
    expect(doc.annotations.selection.get()).toContain(hl.id)
    expect(doc.annotations.selection.get()).not.toContain(reply.id)
    // Deleting the root still takes its replies.
    doc.annotations.remove(hl.id)
    expect(doc.annotations.get(reply.id)).toBeUndefined()
  })

  it('a note with replies has exactly one overlay element, and arrow keys skip replies', async () => {
    const { doc, viewport } = await setup()
    const note = (y: number, inReplyTo?: string) =>
      doc.annotations.add({
        type: 'text',
        page: 0,
        rect: { x: 100, y, width: 20, height: 20 },
        contents: 'x',
        ...(inReplyTo ? { inReplyTo } : {}),
      })
    const root = note(600)
    const r1 = note(560, root.id)
    note(520, r1.id)
    const other = note(400)
    await settle()
    const host = viewport.hostFor(0)!
    expect(
      [...host.querySelectorAll('[data-annotation]')].map((e) =>
        e.getAttribute('data-annotation')
      )
    ).toEqual([root.id, other.id])
    const first = host.querySelector<HTMLElement>(`[data-annotation="${root.id}"]`)!
    first.focus()
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    )
    expect(document.activeElement?.getAttribute('data-annotation')).toBe(other.id)
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

  describe('callouts', () => {
    type Kind = 'bubble' | 'standard'
    /** A bubble, box {100,600,100,40}, or a standard callout, box {100,600,180,60}. */
    const callout = (doc: InkDocument, kind: Kind) => {
      const box =
        kind === 'bubble'
          ? { x: 100, y: 600, width: 100, height: 40 }
          : { x: 100, y: 600, width: 180, height: 60 }
      const points =
        kind === 'bubble'
          ? [
              { x: 101, y: 576 },
              { x: 125, y: 600 },
            ]
          : [
              { x: 60, y: 520 },
              { x: 80, y: 560 },
              { x: 100, y: 620 },
            ]
      const head = kind === 'bubble' ? undefined : ('OpenArrow' as const)
      const a = doc.annotations.add({
        type: 'freetext',
        page: 0,
        contents: 'Hi',
        intent: 'FreeTextCallout',
        width: 1,
        ...(kind === 'bubble' ? { cornerRadius: 8 } : { head }),
        ...withCalloutBounds(box, points, 1, head),
        callout: points,
      })
      if (a.type !== 'freetext') throw new Error('not free text')
      return a
    }
    const freeText = (a: Annotation | undefined) => {
      if (a?.type !== 'freetext') throw new Error('not free text')
      return a
    }
    const expectBox = (a: Annotation | undefined, box: Rect) => {
      const b = freeTextBox(freeText(a))
      expect(b.x).toBeCloseTo(box.x, 5)
      expect(b.y).toBeCloseTo(box.y, 5)
      expect(b.width).toBeCloseTo(box.width, 5)
      expect(b.height).toBeCloseTo(box.height, 5)
    }
    /** `rect` and `fringe` are the bounds of the box and the callout. */
    const expectBounds = (a: Annotation | undefined) => {
      const ft = freeText(a)
      const want = withCalloutBounds(freeTextBox(ft), ft.callout!, 1, ft.head)
      for (const k of ['x', 'y', 'width', 'height'] as const)
        expect(ft.rect[k]).toBeCloseTo(want.rect[k], 5)
      for (const k of ['left', 'top', 'right', 'bottom'] as const)
        expect(ft.fringe![k]).toBeCloseTo(want.fringe[k], 5)
    }

    for (const kind of ['bubble', 'standard'] as const) {
      it(`dragging a ${kind} callout's tip moves callout[0] only and keeps the box`, async () => {
        const { doc, container, viewport } = await setup()
        const a = callout(doc, kind)
        doc.annotations.select([a.id])
        const { host, at, handle } = await page0(viewport)
        const names = [
          ...host.querySelectorAll(`[data-annotation="${a.id}"] > [data-handle]`),
        ].map((h) => (h as HTMLElement).dataset.handle)
        expect(names).toEqual(['nw', 'ne', 'sw', 'se', 'callout'])
        // Still below the box for the bubble; past its left side for the standard callout,
        // whose bend and edge point stay all the same.
        const [x, y] = at(a.callout![0]!.x, a.callout![0]!.y)
        const [dx, dy] = kind === 'bubble' ? [10, 20] : [-20, -50]
        pointer(handle(a.id, 'callout')!, 'pointerdown', x, y)
        pointer(container, 'pointermove', x + dx / 2, y)
        pointer(container, 'pointerup', x + dx, y + dy)
        const next = freeText(doc.annotations.get(a.id))
        expect(next.callout![0]!.x).toBeCloseTo(a.callout![0]!.x + dx, 5)
        expect(next.callout![0]!.y).toBeCloseTo(a.callout![0]!.y - dy, 5)
        expect(next.callout!.slice(1)).toEqual(a.callout!.slice(1))
        expectBox(next, freeTextBox(a))
        expectBounds(next)
        // One history step, back to exactly what it was.
        doc.history.undo()
        expect(doc.annotations.get(a.id)).toEqual(a)
      })

      it(`resizing a ${kind} callout by a corner moves its edge point with the box`, async () => {
        const { doc, container, viewport } = await setup()
        const a = callout(doc, kind)
        const box = freeTextBox(a)
        doc.annotations.select([a.id])
        const { host, at, handle } = await page0(viewport)
        // The corners sit on the text box, not the rect.
        const h = host.getBoundingClientRect()
        const nw = handle(a.id, 'nw')!.getBoundingClientRect()
        const [bx, by] = at(box.x, box.y + box.height)
        expect(nw.left + nw.width / 2 - h.left).toBeCloseTo(bx - h.left, 0)
        expect(nw.top + nw.height / 2 - h.top).toBeCloseTo(by - h.top, 0)
        // Drag the north-west corner 20 left and 10 up: the box grows on those sides.
        pointer(handle(a.id, 'nw')!, 'pointerdown', bx, by)
        pointer(container, 'pointermove', bx - 10, by - 5)
        pointer(container, 'pointerup', bx - 20, by - 10)
        const to = {
          x: box.x - 20,
          y: box.y,
          width: box.width + 20,
          height: box.height + 10,
        }
        const next = freeText(doc.annotations.get(a.id))
        expectBox(next, to)
        expectBounds(next)
        // Tip and any bend stay put.
        const last = a.callout!.length - 1
        expect(next.callout!.slice(0, last)).toEqual(a.callout!.slice(0, last))
        const edge = next.callout![last]!
        if (kind === 'bubble') {
          // On the bottom edge, a quarter of the way along.
          expect(edge.y).toBeCloseTo(to.y, 5)
          expect(edge.x).toBeCloseTo(to.x + to.width / 4, 5)
          expect(isBubble(next)).toBe(true)
        } else {
          // On the left edge, a third of the way up.
          expect(edge.x).toBeCloseTo(to.x, 5)
          expect(edge.y).toBeCloseTo(to.y + to.height / 3, 5)
          expect(isStandardCallout(next)).toBe(true)
          expect(next).not.toHaveProperty('cornerRadius')
        }
        doc.history.undo()
        expect(doc.annotations.get(a.id)).toEqual(a)
      })
    }

    it("dragging a bubble's tip above the box moves its edge point to the top edge", async () => {
      const { doc, container, viewport } = await setup()
      const a = callout(doc, 'bubble')
      doc.annotations.select([a.id])
      const { host, at, handle } = await page0(viewport)
      // From below the box {100,600,100,40} to above it, (160, 700).
      const [x, y] = at(101, 576)
      const [tx, ty] = at(160, 700)
      pointer(handle(a.id, 'callout')!, 'pointerdown', x, y)
      pointer(container, 'pointermove', tx, ty)
      pointer(container, 'pointerup', tx, ty)
      const next = freeText(doc.annotations.get(a.id))
      expect(next.callout![0]!.x).toBeCloseTo(160, 5)
      expect(next.callout![0]!.y).toBeCloseTo(700, 5)
      // Same place along the box, now on its top edge.
      expect(next.callout![1]!.x).toBeCloseTo(125, 5)
      expect(next.callout![1]!.y).toBeCloseTo(640, 5)
      expectBox(next, freeTextBox(a))
      expectBounds(next)
      // The wedge leaves the top edge: its base is on it and it does not cross the box.
      const t = viewport.transformFor(0)
      const origin = t.toCssRect(next.rect)
      const box = t.toCssRect(freeTextBox(next))
      const tip = t.toCss(next.callout![0]!)
      const fmt = (n: number) => String(Math.round(n * 1000) / 1000 + 0)
      const d = host
        .querySelector(`[data-annotation="${a.id}"] path.ink-bubble`)!
        .getAttribute('d')!
      expect(d).toContain(
        ` ${fmt(box.top - origin.top)}L${fmt(tip.x - origin.left)} ${fmt(tip.y - origin.top)}`
      )
      expect(d).not.toContain(
        ` ${fmt(box.top + box.height - origin.top)}L${fmt(tip.x - origin.left)}`
      )
      doc.history.undo()
      expect(doc.annotations.get(a.id)).toEqual(a)
    })

    it("dragging a bent callout's tip anywhere keeps its bend and edge point", async () => {
      const { doc, container, viewport } = await setup()
      const a = callout(doc, 'standard')
      doc.annotations.select([a.id])
      const { at, handle } = await page0(viewport)
      // From below-left of the box to above it.
      const [x, y] = at(60, 520)
      const [tx, ty] = at(150, 720)
      pointer(handle(a.id, 'callout')!, 'pointerdown', x, y)
      pointer(container, 'pointermove', tx, ty)
      pointer(container, 'pointerup', tx, ty)
      const next = freeText(doc.annotations.get(a.id))
      expect(next.callout![0]!.x).toBeCloseTo(150, 5)
      expect(next.callout![0]!.y).toBeCloseTo(720, 5)
      expect(next.callout!.slice(1)).toEqual(a.callout!.slice(1))
      expectBounds(next)
      doc.history.undo()
      expect(doc.annotations.get(a.id)).toEqual(a)
    })

    it("typing that grows a standard callout's box keeps its tip and bend, in one undo step", async () => {
      const { doc, container, viewport } = await setup()
      const result = importAnnotations(doc.annotations, JSON.stringify(standardCallout), {
        mode: 'replace',
      })
      expect(result.errors).toEqual([])
      const a = freeText(doc.annotations.get('standard-callout-1'))
      const updates: unknown[] = []
      const stop = doc.annotations.on('change', (c) => {
        if (c.kind === 'update') updates.push(c)
      })
      const el = viewport
        .hostFor(0)!
        .querySelector<HTMLElement>(`[data-annotation="${a.id}"]`)!
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      )
      await until(() => container.querySelector('[data-ink-editor]') !== null)
      await userEvent.keyboard('{End}{Enter}2{Enter}3{Enter}4{Enter}5{Enter}6{Escape}')
      stop()
      expect(updates).toHaveLength(1)
      const next = freeText(doc.annotations.get(a.id))
      const before = freeTextBox(a)
      const after = freeTextBox(next)
      // The box grows down: its top stays.
      expect(after.y + after.height).toBeCloseTo(before.y + before.height, 5)
      expect(before.y - after.y).toBeGreaterThan(24)
      // The tip and the bend stay on what they point at.
      expect(next.callout![0]).toEqual(a.callout![0])
      expect(next.callout![1]).toEqual(a.callout![1])
      // The edge point stays on the left edge, a third of the way up.
      expect(next.callout![2]!.x).toBeCloseTo(after.x, 5)
      expect(next.callout![2]!.y).toBeCloseTo(after.y + after.height / 3, 5)
      expect(isStandardCallout(next)).toBe(true)
      doc.history.undo()
      expect(doc.annotations.get(a.id)).toEqual(a)
    })

    it('a bubble survives create, type, move, export and import', async () => {
      const { doc, container, viewport, tools } = await setup()
      tools.set('shape', { kind: 'bubble' })
      const h = viewport.hostFor(0)!.getBoundingClientRect()
      pointer(container, 'pointerdown', h.left + 100, h.top + 100)
      pointer(container, 'pointermove', h.left + 220, h.top + 160)
      pointer(container, 'pointerup', h.left + 220, h.top + 160)
      await userEvent.keyboard('Hello{Escape}')
      const [made] = doc.annotations.list.get()
      tools.set('select')
      const { at } = await page0(viewport)
      const box = freeTextBox(freeText(made))
      const [x, y] = at(box.x + box.width / 2, box.y + box.height / 2)
      pointer(
        container.querySelector(`[data-annotation="${made!.id}"] .ink-free-text`)!,
        'pointerdown',
        x,
        y
      )
      pointer(container, 'pointermove', x + 30, y + 20)
      pointer(container, 'pointerup', x + 30, y + 20)
      const moved = freeText(doc.annotations.get(made!.id))
      expect(moved.contents).toBe('Hello')
      expect(moved.rect.x).toBeCloseTo(made!.rect.x + 30, 5)
      expect(moved.fringe).toEqual(freeText(made).fringe)
      const fresh = createAnnotationStore({
        mode: { mode: 'uncontrolled' },
        defaults: staticDefaults,
      })
      const result = importAnnotations(
        fresh,
        JSON.stringify(exportAnnotations(doc.annotations)),
        { mode: 'replace' }
      )
      expect(result.errors).toEqual([])
      const back = fresh.get(made!.id)
      expect(back).toEqual(moved)
      expect(isBubble(back!)).toBe(true)
    })
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

describe('one-shot tools', () => {
  /** A press and release at `(x, y)` in page 0's host, CSS px. */
  function click(container: HTMLElement, viewport: Viewport, x: number, y: number): void {
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + x, h.top + y)
    pointer(container, 'pointerup', h.left + x, h.top + y)
  }

  /** Selects the text of the `index`th text span on page 0 and releases the pointer on it. */
  function selectSpan(container: HTMLElement, viewport: Viewport, index: number): void {
    const span = [
      ...viewport.hostFor(0)!.querySelectorAll('[data-ink-text-layer] span'),
    ].filter((s) => s.textContent?.trim())[index]!
    const range = document.createRange()
    range.selectNodeContents(span)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    const r = span.getBoundingClientRect()
    pointer(container, 'pointerup', r.right, r.bottom)
  }

  it.each(['shape', 'note'])(
    'a click on empty page after a %s switches to select-text and makes nothing',
    async (tool) => {
      const { doc, container, viewport, tools } = await setup()
      tools.set(tool)
      click(container, viewport, 200, 300)
      const [made] = doc.annotations.list.get()
      expect(doc.annotations.list.get()).toHaveLength(1)
      expect(doc.annotations.selection.get()).toEqual([made!.id])
      click(container, viewport, 400, 500)
      expect(doc.annotations.list.get()).toHaveLength(1)
      expect(tools.active.get()).toBe('select-text')
      expect(doc.annotations.selection.get()).toEqual([])
    }
  )

  it('a click on empty page after a signature switches to select-text and makes nothing', async () => {
    const signatures = await library([INK_TEMPLATE])
    const { doc, container, viewport, tools } = await setup('text-simple', { signatures })
    tools.set('signature', { templateId: INK_TEMPLATE.id })
    click(container, viewport, 200, 300)
    const [made] = doc.annotations.list.get()
    expect(doc.annotations.selection.get()).toEqual([made!.id])
    click(container, viewport, 400, 500)
    expect(doc.annotations.list.get()).toHaveLength(1)
    expect(tools.active.get()).toBe('select-text')
    expect(doc.annotations.selection.get()).toEqual([])
  })

  it('a click on empty page after an area redaction switches to select-text and makes nothing', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('redact-area')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    pointer(container, 'pointerdown', h.left + 200, h.top + 300)
    pointer(container, 'pointermove', h.left + 240, h.top + 330)
    pointer(container, 'pointerup', h.left + 240, h.top + 330)
    const [made] = doc.annotations.list.get()
    expect(doc.annotations.selection.get()).toEqual([made!.id])
    click(container, viewport, 400, 500)
    expect(doc.annotations.list.get()).toHaveLength(1)
    expect(tools.active.get()).toBe('select-text')
    expect(doc.annotations.selection.get()).toEqual([])
  })

  it('a click on empty page after a text box switches to select-text and makes nothing', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('freetext')
    click(container, viewport, 200, 300)
    expect(document.activeElement).toBe(container.querySelector('[data-ink-editor]'))
    await userEvent.keyboard('Hi')
    click(container, viewport, 400, 500)
    expect(doc.annotations.list.get().map((a) => [a.type, a.contents])).toEqual([
      ['freetext', 'Hi'],
    ])
    expect(tools.active.get()).toBe('select-text')
    expect(doc.annotations.selection.get()).toEqual([])
  })

  it('an empty text box makes nothing, so the tool stays ready', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('freetext')
    click(container, viewport, 200, 300)
    click(container, viewport, 400, 500)
    expect(doc.annotations.list.get()).toEqual([])
    expect(tools.active.get()).toBe('freetext')
  })

  it('Escape after a shape switches to select-text', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('shape')
    click(container, viewport, 200, 300)
    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    expect(tools.active.get()).toBe('select-text')
    expect(doc.annotations.list.get()).toHaveLength(1)
    expect(doc.annotations.selection.get()).toEqual([])
  })

  it('Escape in a new text box commits and switches', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('freetext')
    click(container, viewport, 200, 300)
    await userEvent.keyboard('Hi')
    await userEvent.keyboard('{Escape}')
    expect(doc.annotations.list.get().map((a) => a.contents)).toEqual(['Hi'])
    expect(tools.active.get()).toBe('select-text')
  })

  it('Escape in a new speech bubble switches to select-text', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('shape', { kind: 'bubble' })
    click(container, viewport, 200, 300)
    expect(document.activeElement).toBe(container.querySelector('[data-ink-editor]'))
    await userEvent.keyboard('Hi')
    await userEvent.keyboard('{Escape}')
    expect(doc.annotations.list.get().map((a) => a.contents)).toEqual(['Hi'])
    expect(tools.active.get()).toBe('select-text')
  })

  it('a press on another annotation switches to select-text and drags it', async () => {
    const { doc, viewport, container, tools } = await setup()
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    await settle()
    tools.set('shape')
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    const el = host.querySelector(`[data-annotation="${a.id}"]`) as HTMLElement
    pointer(el, 'pointerdown', h.left + 110, h.top + 180)
    expect(tools.active.get()).toBe('select-text')
    pointer(container, 'pointermove', h.left + 120, h.top + 180)
    pointer(container, 'pointermove', h.left + 130, h.top + 180)
    pointer(container, 'pointerup', h.left + 130, h.top + 180)
    expect(doc.annotations.list.get().map((x) => x.id)).toEqual([a.id])
    expect(doc.annotations.get(a.id)!.rect.x).toBeCloseTo(120)
    expect(doc.annotations.selection.get()).toEqual([a.id])
  })

  it('a press on another annotation after a shape switches to select-text', async () => {
    const { doc, viewport, tools, container } = await setup()
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    await settle()
    tools.set('shape')
    click(container, viewport, 300, 400)
    const host = viewport.hostFor(0)!
    const h = host.getBoundingClientRect()
    const el = host.querySelector(`[data-annotation="${a.id}"]`) as HTMLElement
    pointer(el, 'pointerdown', h.left + 110, h.top + 180)
    pointer(el, 'pointerup', h.left + 110, h.top + 180)
    expect(tools.active.get()).toBe('select-text')
    expect(doc.annotations.list.get()).toHaveLength(2)
    expect(doc.annotations.selection.get()).toEqual([a.id])
  })

  it('a press on the made item keeps the tool on', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('shape')
    click(container, viewport, 200, 300)
    const [made] = doc.annotations.list.get()
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    const el = container.querySelector(`[data-annotation="${made!.id}"]`)!
    pointer(el, 'pointerdown', h.left + 200, h.top + 300)
    pointer(el, 'pointerup', h.left + 200, h.top + 300)
    expect(tools.active.get()).toBe('shape')
    expect(doc.annotations.list.get()).toHaveLength(1)
    expect(doc.annotations.selection.get()).toEqual([made!.id])
  })

  it('a press on a text box committed by focus leaving keeps the Text tool on', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('freetext')
    click(container, viewport, 200, 300)
    await userEvent.keyboard('Hi')
    // Focus moving to a control outside the editor commits the box.
    const button = document.createElement('button')
    document.body.append(button)
    cleanup.push(() => button.remove())
    button.focus()
    const [box] = doc.annotations.list.get()
    expect(box).toMatchObject({ type: 'freetext', contents: 'Hi' })
    expect(tools.active.get()).toBe('freetext')
    expect(container.hasAttribute('data-ink-made')).toBe(true)
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    const el = container.querySelector(`[data-annotation="${box!.id}"]`)!
    pointer(el, 'pointerdown', h.left + 210, h.top + 305)
    pointer(el, 'pointerup', h.left + 210, h.top + 305)
    expect(tools.active.get()).toBe('freetext')
    expect(doc.annotations.list.get()).toHaveLength(1)
    expect(doc.annotations.selection.get()).toEqual([box!.id])
  })

  it('Delete on the made item returns the tool to ready', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('shape')
    click(container, viewport, 200, 300)
    const [made] = doc.annotations.list.get()
    doc.annotations.remove(made!.id)
    expect(doc.annotations.list.get()).toEqual([])
    expect(tools.active.get()).toBe('shape')
    click(container, viewport, 400, 500)
    expect(doc.annotations.list.get()).toHaveLength(1)
    expect(tools.active.get()).toBe('shape')
  })

  it('a host selecting something else switches to select-text', async () => {
    const { doc, container, viewport, tools } = await setup()
    const other = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 600, width: 50, height: 30 },
    })
    tools.set('shape')
    click(container, viewport, 200, 300)
    doc.annotations.select([other.id])
    expect(tools.active.get()).toBe('select-text')
    expect(doc.annotations.selection.get()).toEqual([other.id])
  })

  it('pen and highlight stay on', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('draw')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    const line = (y: number): void => {
      pointer(container, 'pointerdown', h.left + 100, h.top + y)
      pointer(container, 'pointermove', h.left + 150, h.top + y)
      pointer(container, 'pointerup', h.left + 150, h.top + y)
    }
    line(300)
    click(container, viewport, 400, 500)
    line(350)
    expect(tools.active.get()).toBe('draw')
    tools.set('highlight')
    selectSpan(container, viewport, 0)
    selectSpan(container, viewport, 1)
    expect(doc.annotations.list.get().filter((a) => a.type === 'highlight')).toHaveLength(
      2
    )
    expect(tools.active.get()).toBe('highlight')
  })

  it('made state survives a controlled host applying the add a microtask later', async () => {
    const { doc, container, viewport, tools } = await setup('text-simple', {
      controlled: true,
    })
    tools.set('shape')
    click(container, viewport, 200, 300)
    await settle()
    expect(doc.annotations.list.get()).toHaveLength(1)
    expect(tools.active.get()).toBe('shape')
    click(container, viewport, 400, 500)
    await settle()
    expect(tools.active.get()).toBe('select-text')
    expect(doc.annotations.list.get()).toHaveLength(1)
  })

  it('a host tool without a kind stays on', async () => {
    let ctx: ToolContext | undefined
    const stamp: Tool = {
      id: 'stamp-x',
      cursor: 'copy',
      activate(c) {
        ctx = c
      },
      deactivate() {
        ctx = undefined
      },
      onPointerDown: (_e, hit, id) => !!hit && id === undefined,
      onPointerUp(_e, hit) {
        if (!ctx || !hit) return
        const a = ctx.store.add({
          type: 'redact',
          page: hit.page,
          rect: { x: hit.user.x, y: hit.user.y, width: 20, height: 20 },
        })
        ctx.store.select([a.id])
        ctx.made([a.id])
      },
    }
    const { doc, container, viewport, tools } = await setup('text-simple', {
      tools: [...builtinTools(), stamp],
    })
    tools.set('stamp-x')
    click(container, viewport, 200, 300)
    click(container, viewport, 400, 500)
    expect(doc.annotations.list.get()).toHaveLength(2)
    expect(tools.active.get()).toBe('stamp-x')
    expect(container.hasAttribute('data-ink-made')).toBe(false)
  })

  /** The overlay's edit handles on annotation `id`, wherever its page is. */
  const handlesOf = (container: HTMLElement, id: string) => [
    ...container.querySelectorAll<HTMLElement>(
      `[data-annotation="${CSS.escape(id)}"] > .ink-handle`
    ),
  ]

  /** A drag from `(x0, y0)` to `(x, y)`, client px, pressed on `el`. */
  function drag(
    container: HTMLElement,
    el: Element,
    x0: number,
    y0: number,
    x: number,
    y: number
  ): void {
    pointer(el, 'pointerdown', x0, y0)
    pointer(container, 'pointermove', (x0 + x) / 2, (y0 + y) / 2)
    pointer(container, 'pointermove', x, y)
    pointer(container, 'pointerup', x, y)
  }

  it('the made shape shows handles under the shape tool', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('shape')
    click(container, viewport, 200, 300)
    const [made] = doc.annotations.list.get()
    await until(() => handlesOf(container, made!.id).length === 4)
    expect(tools.active.get()).toBe('shape')
  })

  it('dragging the made shape moves it and the tool stays shape', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('shape')
    click(container, viewport, 200, 300)
    const [made] = doc.annotations.list.get()
    const before = made!.rect
    const el = container.querySelector(`[data-annotation="${made!.id}"]`)!
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    drag(container, el, x, y, x + 40, y + 20)
    expect(doc.annotations.list.get()).toHaveLength(1)
    const after = doc.annotations.get(made!.id)!.rect
    expect(after.x).toBeCloseTo(before.x + 40)
    expect(after.y).toBeCloseTo(before.y - 20)
    expect(tools.active.get()).toBe('shape')
    expect(container.hasAttribute('data-ink-made')).toBe(true)
    expect(doc.annotations.selection.get()).toEqual([made!.id])
  })

  it("dragging a made shape's corner resizes it", async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('shape')
    click(container, viewport, 200, 300)
    const [made] = doc.annotations.list.get()
    const before = made!.rect
    await until(() => handlesOf(container, made!.id).length === 4)
    const se = container.querySelector(
      `[data-annotation="${made!.id}"] > [data-handle="se"]`
    )!
    const r = se.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    drag(container, se, x, y, x + 30, y + 20)
    expect(doc.annotations.list.get()).toHaveLength(1)
    const after = doc.annotations.get(made!.id)!.rect
    expect(after.x).toBeCloseTo(before.x)
    expect(after.width).toBeCloseTo(before.width + 30)
    expect(after.height).toBeCloseTo(before.height + 20)
    expect(after.y + after.height).toBeCloseTo(before.y + before.height)
    expect(tools.active.get()).toBe('shape')
  })

  it('a made area redaction can be moved', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('redact-area')
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    drag(container, container, h.left + 200, h.top + 300, h.left + 260, h.top + 340)
    const [made] = doc.annotations.list.get()
    const before = made!.rect
    const el = container.querySelector(`[data-annotation="${made!.id}"]`)!
    drag(container, el, h.left + 230, h.top + 320, h.left + 250, h.top + 330)
    expect(doc.annotations.list.get()).toHaveLength(1)
    const after = doc.annotations.get(made!.id)!.rect
    expect(after.x).toBeCloseTo(before.x + 20)
    expect(after.y).toBeCloseTo(before.y - 10)
    expect(tools.active.get()).toBe('redact-area')
  })

  it('three text redactions from one selection move together', async () => {
    const { doc, container, viewport, tools } = await setup()
    viewport.setZoom(0.3)
    await until(() => [0, 1, 2].every((p) => viewport.hostFor(p) !== undefined))
    await until(() =>
      [0, 1, 2].every(
        (p) =>
          (viewport.hostFor(p)!.querySelector('[data-ink-text-layer] span') ?? null) !==
          null
      )
    )
    tools.set('redact-area')
    const spans = (p: number) =>
      [...viewport.hostFor(p)!.querySelectorAll('[data-ink-text-layer] span')].filter(
        (s) => s.textContent?.trim()
      )
    const range = document.createRange()
    range.setStartBefore(spans(0)[0]!)
    range.setEndAfter(spans(2)[0]!)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    click(container, viewport, 5, 5)
    const made = doc.annotations.list.get()
    expect(made.map((a) => a.page)).toEqual([0, 1, 2])
    expect(doc.annotations.selection.get()).toEqual(made.map((a) => a.id))
    const el = viewport.hostFor(1)!.querySelector(`[data-annotation="${made[1]!.id}"]`)!
    const r = el.getBoundingClientRect()
    const x = r.left + 2
    const y = r.top + r.height / 2
    // 15 CSS px at zoom 0.3 is 50 pt.
    drag(container, el, x, y, x + 15, y)
    expect(tools.active.get()).toBe('redact-area')
    made.forEach((a) => {
      const now = doc.annotations.get(a.id)!
      expect(now.rect.x).toBeCloseTo(a.rect.x + 50)
      expect(now.rect.y).toBeCloseTo(a.rect.y)
    })
  })

  it('the Delete key removes the made shape and the tool returns to ready', async () => {
    const { doc, container, viewport, tools } = await setup()
    tools.set('shape')
    click(container, viewport, 200, 300)
    expect(doc.annotations.list.get()).toHaveLength(1)
    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })
    )
    expect(doc.annotations.list.get()).toEqual([])
    expect(tools.active.get()).toBe('shape')
    expect(container.hasAttribute('data-ink-made')).toBe(false)
  })

  it("handles return when the made item's page remounts", async () => {
    const { doc, container, viewport, tools } = await setup('mixed-page-sizes')
    viewport.setZoom(3)
    await settle()
    tools.set('shape')
    click(container, viewport, 200, 300)
    const [made] = doc.annotations.list.get()
    await until(() => handlesOf(container, made!.id).length === 4)
    container.scrollTop = container.scrollHeight
    await until(() => viewport.hostFor(0) === undefined)
    container.scrollTop = 0
    await until(() => viewport.hostFor(0) !== undefined)
    await until(() => handlesOf(container, made!.id).length === 4)
    expect(tools.active.get()).toBe('shape')
    expect(doc.annotations.selection.get()).toEqual([made!.id])
  })

  it('data-ink-made is set while made and removed on switch', async () => {
    const { container, viewport, tools } = await setup()
    tools.set('shape')
    expect(container.hasAttribute('data-ink-made')).toBe(false)
    click(container, viewport, 200, 300)
    expect(container.hasAttribute('data-ink-made')).toBe(true)
    click(container, viewport, 400, 500)
    expect(container.hasAttribute('data-ink-made')).toBe(false)
    tools.set('shape')
    click(container, viewport, 200, 300)
    tools.set('note')
    expect(container.hasAttribute('data-ink-made')).toBe(false)
  })
})
