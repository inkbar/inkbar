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
 * the open ones as marks with `opts`.
 */
async function setup(
  initial: Finding[],
  opts: Partial<MarksOptions<Finding>> = {},
  {
    fixture = 'text-simple',
    ...viewer
  }: Partial<MountViewerOptions> & { fixture?: FixtureName } = {}
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
  })
  const plugins = createPluginHost({
    plugins: [factory()],
    document: writable(doc),
    history: () => doc.history,
    activated: writable<string | null>(null),
    setActivated() {},
    root: writable<HTMLElement | null>(container),
  })
  const engine = mountViewer({ container, document: doc, zoom: 1, plugins, ...viewer })
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

    findings.update('a', { reason: 'Other' })
    mark = markFor('a')!
    expect(mark.style.borderColor).toBe('blue')
    expect(mark.dataset.reason).toBe('Other')
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
})
