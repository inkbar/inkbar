import { afterEach, describe, expect, it, vi } from 'vitest'

import { mountContainer, openFixtureInBrowser, settle, until } from './test-utils'
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

  it('wires the tools and the viewport keys', async () => {
    const { container, engine } = await setup()
    expect(engine.tools.active.get()).toBe('view')
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
    const { doc, container, engine, onBuild, onPageUnmount } =
      await setup('mixed-page-sizes')
    await until(() => engine.pages.size > 0)
    engine.viewport.setZoom(1.5)
    const last = doc.pages.length - 1
    engine.viewport.scrollToPage(last)
    await until(() => engine.viewport.currentPage.get() === last)
    engine.tools.set('select')
    const old = engine.viewport
    const oldHosts = [...container.querySelectorAll<HTMLElement>('.ink-page')]
    const oldPages = [...engine.pages.keys()]
    expect(oldHosts.length).toBeGreaterThan(0)

    engine.rebuild({ gap: 32 })

    expect(engine.viewport).not.toBe(old)
    expect(engine.viewport.zoom.get()).toBe(1.5)
    expect(engine.viewport.currentPage.get()).toBe(last)
    expect(engine.tools.active.get()).toBe('select')
    expect(onBuild).toHaveBeenCalledTimes(2)
    expect(oldHosts.every((h) => !h.isConnected)).toBe(true)
    for (const page of oldPages) expect(onPageUnmount).toHaveBeenCalledWith(page)
    await until(() => engine.pages.size > 0)
  })

  it('cleans up on destroy', async () => {
    const { container, engine, onPageUnmount } = await setup()
    await until(() => engine.pages.size > 0)
    const mounted = [...engine.pages.keys()]
    const zoom = engine.viewport.zoom.get()
    engine.destroy()
    expect(engine.pages.size).toBe(0)
    for (const page of mounted) expect(onPageUnmount).toHaveBeenCalledWith(page)
    expect(container.querySelector('.ink-page')).toBeNull()
    key(container, '+')
    expect(engine.viewport.zoom.get()).toBe(zoom)
    const calls = onPageUnmount.mock.calls.length
    expect(() => engine.destroy()).not.toThrow()
    expect(onPageUnmount.mock.calls).toHaveLength(calls)
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
