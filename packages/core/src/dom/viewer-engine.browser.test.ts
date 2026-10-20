import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createMemorySignatureStore,
  createSignatureLibrary,
  type SignatureLibrary,
} from '../model/signatures'

import { mountContainer, openFixtureInBrowser, settle, until } from './test-utils'
import { createToolOptions } from './tools'
import { mountViewer, type MountViewerOptions, type ViewerEngine } from './viewer-engine'

import type { InkError } from '../model/errors'
import type { FixtureName } from '@inkbar/fixtures/urls'

let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.forEach((f) => f())
  cleanup = []
})

async function setup(
  name: FixtureName = 'text-simple',
  opts: Partial<MountViewerOptions> = {}
) {
  const doc = await openFixtureInBrowser(name)
  const container = mountContainer(800, 600)
  container.tabIndex = 0
  const onPageMount = vi.fn()
  const onPageUnmount = vi.fn()
  const onPageError = vi.fn()
  const onBuild = vi.fn()
  const onActivate = vi.fn()
  const engine: ViewerEngine = mountViewer({
    container,
    document: doc,
    zoom: 0.5,
    onPageMount,
    onPageUnmount,
    onPageError,
    onBuild,
    onActivate,
    ...opts,
  })
  cleanup.push(() => {
    engine.destroy()
    doc.destroy()
    container.remove()
  })
  return {
    doc,
    container,
    engine,
    onPageMount,
    onPageUnmount,
    onPageError,
    onBuild,
    onActivate,
  }
}

const key = (el: HTMLElement, k: string): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
}

describe('mountViewer', () => {
  it('mounts pages with their layers', async () => {
    const { container, engine, onPageMount } = await setup()
    await until(() => engine.pages.size > 0)
    const host = container.querySelector<HTMLElement>('.ink-page[data-page="0"]')!
    await until(() => host.querySelector('canvas[data-ink-canvas]') !== null)
    expect(onPageMount).toHaveBeenCalledWith(0, expect.anything(), host)
    expect(engine.pages.get(0)).toBe(onPageMount.mock.calls[0]![1])
  })

  it('offers the PDF standard font families unless the host passes its own', async () => {
    const { engine } = await setup()
    expect(engine.fonts).toEqual(['Helvetica', 'Times', 'Courier'])
    const custom = await setup('text-simple', { fonts: ['Inter', 'Helvetica'] })
    expect(custom.engine.fonts).toEqual(['Inter', 'Helvetica'])
  })

  it('wires the tools and the viewport keys', async () => {
    const { container, engine } = await setup()
    expect(engine.tools.active.get()).toBe('select-text')
    const before = engine.viewport.scale.get()
    key(container, '+')
    expect(engine.viewport.scale.get()).toBeGreaterThan(before)
    const other = await setup('text-simple', { tool: 'highlight' })
    expect(other.engine.tools.active.get()).toBe('highlight')
  })

  it('reports activation of an annotation', async () => {
    const { container, engine, onActivate } = await setup('annotated-notes-threaded', {
      zoom: 1,
    })
    await until(() => container.querySelector('[data-annotation]') !== null)
    expect(engine.pages.size).toBeGreaterThan(0)
    const el = container.querySelector<HTMLElement>('[data-annotation]')!
    el.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, cancelable: true })
    )
    expect(onActivate).toHaveBeenCalledWith(el.getAttribute('data-annotation'))
  })

  it('flags a failed page and clears it once it renders again', async () => {
    const doc = await openFixtureInBrowser('mixed-page-sizes')
    let failing = true
    const handles = doc._pdfjs
    const original = handles.getPage.bind(handles)
    handles.getPage = async (index) => {
      if (failing && index === 1) throw new Error('The page could not be drawn')
      return original(index)
    }
    const container = mountContainer(800, 600)
    const onPageError = vi.fn()
    const engine = mountViewer({
      container,
      document: doc,
      zoom: 0.25,
      buffer: 5,
      onPageError,
    })
    cleanup.push(() => {
      engine.destroy()
      doc.destroy()
      container.remove()
    })
    await until(() => onPageError.mock.calls.length > 0)
    await settle(100)
    const failures = onPageError.mock.calls.filter((c) => c[0] === 1)
    // Canvas and text layer both fail, and the page reports once.
    expect(failures).toHaveLength(1)
    const err = failures[0]![1] as InkError
    expect(err.code).toBe('InvalidPdf')
    const host = container.querySelector<HTMLElement>('.ink-page[data-page="1"]')!
    expect(host.getAttribute('data-state')).toBe('error')

    failing = false
    engine.viewport.setZoom(0.75)
    await until(() => onPageError.mock.calls.some((c) => c[0] === 1 && c[1] === null))
    expect(host.hasAttribute('data-state')).toBe(false)
  })

  it('rebuilds with a new viewport and keeps zoom, page and tool', async () => {
    const { doc, container, engine, onBuild, onPageMount, onPageUnmount } =
      await setup('mixed-page-sizes')
    await until(() => engine.pages.size > 0)
    engine.viewport.setZoom(1.5)
    engine.viewport.setMode('single')
    engine.viewport.setRotation(90)
    const last = doc.pages.length - 1
    engine.viewport.scrollToPage(last)
    await until(() => engine.viewport.currentPage.get() === last)
    engine.tools.set('select')
    const old = engine.viewport
    const oldHosts = [...container.querySelectorAll<HTMLElement>('.ink-page')]
    const oldPages = [...engine.pages.keys()]
    expect(oldHosts.length).toBeGreaterThan(0)

    onPageUnmount.mockClear()
    onPageMount.mockClear()
    engine.rebuild({ gap: 32 })

    expect(engine.viewport).not.toBe(old)
    expect(engine.viewport.zoom.get()).toBe(1.5)
    expect(engine.viewport.currentPage.get()).toBe(last)
    expect(engine.tools.active.get()).toBe('select')
    expect(engine.viewport.mode.get()).toBe('single')
    expect(engine.viewport.rotation.get()).toBe(90)
    expect(onBuild).toHaveBeenCalledTimes(2)
    expect(oldHosts.every((h) => !h.isConnected)).toBe(true)
    // The teardown's unmounts come before any page of the new build mounts.
    const firstMount = onPageMount.mock.invocationCallOrder[0]!
    const torn = onPageUnmount.mock.calls
      .filter((_c, i) => onPageUnmount.mock.invocationCallOrder[i]! < firstMount)
      .map((c: unknown[]) => c[0] as number)
    expect(torn.sort()).toEqual([...oldPages].sort())
    await until(() => engine.pages.size > 0)
  })

  it("fires a build's page mounts before its onBuild, on the first build and on a rebuild", async () => {
    const events: string[] = []
    const { engine } = await setup('text-simple', {
      onPageMount: (page) => events.push(`mount:${page}`),
      onBuild: () => events.push('build'),
    })
    await until(() => engine.pages.size > 0)
    engine.rebuild({ gap: 24 })
    const first = events.indexOf('build')
    const second = events.indexOf('build', first + 1)
    expect(first).toBeGreaterThan(0)
    expect(events[0]).toMatch(/^mount:/)
    expect(second).toBeGreaterThan(first)
    expect(events.slice(first + 1, second).some((e) => e.startsWith('mount:'))).toBe(true)
    expect(events.slice(second + 1)).not.toContain('build')
  })

  it('keeps the scroll position within the page across a rebuild', async () => {
    const { container, engine } = await setup('text-simple', { zoom: 1 })
    await until(() => engine.pages.size > 0)
    const box = engine.viewport.layout.get().boxes.find((b) => b.index === 1)!
    container.scrollTop = box.top + 137
    container.scrollLeft = 23
    await until(() => engine.viewport.currentPage.get() === 1)
    // Where page 2's top-left sits relative to the container: the visible point.
    const offset = (): { x: number; y: number } => {
      const host = container.querySelector<HTMLElement>('.ink-page[data-page="1"]')!
      const r = host.getBoundingClientRect()
      const c = container.getBoundingClientRect()
      return { x: r.left - c.left, y: r.top - c.top }
    }
    const before = offset()
    const scrollTop = container.scrollTop

    engine.rebuild({ customAnnotations: true })
    expect(Math.abs(container.scrollTop - scrollTop)).toBeLessThanOrEqual(2)
    expect(Math.abs(offset().y - before.y)).toBeLessThanOrEqual(2)
    expect(Math.abs(offset().x - before.x)).toBeLessThanOrEqual(2)

    // A new gap moves every page, so compare the visible point rather than the scroll offset.
    engine.rebuild({ gap: 48 })
    expect(Math.abs(offset().y - before.y)).toBeLessThanOrEqual(2)
    expect(Math.abs(offset().x - before.x)).toBeLessThanOrEqual(2)
    await settle(100)
    expect(engine.viewport.currentPage.get()).toBe(1)
    expect(Math.abs(offset().y - before.y)).toBeLessThanOrEqual(2)
  })

  it('keeps a view resting at a page boundary at that boundary under a new gap', async () => {
    const { container, engine } = await setup('text-simple', { zoom: 1 })
    await until(() => engine.pages.size > 0)
    engine.viewport.scrollToPage(1)
    await until(() => engine.viewport.currentPage.get() === 1)
    engine.rebuild({ gap: 48 })
    const box = engine.viewport.layout.get().boxes.find((b) => b.index === 1)!
    expect(container.scrollTop).toBe(box.top - 48)
    expect(engine.viewport.currentPage.get()).toBe(1)
  })

  it('anchors a rebuild on the page just below the gap, not the most visible page', async () => {
    // At 0.25 the first page is 198 tall and the second 210.5, so with the top of the view in
    // the margin above the first page, the second is the most visible although it is not the
    // page the view reaches first.
    const doc = await openFixtureInBrowser('mixed-page-sizes')
    const container = mountContainer(800, 432)
    const engine = mountViewer({ container, document: doc, zoom: 0.25 })
    cleanup.push(() => {
      engine.destroy()
      doc.destroy()
      container.remove()
    })
    await until(() => engine.pages.size > 0)
    const first = engine.viewport.layout.get().boxes.find((b) => b.index === 0)!
    container.scrollTop = first.top / 2
    await until(() => engine.viewport.currentPage.get() === 1)
    expect(container.scrollTop).toBeLessThan(first.top)

    engine.rebuild({ gap: 32 })
    const rebuilt = engine.viewport.layout.get().boxes.find((b) => b.index === 0)!
    expect(container.scrollTop).toBe(rebuilt.top - 32)
  })

  it('lands a rebuild on the page below an interior gap', async () => {
    // No gap in this fixture has a taller later page, so the most visible page is the one
    // below the gap here; what this pins is that the scroll really runs for a page after the
    // first one (the first is covered by the margin test above).
    const doc = await openFixtureInBrowser('mixed-page-sizes')
    const container = mountContainer(800, 200)
    const engine = mountViewer({ container, document: doc, zoom: 0.25 })
    cleanup.push(() => {
      engine.destroy()
      doc.destroy()
      container.remove()
    })
    await until(() => engine.pages.size > 0)
    const boxes = engine.viewport.layout.get().boxes
    const above = boxes.find((b) => b.index === 1)!
    container.scrollTop = above.top + above.height + 8
    await until(() => engine.viewport.currentPage.get() === 2)

    engine.rebuild({ gap: 32 })
    const rebuilt = engine.viewport.layout.get().boxes.find((b) => b.index === 2)!
    expect(Math.abs(container.scrollTop - (rebuilt.top - 32))).toBeLessThanOrEqual(1)
  })

  it('cleans up on destroy', async () => {
    const { container, engine, onPageUnmount } = await setup()
    await until(() => engine.pages.size > 0)
    const mounted = [...engine.pages.keys()]
    const zoom = engine.viewport.zoom.get()
    engine.destroy()
    expect(engine.pages.size).toBe(0)
    expect(onPageUnmount).toHaveBeenCalledTimes(mounted.length)
    expect(onPageUnmount.mock.calls.map((c: unknown[]) => c[0] as number).sort()).toEqual(
      [...mounted].sort()
    )
    expect(container.querySelector('.ink-page')).toBeNull()
    key(container, '+')
    expect(engine.viewport.zoom.get()).toBe(zoom)
    const calls = onPageUnmount.mock.calls.length
    expect(() => engine.destroy()).not.toThrow()
    expect(onPageUnmount.mock.calls).toHaveLength(calls)
  })

  it('shares a host tool-options registry, so options outlive the engine', async () => {
    const toolOptions = createToolOptions()
    const first = await setup('text-simple', { toolOptions })
    first.engine.tools.set('shape', { kind: 'star', points: 6 })
    first.engine.destroy()
    const next = await setup('text-simple', { toolOptions })
    expect(next.engine.tools.options('shape').get()).toMatchObject({
      kind: 'star',
      points: 6,
    })
  })

  it('reads a host signature library through a getter, so a swap reaches the tool', async () => {
    const empty = createSignatureLibrary(createMemorySignatureStore())
    const next = createSignatureLibrary(
      createMemorySignatureStore([
        {
          id: 'sig',
          kind: 'ink',
          inklist: [
            [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
          ],
          aspect: 2,
        },
      ])
    )
    await next.refresh()
    let current: SignatureLibrary = empty
    const { doc, container, engine } = await setup('text-simple', {
      zoom: 1,
      signatureLibrary: () => current,
    })
    expect(engine.signatures).toBe(empty)
    current = next
    expect(engine.signatures).toBe(next)
    engine.tools.set('signature', { templateId: 'sig' })
    await until(() => engine.viewport.hostFor(0) !== undefined)
    const h = engine.viewport.hostFor(0)!.getBoundingClientRect()
    for (const type of ['pointerdown', 'pointerup'] as const)
      container.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          clientX: h.left + 200,
          clientY: h.top + 200,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          pointerId: 1,
          isPrimary: true,
        })
      )
    expect(doc.annotations.list.get()).toMatchObject([
      { type: 'ink', subject: 'Signature' },
    ])
  })

  it('renders annotation shells for the host when customAnnotations is on', async () => {
    const { container, engine } = await setup('annotated-notes-threaded', {
      zoom: 1,
      customAnnotations: true,
    })
    await until(() => container.querySelector('[data-annotation][data-custom]') !== null)
    engine.rebuild({ customAnnotations: false })
    await until(() => container.querySelector('[data-annotation]') !== null)
    expect(container.querySelector('[data-annotation][data-custom]')).toBeNull()
  })
})
