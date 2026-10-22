import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { writable } from '../../model/readable'
import { mountContainer, openFixtureInBrowser, settle, until } from '../test-utils'
import { mountViewer, type MountViewerOptions } from '../viewer-engine'

import { definePlugin, type LayerSpec, type PluginContext } from './define'
import { createPluginHost } from './host'

import type { Rect } from '../../model/geometry'
import type { Tool } from '../tools/controller'
import type { PageTransform } from '../transform'
import type { FixtureName } from '@inkbar/fixtures/urls'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

/** A viewer whose one plugin, `sandbox`, runs `setup`; the context is kept for later calls. */
async function setup(
  pluginSetup: (ctx: PluginContext) => void,
  {
    fixture = 'text-simple',
    theme = false,
    ...opts
  }: Partial<MountViewerOptions> & { fixture?: FixtureName; theme?: boolean } = {}
) {
  if (theme) {
    const style = document.createElement('style')
    style.textContent = themeCss
    document.head.append(style)
    cleanup.push(() => style.remove())
  }
  const doc = await openFixtureInBrowser(fixture)
  const container = mountContainer(800, 600)
  let ctx!: PluginContext
  const plugins = createPluginHost({
    plugins: [
      definePlugin({
        id: 'sandbox',
        setup(c) {
          ctx = c
          pluginSetup(c)
        },
      }),
    ],
    document: writable(doc),
    history: () => doc.history,
    activated: writable<string | null>(null),
    setActivated() {},
    root: writable<HTMLElement | null>(container),
  })
  const engine = mountViewer({ container, document: doc, zoom: 1, plugins, ...opts })
  let destroyed = false
  const destroy = () => {
    if (destroyed) return
    destroyed = true
    engine.destroy()
  }
  cleanup.push(() => {
    destroy()
    plugins.destroy()
    doc.destroy()
    container.remove()
  })
  await until(() => engine.pages.size > 0)
  return { doc, container, engine, plugins, ctx: () => ctx, destroy }
}

const layerOf = (host: Element) =>
  host.querySelector<HTMLElement>(':scope > .ink-plugin-layer[data-plugin="sandbox"]')

/** Draws one box per rect, placed with the transform the layer is handed. */
function boxes(rects: Rect[]): LayerSpec {
  return {
    render(el, _page, transform: PageTransform) {
      el.replaceChildren(
        ...rects.map((r) => {
          const box = document.createElement('div')
          box.dataset.mark = ''
          box.tabIndex = 0
          const css = transform.toCssRect(r)
          box.style.cssText = `position:absolute;left:${css.left}px;top:${css.top}px;width:${css.width}px;height:${css.height}px;`
          return box
        })
      )
    },
  }
}

function pointer(el: Element, type: 'pointerdown' | 'pointerup', x: number, y: number) {
  el.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      bubbles: true,
      pointerId: 1,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      isPrimary: true,
    })
  )
}

describe('plugin page layers', () => {
  it('a layer renders on each mounted page and is torn down on unmount', async () => {
    const render = vi.fn()
    const destroy = vi.fn()
    const {
      doc,
      container,
      engine,
      ctx,
      destroy: destroyEngine,
    } = await setup((c) => c.layer({ render, destroy }), {
      fixture: 'mixed-page-sizes',
      mode: 'single',
      buffer: 0,
    })
    const mounted = [...engine.pages.keys()]
    for (const page of mounted) {
      const host = engine.viewport.hostFor(page)!
      const el = layerOf(host)!
      expect(el, `page ${page}`).not.toBeNull()
      expect(el.tagName).toBe('DIV')
      // Above the annotation overlay, in DOM order too.
      const overlay = host.querySelector('.ink-overlay')!
      expect(
        overlay.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
      expect(render).toHaveBeenCalledWith(el, page, engine.viewport.transformFor(page))
    }

    // A layer added after mount reaches the pages already mounted.
    const late = vi.fn()
    ctx().layer({ render: late })
    for (const page of mounted) {
      const els = engine.viewport.hostFor(page)!.querySelectorAll('.ink-plugin-layer')
      expect(els).toHaveLength(2)
      expect(late).toHaveBeenCalledWith(els[1], page, engine.viewport.transformFor(page))
    }

    // Scrolling the first page out of a single-page view unmounts it, and its layers.
    const first = mounted[0]!
    const firstHost = engine.viewport.hostFor(first)!
    const firstLayer = layerOf(firstHost)!
    const last = doc.pages.length - 1
    engine.viewport.scrollToPage(last)
    await until(() => !engine.pages.has(first))
    expect(destroy).toHaveBeenCalledWith(firstLayer, first)
    expect(firstLayer.isConnected).toBe(false)

    destroy.mockClear()
    const still = [...engine.pages.keys()]
    destroyEngine()
    expect(destroy.mock.calls.map((c: unknown[]) => c[1]).sort()).toEqual(still.sort())
    expect(container.querySelector('.ink-plugin-layer')).toBeNull()
  })

  it('layer marks follow zoom and rotation', async () => {
    const rect: Rect = { x: 100, y: 500, width: 144, height: 40 }
    const { doc, engine } = await setup((c) => c.layer(boxes([rect])))
    const a = doc.annotations.add({ type: 'redact', page: 0, rect })
    const host = () => engine.viewport.hostFor(0)!
    const check = async () => {
      await until(() => host().querySelector(`[data-annotation="${a.id}"]`) !== null)
      await settle()
      const mark = layerOf(host())!.querySelector('[data-mark]')!.getBoundingClientRect()
      const drawn = host()
        .querySelector(`[data-annotation="${a.id}"]`)!
        .getBoundingClientRect()
      for (const k of ['left', 'top', 'width', 'height'] as const)
        expect(mark[k], k).toBeCloseTo(drawn[k], 0)
    }
    await check()
    engine.viewport.setZoom(2)
    await check()
    engine.viewport.setRotation(90)
    await check()
  })

  it('invalidate re-renders one page or all', async () => {
    const render = vi.fn()
    let handle!: ReturnType<PluginContext['layer']>
    const { engine } = await setup((c) => (handle = c.layer({ render })), {
      fixture: 'mixed-page-sizes',
    })
    const mounted = [...engine.pages.keys()]
    expect(mounted.length).toBeGreaterThan(1)
    const one = mounted[0]!
    render.mockClear()
    handle.invalidate(one)
    expect(render.mock.calls.map((c: unknown[]) => c[1])).toEqual([one])
    expect(render).toHaveBeenCalledWith(
      layerOf(engine.viewport.hostFor(one)!),
      one,
      engine.viewport.transformFor(one)
    )
    render.mockClear()
    handle.invalidate()
    expect(render.mock.calls.map((c: unknown[]) => c[1]).sort()).toEqual(
      [...mounted].sort()
    )
    // A page that is not mounted has nothing to redraw.
    render.mockClear()
    handle.invalidate(10_000)
    expect(render).not.toHaveBeenCalled()
  })

  it('presses outside layer children reach the active tool', async () => {
    const onPointerDown = vi.fn()
    const tool: Tool = {
      id: 'probe',
      cursor: 'crosshair',
      activate() {},
      deactivate() {},
      onPointerDown,
    }
    const rect: Rect = { x: 100, y: 500, width: 144, height: 40 }
    const { container, engine } = await setup((c) => c.layer(boxes([rect])), {
      theme: true,
      tools: [tool],
    })
    engine.tools.set('probe')
    const layer = layerOf(engine.viewport.hostFor(0)!)!
    const mark = layer.querySelector<HTMLElement>('[data-mark]')!
    const page = engine.viewport.hostFor(0)!.getBoundingClientRect()

    // Away from the mark the layer lets the press through to the page underneath.
    const x = page.left + 20
    const y = page.top + 20
    const under = document.elementFromPoint(x, y)!
    expect(layer.contains(under)).toBe(false)
    pointer(under, 'pointerdown', x, y)
    pointer(under, 'pointerup', x, y)
    expect(onPointerDown).toHaveBeenCalledTimes(1)
    expect(onPointerDown.mock.calls[0]![1]).toMatchObject({ page: 0 })

    // The mark itself is the plugin's: it is hit, and the tool does not see the press.
    const m = mark.getBoundingClientRect()
    const onMark = document.elementFromPoint(m.left + m.width / 2, m.top + m.height / 2)
    expect(onMark).toBe(mark)
    pointer(mark, 'pointerdown', m.left + 2, m.top + 2)
    pointer(mark, 'pointerup', m.left + 2, m.top + 2)
    expect(onPointerDown).toHaveBeenCalledTimes(1)
    expect(container.contains(mark)).toBe(true)
  })

  it('plugin tools appear in the controller', async () => {
    const activate = vi.fn()
    const { engine } = await setup((c) =>
      c.tools.add({ id: 'mark', cursor: 'crosshair', activate, deactivate() {} })
    )
    engine.tools.set('sandbox.mark')
    expect(engine.tools.active.get()).toBe('sandbox.mark')
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it("decorates annotations with the plugin host's composed decoration", async () => {
    let flag = 'on'
    const decorateAnnotation = vi.fn(() => ({ data: { host: 'yes' } }))
    const { doc, engine } = await setup(
      (c) => c.decorate(() => ({ data: { flag }, classes: ['sandbox-mark'] })),
      { decorateAnnotation }
    )
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 500, width: 144, height: 40 },
    })
    const el = () =>
      engine.viewport
        .hostFor(0)!
        .querySelector<HTMLElement>(`[data-annotation="${a.id}"]`)
    await until(() => el() !== null)
    expect(el()!.dataset.flag).toBe('on')
    expect(el()!.classList.contains('sandbox-mark')).toBe(true)
    flag = 'off'
    engine.redecorate()
    expect(el()!.dataset.flag).toBe('off')
    // `decorateAnnotation` is the host's to compose: the engine does not call it beside them.
    expect(decorateAnnotation).not.toHaveBeenCalled()
  })
})

describe('ctx.redecorate', () => {
  it('re-runs decorations that read plugin state', async () => {
    let flag = 'on'
    const { doc, engine, ctx } = await setup((c) =>
      c.decorate(() => ({ data: { flag } }))
    )
    const a = doc.annotations.add({
      type: 'redact',
      page: 0,
      rect: { x: 100, y: 500, width: 144, height: 40 },
    })
    const el = () =>
      engine.viewport
        .hostFor(0)!
        .querySelector<HTMLElement>(`[data-annotation="${a.id}"]`)
    await until(() => el() !== null)
    expect(el()!.dataset.flag).toBe('on')
    flag = 'off'
    ctx().redecorate()
    expect(el()!.dataset.flag).toBe('off')
    // After the engine is gone, a redecorate does nothing.
    engine.destroy()
    expect(() => ctx().redecorate()).not.toThrow()
  })
})
