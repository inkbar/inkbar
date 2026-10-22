import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { writable } from '../../../model/readable'
import { mountContainer, openFixtureInBrowser, settle, until } from '../../test-utils'
import { mountViewer, type MountViewerOptions } from '../../viewer-engine'
import { definePlugin } from '../define'
import { createPluginHost } from '../host'

import type { MarksHandle, MarksOptions } from './marks'
import type { Records } from './records'
import type { Rect } from '../../../model/geometry'
import type { RecordBase } from '../../../model/records'
import type { Tool } from '../../tools/controller'
import type { Viewport } from '../../viewport'
import type { FixtureName } from '@inkbar/fixtures/urls'

interface Finding extends RecordBase {
  page: number
  rect: Rect
  reason: string
  open: boolean
}

const finding = (id: string, page: number, y = 500): Finding => ({
  id,
  page,
  rect: { x: 100, y, width: 144, height: 40 },
  reason: `Reason ${id}`,
  open: true,
})

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

/**
 * A viewer whose one plugin, `sandbox`, keeps `initial` as its `findings` records and draws
 * the open ones as marks with `opts`, calling `scrollToFirst()` on them when asked.
 */
async function setup(
  initial: Finding[],
  opts: Partial<MarksOptions<Finding>> = {},
  {
    fixture = 'text-simple',
    scrollToFirst = false,
    ...viewer
  }: Partial<MountViewerOptions> & { fixture?: FixtureName; scrollToFirst?: boolean } = {}
) {
  const doc = await openFixtureInBrowser(fixture)
  const container = mountContainer(800, 600)
  let findings!: Records<Finding>
  let handle!: MarksHandle
  const factory = definePlugin('sandbox', (plugin) => {
    findings = plugin.records<Finding>('findings', { initial: () => initial })
    handle = plugin.marks(findings, {
      where: (f) => f.open,
      rect: (f) => f.rect,
      label: (f) => f.reason,
      ...opts,
    })
    if (scrollToFirst) handle.scrollToFirst()
  })
  /** Set once the viewer mounts, for `ctx.scrollTo`. */
  const view: { viewport?: Viewport } = {}
  const plugins = createPluginHost({
    plugins: [factory()],
    document: writable(doc),
    history: () => doc.history,
    activated: writable<string | null>(null),
    setActivated() {},
    root: writable<HTMLElement | null>(container),
    viewport: () => view.viewport,
  })
  const engine = mountViewer({ container, document: doc, zoom: 1, plugins, ...viewer })
  view.viewport = engine.viewport
  cleanup.push(() => {
    engine.destroy()
    plugins.destroy()
    doc.destroy()
    container.remove()
  })
  await until(() => engine.pages.size > 0)
  const marksOn = (page: number) => [
    ...(engine.viewport
      .hostFor(page)
      ?.querySelectorAll<HTMLButtonElement>(
        '.ink-plugin-layer[data-plugin="sandbox"] > button'
      ) ?? []),
  ]
  const markFor = (id: string) =>
    container.querySelector<HTMLButtonElement>(`button[data-record="${id}"]`)
  return { doc, container, engine, findings, handle, marksOn, markFor }
}

describe('plugin.marks', () => {
  it('draws one button per matching record on its page, positioned from rect', async () => {
    const closed = { ...finding('c', 0, 300), open: false }
    const { engine, marksOn } = await setup(
      [finding('a', 0), finding('b', 1, 200), closed, finding('d', 0, 100)],
      {},
      { fixture: 'mixed-page-sizes' }
    )
    await until(() => engine.pages.has(1))
    const page0 = marksOn(0)
    expect(page0.map((m) => m.dataset.record)).toEqual(['a', 'd'])
    expect(marksOn(1).map((m) => m.dataset.record)).toEqual(['b'])

    const [a] = page0
    expect(a!.tagName).toBe('BUTTON')
    expect(a!.type).toBe('button')
    expect(a!.getAttribute('aria-label')).toBe('Reason a')
    expect(getComputedStyle(a!).position).toBe('absolute')
    const css = engine.viewport.transformFor(0).toCssRect(finding('a', 0).rect)
    expect(a!.style.left).toBe(`${css.left}px`)
    expect(a!.style.top).toBe(`${css.top}px`)
    expect(a!.style.width).toBe(`${css.width}px`)
    expect(a!.style.height).toBe(`${css.height}px`)
  })

  it('redraws on record changes, undo included, with no invalidate', async () => {
    const { doc, findings, marksOn } = await setup([finding('a', 0)])
    findings.add(finding('b', 0, 200))
    expect(marksOn(0).map((m) => m.dataset.record)).toEqual(['a', 'b'])
    findings.update('a', { reason: 'Changed', open: true })
    expect(marksOn(0)[0]!.getAttribute('aria-label')).toBe('Changed')
    findings.update('a', { open: false })
    expect(marksOn(0).map((m) => m.dataset.record)).toEqual(['b'])
    doc.history.undo()
    expect(marksOn(0).map((m) => m.dataset.record)).toEqual(['a', 'b'])
    doc.history.undo()
    doc.history.undo()
    expect(marksOn(0).map((m) => m.dataset.record)).toEqual(['a'])
    expect(marksOn(0)[0]!.getAttribute('aria-label')).toBe('Reason a')
    doc.history.redo()
    expect(marksOn(0).map((m) => m.dataset.record)).toEqual(['a', 'b'])
  })

  it("a mark that stays keeps its element and focus through a zoom and another record's change", async () => {
    const { engine, findings, markFor } = await setup([
      finding('a', 0),
      finding('b', 0, 200),
    ])
    const a = markFor('a')!
    a.focus()
    const before = a.getBoundingClientRect()
    engine.viewport.setZoom(2)
    await until(() => a.getBoundingClientRect().width > before.width * 1.5)
    findings.update('b', { reason: 'Changed' })
    findings.add(finding('c', 0, 100))
    findings.remove('b')
    expect(markFor('a')).toBe(a)
    expect(a.isConnected).toBe(true)
    expect(document.activeElement).toBe(a)
  })

  it("press and click on a mark don't reach the active tool or the root's listeners", async () => {
    const onPointerDown = vi.fn()
    const tool: Tool = {
      id: 'probe',
      cursor: 'crosshair',
      activate() {},
      deactivate() {},
      onPointerDown,
    }
    const onActivate = vi.fn()
    const { container, engine, markFor } = await setup(
      [finding('a', 0)],
      { onActivate },
      { tools: [tool] }
    )
    engine.tools.set('probe')
    const heard = vi.fn()
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'])
      container.addEventListener(type, heard)
    await userEvent.click(markFor('a')!)
    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(onPointerDown).not.toHaveBeenCalled()
    expect(heard).not.toHaveBeenCalled()
  })

  it('Enter on a focused mark calls onActivate with the record and the mark', async () => {
    const onActivate = vi.fn()
    const { findings, markFor } = await setup([finding('a', 0)], { onActivate })
    findings.update('a', { reason: 'Latest' })
    const mark = markFor('a')!
    mark.focus()
    await userEvent.keyboard('{Enter}')
    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(onActivate).toHaveBeenCalledWith(findings.find('a'), mark)
  })

  it('attrs, style and className apply; data-record and data-plugin are always set', async () => {
    const { findings, markFor } = await setup([finding('a', 0)], {
      className: 'sandbox-finding extra',
      style: (f) => ({ borderColor: f.reason === 'Reason a' ? 'red' : 'blue' }),
      attrs: (f) => ({
        'data-reason': f.reason,
        'aria-describedby': 'help',
        'data-record': 'spoofed',
        'data-plugin': 'spoofed',
      }),
    })
    let mark = markFor('a')!
    expect(mark.classList.contains('sandbox-finding')).toBe(true)
    expect(mark.classList.contains('extra')).toBe(true)
    expect(mark.style.borderColor).toBe('red')
    expect(mark.dataset.reason).toBe('Reason a')
    expect(mark.getAttribute('aria-describedby')).toBe('help')
    expect(mark.dataset.record).toBe('a')
    expect(mark.dataset.plugin).toBe('sandbox')
    // Only a mark with a card opens a popup.
    expect(mark.hasAttribute('aria-haspopup')).toBe(false)
    expect(mark.hasAttribute('aria-expanded')).toBe(false)

    findings.update('a', { reason: 'Other' })
    mark = markFor('a')!
    expect(mark.style.borderColor).toBe('blue')
    expect(mark.dataset.reason).toBe('Other')
  })

  it('style sets custom properties, and drops one the next draw no longer asks for', async () => {
    const { findings, markFor } = await setup([finding('a', 0)], {
      style: (f) => (f.reason === 'Reason a' ? { '--x': '4px', borderColor: 'red' } : {}),
    })
    let mark = markFor('a')!
    expect(mark.style.getPropertyValue('--x')).toBe('4px')
    expect(mark.style.borderColor).toBe('red')

    findings.update('a', { reason: 'Other' })
    mark = markFor('a')!
    expect(mark.style.getPropertyValue('--x')).toBe('')
    expect(mark.style.borderColor).toBe('')
  })

  it("the plugin's style and attrs can't change the mark's type, position, style or class", async () => {
    const { markFor } = await setup([finding('a', 0)], {
      className: 'sandbox-finding',
      style: () => ({ position: 'static', borderColor: 'red' }),
      attrs: () => ({
        type: 'submit',
        class: 'spoofed',
        style: 'color: blue',
        'data-reason': 'kept',
      }),
    })
    const mark = markFor('a')!
    expect(mark.type).toBe('button')
    expect(mark.style.position).toBe('absolute')
    expect(mark.className).toBe('sandbox-finding')
    expect(mark.style.color).toBe('')
    expect(mark.style.borderColor).toBe('red')
    expect(mark.dataset.reason).toBe('kept')
  })

  it('drops a style property the plugin no longer asks for', async () => {
    const { findings, markFor } = await setup([finding('a', 0)], {
      style: (f) => (f.reason === 'Reason a' ? { borderColor: 'red' } : {}),
    })
    expect(markFor('a')!.style.borderColor).toBe('red')
    findings.update('a', { reason: 'Other' })
    expect(markFor('a')!.style.borderColor).toBe('')
  })

  it("a record on a page that isn't mounted, or beyond the page count, draws nothing and doesn't throw", async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    cleanup.push(() => error.mockRestore())
    const { doc, engine, findings, marksOn, container } = await setup(
      [finding('a', 0)],
      {},
      { fixture: 'mixed-page-sizes', mode: 'single', buffer: 0 }
    )
    const last = doc.pages.length - 1
    expect(engine.pages.has(last)).toBe(false)
    findings.add(finding('far', last))
    findings.add(finding('beyond', 10_000))
    expect(container.querySelectorAll('button[data-record]')).toHaveLength(1)
    expect(marksOn(0).map((m) => m.dataset.record)).toEqual(['a'])

    // The mark appears when its page mounts.
    engine.viewport.scrollToPage(last)
    await until(() => engine.pages.has(last))
    await settle()
    expect(marksOn(last).map((m) => m.dataset.record)).toEqual(['far'])
    expect(error).not.toHaveBeenCalled()
  })

  it('refresh() redraws marks that read outside state', async () => {
    let shown = true
    const { handle, marksOn } = await setup([finding('a', 0)], { where: () => shown })
    expect(marksOn(0)).toHaveLength(1)
    shown = false
    expect(marksOn(0)).toHaveLength(1)
    handle.refresh()
    expect(marksOn(0)).toHaveLength(0)
  })

  describe('scrollToFirst()', () => {
    /** Spies on the viewport's scrollToRect, the call `ctx.scrollTo` makes. */
    const spyScroll = (engine: { viewport: Viewport }) =>
      vi.spyOn(engine.viewport, 'scrollToRect')

    it('returns the handle', async () => {
      const { handle } = await setup([])
      expect(handle.scrollToFirst()).toBe(handle)
    })

    it('scrolls once to the first new mark in reading order: page, then top to bottom', async () => {
      const { engine, findings } = await setup(
        [],
        {},
        { fixture: 'mixed-page-sizes', scrollToFirst: true }
      )
      const scroll = spyScroll(engine)
      findings.addMissing([
        finding('low', 1, 100),
        finding('high', 1, 600),
        finding('b', 2),
      ])
      await settle()
      expect(scroll).toHaveBeenCalledTimes(1)
      expect(scroll.mock.calls[0]!.slice(0, 2)).toEqual([1, finding('high', 1, 600).rect])
    })

    it('scrolls the viewer to a new mark on a page out of view, moving no focus', async () => {
      const { container, engine, findings } = await setup(
        [],
        {},
        { fixture: 'mixed-page-sizes', scrollToFirst: true }
      )
      const last = engine.viewport.layout.get().boxes.length - 1
      const before = container.scrollTop
      const focused = document.activeElement
      findings.add(finding('far', last))
      await until(() => engine.pages.has(last))
      expect(container.scrollTop).toBeGreaterThan(before)
      expect(document.activeElement).toBe(focused)
    })

    it("doesn't scroll for the records a document opens with, undo or redo", async () => {
      const { doc, engine, findings } = await setup(
        [finding('a', 0)],
        {},
        { scrollToFirst: true }
      )
      const scroll = spyScroll(engine)
      await settle()
      expect(scroll).not.toHaveBeenCalled()
      findings.add(finding('b', 0, 200))
      await settle()
      expect(scroll).toHaveBeenCalledTimes(1)
      doc.history.undo()
      doc.history.redo()
      await settle()
      expect(scroll).toHaveBeenCalledTimes(1)
    })

    it('scrolls when a record changes to pass where, not when a marked one changes', async () => {
      const closed = { ...finding('c', 0, 300), open: false }
      const { engine, findings } = await setup(
        [finding('a', 0), closed],
        {},
        { scrollToFirst: true }
      )
      const scroll = spyScroll(engine)
      findings.update('a', {
        reason: 'Moved',
        rect: { x: 0, y: 0, width: 10, height: 10 },
      })
      findings.add({ ...finding('d', 0), open: false })
      await settle()
      expect(scroll).not.toHaveBeenCalled()
      findings.update('c', { open: true })
      await settle()
      expect(scroll).toHaveBeenCalledWith(0, closed.rect, expect.anything())
    })

    it('skips a new record that stops passing where before the change settles', async () => {
      const { engine, findings } = await setup([], {}, { scrollToFirst: true })
      const scroll = spyScroll(engine)
      findings.add(finding('a', 0))
      findings.update('a', { open: false })
      await settle()
      expect(scroll).not.toHaveBeenCalled()
    })

    it("doesn't scroll without scrollToFirst()", async () => {
      const { engine, findings } = await setup([])
      const scroll = spyScroll(engine)
      findings.add(finding('a', 0))
      await settle()
      expect(scroll).not.toHaveBeenCalled()
    })

    it('scrolls smoothly, or at once when the user asks for reduced motion', async () => {
      const { engine, findings } = await setup([], {}, { scrollToFirst: true })
      const scroll = spyScroll(engine)
      findings.add(finding('a', 0))
      await settle()
      expect(scroll.mock.calls[0]![2]).toEqual({ behavior: 'smooth' })

      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('reduce'),
      }))
      cleanup.push(() => vi.unstubAllGlobals())
      findings.add(finding('b', 0, 200))
      await settle()
      expect(scroll.mock.calls[1]![2]).toEqual({ behavior: 'auto' })
    })
  })
})
