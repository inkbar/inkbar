import { browserAssets, fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import {
  createMemorySignatureStore,
  type SignatureTemplate,
} from '../../model/signatures'
import { mountContainer, settle, until } from '../test-utils'

import { createColorMenu } from './color-menu'
import {
  createNextPage,
  createPageCount,
  createPageInput,
  createPrevPage,
  createRedo,
  createToolbar,
  createToolbarSeparator,
  createToolButton,
  createUndo,
  createZoomIn,
  createZoomOut,
  createZoomSelect,
} from './controls'
import { createViewer, type CreateViewerOptions, type Viewer } from './create-viewer'
import { createHighlightMenu } from './highlight-menu'
import { createShapeMenu } from './shape-menu'
import { createSignatureMenu } from './signature-menu'
import { createLineStyleMenu } from './style-menu'
import { createTextStyleMenu } from './text-style-menu'

import type { InkDocument } from '../../model/document'
import type { ViewerEngine } from '../viewer-engine'

// The theme is not loaded here: give the scroll element a height so pages mount and unmount.
beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = '.ink-scroll { height: 500px; }'
  document.head.append(style)
})

let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.forEach((f) => f())
  cleanup = []
})

function make(
  name: FixtureName = 'annotated-notes-threaded',
  opts: Partial<CreateViewerOptions> = {}
) {
  const host = mountContainer(800, 600)
  const viewer = createViewer(host, {
    source: fixtureUrl(name),
    assets: browserAssets(),
    zoom: 1,
    ...opts,
  })
  cleanup.push(() => {
    viewer.destroy()
    host.remove()
  })
  return { host, viewer }
}

async function ready(
  viewer: Viewer
): Promise<{ doc: InkDocument; engine: ViewerEngine }> {
  await until(() => viewer.status.get().state === 'ready' && viewer.engine.get() !== null)
  return { doc: viewer.document.get()!, engine: viewer.engine.get()! }
}

const threadPopover = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-ink-thread-popover]')
const card = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-ink-suggestion-card]')
const isOpen = (el: HTMLElement | null): boolean => !!el && !el.hidden
const focused = (): Element | null => document.activeElement

function annotationEl(viewer: Viewer, id: string): HTMLElement | null {
  return viewer.element.querySelector<HTMLElement>(`[data-annotation="${id}"]`)
}

function key(el: Element, k: string): void {
  el.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
  )
}

/** Focuses an annotation and presses Enter on it: the overlay's keyboard activation. */
function activate(el: HTMLElement): void {
  el.focus()
  key(el, 'Enter')
}

function pointer(
  el: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
  clientY: number
): void {
  el.dispatchEvent(
    new PointerEvent(type, {
      clientX,
      clientY,
      bubbles: true,
      pointerId: 1,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      isPrimary: true,
    })
  )
}

function suggest(doc: InkDocument, y: number, reason = 'third-party name') {
  return doc.annotations.add({
    type: 'redact',
    page: 0,
    rect: { x: 72, y, width: 150, height: 20 },
    origin: 'suggested',
    suggestion: {
      confidence: 0.92,
      reason,
      explanation: 'Names a person other than the data subject.',
    },
  })
}

async function rootNote(viewer: Viewer, doc: InkDocument): Promise<HTMLElement> {
  // The root and the standalone note: the root's two replies are not drawn on the page.
  await until(() => viewer.element.querySelectorAll('[data-annotation]').length === 2)
  const note = doc.annotations.list.get().find((a) => a.contents === 'Root note')!
  return annotationEl(viewer, note.id)!
}

describe('createViewer', () => {
  it('opens a document and renders the viewer and pages', async () => {
    const onReady = vi.fn()
    const { viewer } = make('annotated-notes-threaded', { onReady })
    expect(viewer.status.get().state).toBe('loading')
    expect(viewer.element.querySelector('.ink-status')?.textContent).toBe(
      'Loading document…'
    )
    const { doc } = await ready(viewer)
    expect(viewer.element.matches('[data-ink-root][data-state="ready"]')).toBe(true)
    expect(viewer.element.querySelector('.ink-viewport-root .ink-scroll')).not.toBeNull()
    expect(viewer.element.querySelector('[data-ink-toolbar]')).toBeNull()
    await until(
      () => viewer.element.querySelector('.ink-page[data-page="0"] canvas') !== null
    )
    expect(viewer.element.querySelector('.ink-status')).toBeNull()
    expect(doc.status.get().state).toBe('ready')
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(onReady).toHaveBeenCalledWith(doc)
  })

  it('shows the error state, then recovers on the next open', async () => {
    const onError = vi.fn()
    const onReady = vi.fn()
    const { viewer } = make('text-simple', {
      source: new Uint8Array([1, 2, 3]),
      onError,
      onReady,
    })
    await until(() => viewer.status.get().state === 'error')
    expect(viewer.element.dataset.state).toBe('error')
    const status = viewer.element.querySelector('.ink-status.ink-error')!
    expect(status.getAttribute('role')).toBe('alert')
    expect(status.querySelector('.ink-error-title')?.textContent).toBe(
      'This document could not be opened.'
    )
    const code = status.querySelector('code.ink-error-code')!
    expect(code.textContent).toBe('InvalidPdf')
    expect(code.getAttribute('title')).toBeTruthy()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]![0]).toMatchObject({ code: 'InvalidPdf' })
    expect(onReady).not.toHaveBeenCalled()

    viewer.open(fixtureUrl('text-simple'))
    await ready(viewer)
    expect(viewer.element.querySelector('.ink-error')).toBeNull()
    await until(() => viewer.element.querySelector('.ink-page[data-page="0"]') !== null)
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it("gives each opened document's engine a tool style bound to that document", async () => {
    const stale = {}
    // @ts-expect-error A tool style belongs to one document's store: not a viewer option.
    const options: Partial<CreateViewerOptions> = { toolStyle: stale }
    // An untyped caller's style is ignored rather than handed to every engine.
    const { viewer } = make('text-simple', options)
    const first = await ready(viewer)
    expect(first.engine.toolStyle).not.toBe(stale)
    viewer.open(fixtureUrl('annotated-notes-threaded'))
    await until(() => viewer.document.get() !== first.doc)
    const second = await ready(viewer)
    expect(second.engine.toolStyle).not.toBe(first.engine.toolStyle)
    const a = second.doc.annotations.add({
      type: 'square',
      page: 0,
      rect: { x: 10, y: 10, width: 40, height: 40 },
    })
    second.doc.annotations.select([a.id])
    second.engine.toolStyle.set({ width: 5 })
    expect(second.doc.annotations.get(a.id)).toMatchObject({ width: 5 })
  })

  it('shows the error state when openDocument itself rejects', async () => {
    const onError = vi.fn()
    const { viewer } = make('text-simple', {
      assets: undefined as unknown as CreateViewerOptions['assets'],
      onError,
    })
    await until(() => viewer.status.get().state === 'error')
    expect(viewer.element.querySelector('.ink-error-title')?.textContent).toBe(
      'This document could not be opened.'
    )
    expect(onError).toHaveBeenCalledTimes(1)
    expect(viewer.engine.get()).toBeNull()
  })

  it("opens an encrypted file with the password given to open, else the constructor's", async () => {
    const { viewer } = make('text-simple')
    await ready(viewer)
    viewer.open(fixtureUrl('encrypted-aes'))
    await until(() => viewer.status.get().state === 'error')
    const status = viewer.status.get()
    expect(status.state === 'error' && status.error.code).toBe('PasswordRequired')

    viewer.open(fixtureUrl('encrypted-aes'), { password: 'inkbar' })
    const { doc } = await ready(viewer)
    expect(doc.pages).toHaveLength(1)
    await until(() => viewer.element.querySelector('.ink-page[data-page="0"]') !== null)

    // The constructor's password is the fallback when open passes none.
    const other = make('encrypted-aes', { password: 'inkbar' }).viewer
    await ready(other)
    other.open(fixtureUrl('encrypted-rc4'))
    const { doc: rc4 } = await ready(other)
    expect(rc4.pages).toHaveLength(1)
    // A password given to open replaces the constructor's for that load.
    other.open(fixtureUrl('encrypted-rc4'), { password: 'wrong' })
    await until(() => other.status.get().state === 'error')
    const wrong = other.status.get()
    expect(wrong.state === 'error' && wrong.error).toMatchObject({
      code: 'PasswordRequired',
      details: { passwordSupplied: true, incorrect: true },
    })
  })

  it('lets the latest open win', async () => {
    const onReady = vi.fn()
    const { viewer } = make('text-simple', { onReady })
    viewer.open(fixtureUrl('annotated-notes-threaded'))
    const { doc } = await ready(viewer)
    await settle(300)
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(onReady).toHaveBeenCalledWith(doc)
    expect(viewer.document.get()).toBe(doc)
    // text-simple has three pages, the notes fixture one.
    expect(doc.pages).toHaveLength(1)
    expect(viewer.element.querySelectorAll('.ink-page')).toHaveLength(1)
  })

  it('keeps tool options across documents', async () => {
    const { viewer } = make('text-simple')
    const { engine: first } = await ready(viewer)
    first.tools.set('shape', { kind: 'ellipse' })
    viewer.open(fixtureUrl('annotated-notes-threaded'))
    const { engine } = await ready(viewer)
    expect(engine).not.toBe(first)
    expect(engine.tools.options('shape').get()).toMatchObject({ kind: 'ellipse' })
  })

  it('destroys the previous document when another opens', async () => {
    const { viewer } = make('text-simple')
    const { doc: first } = await ready(viewer)
    viewer.open(fixtureUrl('annotated-notes-threaded'))
    expect(viewer.engine.get()).toBeNull()
    await expect(first.text(0)).rejects.toMatchObject({ code: 'DocumentDestroyed' })
    const { doc } = await ready(viewer)
    expect(doc).not.toBe(first)
  })

  describe('toggles', () => {
    it('threads: false opens no thread popover', async () => {
      const { viewer } = make('annotated-notes-threaded', { threads: false })
      const { doc } = await ready(viewer)
      activate(await rootNote(viewer, doc))
      await settle()
      expect(threadPopover()).toBeNull()
    })

    it('suggestions: false opens no card', async () => {
      const { viewer } = make('text-simple', { suggestions: false })
      const { doc } = await ready(viewer)
      const s = suggest(doc, 670)
      await until(() => annotationEl(viewer, s.id) !== null)
      activate(annotationEl(viewer, s.id)!)
      await settle()
      expect(card()).toBeNull()
    })
  })

  describe('controls', () => {
    it('roves between buttons; the select and the page input are their own Tab stops', async () => {
      const { viewer } = make('text-simple')
      const { tools, status } = bars(viewer)
      // Disabled until a document is ready.
      expect([...status.querySelectorAll('button')].every((b) => b.disabled)).toBe(true)
      await ready(viewer)
      expect(tools.getAttribute('role')).toBe('toolbar')
      expect(tools.getAttribute('aria-label')).toBe('Document tools')
      expect(tools.getAttribute('aria-orientation')).toBe('horizontal')
      const buttons = [...tools.querySelectorAll<HTMLElement>('button')]
      expect(buttons).toHaveLength(5)
      expect(buttons.filter((c) => c.tabIndex === 0)).toHaveLength(1)
      expect(status.getAttribute('aria-label')).toBe('Page and zoom')
      // On the first page, Previous page is disabled and leaves the rotation.
      const statusButtons = [...status.querySelectorAll<HTMLButtonElement>('button')]
      expect(statusButtons.map((b) => b.getAttribute('aria-label'))).toEqual([
        'Previous page',
        'Next page',
        'Zoom out',
        'Zoom in',
      ])
      expect(statusButtons[0]!.disabled).toBe(true)
      const select = status.querySelector<HTMLSelectElement>('.ink-zoom-select')!
      const input = status.querySelector<HTMLInputElement>('[data-ink-page-input]')!
      expect(select.tabIndex).toBe(0)
      expect(input.tabIndex).toBe(0)

      // Tab from before the viewer: the tools once, the document, then the status bar's
      // buttons once, the page input and the select in document order.
      const before = document.createElement('button')
      before.textContent = 'before'
      viewer.element.before(before)
      cleanup.push(() => before.remove())
      before.focus()
      await userEvent.tab()
      expect(focused()).toBe(buttons[0])
      await userEvent.tab()
      expect(focused()?.matches('[data-ink-scroll]')).toBe(true)
      await userEvent.tab()
      expect(focused()).toBe(input)
      await userEvent.tab()
      expect(focused()).toBe(statusButtons[1])
      await userEvent.tab()
      expect(focused()).toBe(select)
      await userEvent.tab()
      expect(status.contains(focused())).toBe(false)

      buttons[0]!.focus()
      await userEvent.keyboard('{ArrowRight}')
      expect(focused()).toBe(buttons[1])
      expect(buttons[1]!.tabIndex).toBe(0)
      expect(buttons.filter((c) => c.tabIndex === 0)).toHaveLength(1)
      await userEvent.keyboard('{ArrowLeft}')
      await userEvent.keyboard('{ArrowLeft}')
      expect(focused()).toBe(buttons[4])
      await userEvent.keyboard('{ArrowRight}')
      expect(focused()).toBe(buttons[0])
      await userEvent.keyboard('{End}')
      expect(focused()).toBe(buttons[4])
      await userEvent.keyboard('{Home}')
      expect(focused()).toBe(buttons[0])
      // Zoom out to zoom in skips the select between them.
      statusButtons[2]!.focus()
      await userEvent.keyboard('{ArrowRight}')
      expect(focused()).toBe(statusButtons[3])
      // The select keeps its keys.
      select.focus()
      await userEvent.keyboard('{ArrowRight}')
      expect(focused()).toBe(select)
    })

    it("keeps a host field's own tabindex", async () => {
      const { viewer } = make('text-simple')
      const { tools } = bars(viewer)
      await ready(viewer)
      const skipped = document.createElement('input')
      skipped.setAttribute('aria-label', 'Skipped')
      skipped.tabIndex = -1
      const plain = document.createElement('textarea')
      plain.setAttribute('aria-label', 'Plain')
      tools.append(skipped, plain)
      await settle()
      // A button added afterwards makes the toolbar sync its Tab stops again.
      tools.append(document.createElement('button'))
      await settle()
      expect(skipped.tabIndex).toBe(-1)
      expect(plain.tabIndex).toBe(0)
    })

    it('roves to buttons a host adds and leaves a host text input its keys', async () => {
      const { viewer } = make('text-simple')
      const { tools } = bars(viewer)
      await ready(viewer)
      const extra = document.createElement('button')
      extra.textContent = 'Extra'
      const field = document.createElement('input')
      field.type = 'text'
      field.setAttribute('aria-label', 'Search')
      field.value = 'abc'
      tools.append(extra, field)
      await settle()
      expect(extra.tabIndex).toBe(-1)
      expect(field.tabIndex).toBe(0)
      tools.querySelector<HTMLElement>('[data-tool="note"]')!.focus()
      await userEvent.keyboard('{ArrowRight}')
      expect(focused()).toBe(extra)

      field.focus()
      field.setSelectionRange(3, 3)
      await userEvent.keyboard('{ArrowLeft}')
      expect(focused()).toBe(field)
      expect(field.selectionStart).toBe(2)
      await userEvent.keyboard('{Home}')
      expect(focused()).toBe(field)
      expect(field.selectionStart).toBe(0)
    })

    it('the text tool button is named Text, shows its icon and picks the text box tool', async () => {
      const { viewer } = make('text-simple')
      const { tools: t } = bars(viewer)
      const text = createToolButton(viewer, 'freetext')
      t.append(text)
      const { engine } = await ready(viewer)
      expect(text.getAttribute('aria-label')).toBe('Text')
      expect(text.querySelector('svg.ink-icon')).not.toBeNull()
      text.click()
      expect(text.getAttribute('aria-pressed')).toBe('true')
      expect(engine.tools.active.get()).toBe('freetext')
    })

    it('the sketch tool button is named Sketch, shows its icon and picks the sketch tool', async () => {
      const { viewer } = make('text-simple')
      const { tools: t } = bars(viewer)
      const sketch = createToolButton(viewer, 'sketch')
      t.append(sketch)
      const { engine } = await ready(viewer)
      expect(sketch.getAttribute('aria-label')).toBe('Sketch')
      expect(sketch.querySelector('svg.ink-icon')).not.toBeNull()
      sketch.click()
      expect(sketch.getAttribute('aria-pressed')).toBe('true')
      expect(engine.tools.active.get()).toBe('sketch')
    })

    it('the draw tool button is named Draw, shows its icon and picks the draw tool', async () => {
      const { viewer } = make('text-simple')
      const { tools: t } = bars(viewer)
      const draw = createToolButton(viewer, 'draw')
      t.append(draw)
      const { engine } = await ready(viewer)
      expect(draw.getAttribute('aria-label')).toBe('Draw')
      expect(draw.querySelector('svg.ink-icon')).not.toBeNull()
      draw.click()
      expect(draw.getAttribute('aria-pressed')).toBe('true')
      expect(engine.tools.active.get()).toBe('draw')
    })

    it('drives the tools, zoom and page', async () => {
      const { viewer } = make('text-simple')
      const { tools: t, status: s } = bars(viewer)
      const { engine } = await ready(viewer)
      const highlight = t.querySelector<HTMLButtonElement>('[data-tool="highlight"]')!
      expect(highlight.getAttribute('aria-label')).toBe('Highlight')
      // The icon is decoration; the label names the button.
      expect(highlight.querySelector('svg.ink-icon')?.getAttribute('aria-hidden')).toBe(
        'true'
      )
      highlight.click()
      expect(highlight.getAttribute('aria-pressed')).toBe('true')
      expect(highlight.dataset.state).toBe('on')
      expect(engine.tools.active.get()).toBe('highlight')
      expect(
        t.querySelector('[data-tool="select-text"]')!.getAttribute('aria-pressed')
      ).toBe('false')

      const select = s.querySelector<HTMLSelectElement>('.ink-zoom-select')!
      expect(select.value).toBe('1')
      select.value = '2'
      select.dispatchEvent(new Event('change'))
      expect(engine.viewport.zoom.get()).toBe(2)
      s.querySelector<HTMLButtonElement>('[data-ink-zoom-out]')!.click()
      expect(engine.viewport.zoom.get()).toBeCloseTo(1.6)
      expect(select.value).toBe('custom')
      expect(select.selectedOptions[0]!.textContent).toBe('160%')
      // In order among the levels.
      expect(select.selectedOptions[0]!.previousElementSibling!.textContent).toBe('150%')

      expect(s.querySelector('[data-ink-page-count]')!.textContent).toBe('of 3')
      const input = s.querySelector<HTMLInputElement>('[data-ink-page-input]')!
      expect(input.value).toBe('1')
      input.value = '3'
      input.dispatchEvent(new Event('change'))
      await until(() => engine.viewport.currentPage.get() === 2)
      input.value = '9'
      input.dispatchEvent(new Event('change'))
      expect(input.value).toBe('3')

      const prev = s.querySelector<HTMLButtonElement>('[data-ink-prev-page]')!
      const next = s.querySelector<HTMLButtonElement>('[data-ink-next-page]')!
      expect(next.disabled).toBe(true)
      prev.click()
      await until(() => engine.viewport.currentPage.get() === 1)
      expect(prev.disabled).toBe(false)
      expect(next.disabled).toBe(false)
      next.click()
      await until(() => engine.viewport.currentPage.get() === 2)
    })

    it('undo and redo follow the history; the separator divides the toolbar', async () => {
      const { viewer } = make('text-simple')
      const bar = createToolbar()
      const separator = createToolbarSeparator()
      const undo = createUndo(viewer)
      const redo = createRedo(viewer)
      bar.append(createToolButton(viewer, 'select'), separator, undo, redo)
      viewer.element.prepend(bar)
      expect(separator.getAttribute('role')).toBe('separator')
      expect(separator.getAttribute('aria-orientation')).toBe('vertical')
      expect(undo.getAttribute('aria-label')).toBe('Undo')
      expect(undo.disabled).toBe(true)
      const { doc } = await ready(viewer)
      expect(undo.disabled).toBe(true)
      expect(redo.disabled).toBe(true)
      doc.annotations.add({
        type: 'text',
        page: 0,
        rect: { x: 0, y: 0, width: 20, height: 20 },
      })
      expect(undo.disabled).toBe(false)
      undo.click()
      expect(doc.annotations.list.get()).toHaveLength(0)
      expect(undo.disabled).toBe(true)
      expect(redo.disabled).toBe(false)
      redo.click()
      expect(doc.annotations.list.get()).toHaveLength(1)
      expect(redo.disabled).toBe(true)
    })

    it('follows the new viewport after a rebuild and disables while nothing is open', async () => {
      const { viewer } = make('text-simple')
      const { status: s } = bars(viewer)
      const { engine } = await ready(viewer)
      const before = viewer.viewport.get()
      engine.rebuild({ gap: 24 })
      expect(viewer.viewport.get()).not.toBe(before)
      s.querySelector<HTMLButtonElement>('[data-ink-zoom-in]')!.click()
      expect(viewer.viewport.get()!.zoom.get()).toBe(1.25)
      expect(s.querySelector<HTMLSelectElement>('.ink-zoom-select')!.value).toBe('1.25')

      viewer.open(fixtureUrl('text-simple'))
      expect(viewer.viewport.get()).toBeNull()
      expect([...s.querySelectorAll('button')].every((b) => b.disabled)).toBe(true)
      expect(s.querySelector('[data-ink-page-count]')!.textContent).toBe('')
      await ready(viewer)
      expect(s.querySelector('[data-ink-page-count]')!.textContent).toBe('of 3')
    })
  })

  describe('line style menu', () => {
    const lineAt = (y: number, width: number) =>
      ({
        type: 'line',
        page: 0,
        start: { x: 50, y },
        end: { x: 150, y },
        width,
      }) as const
    const menu = (): HTMLElement | null =>
      document.querySelector<HTMLElement>('[data-ink-menu="line-style"][role="menu"]')
    const item = (name: string): HTMLButtonElement =>
      [...menu()!.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].find(
        (b) => b.textContent?.trim() === name
      )!

    it('line style menu sets width on the selected line', async () => {
      const { viewer } = make('text-simple')
      const trigger = createLineStyleMenu(viewer)
      viewer.element.prepend(trigger)
      expect(trigger.getAttribute('aria-label')).toBe('Line style')
      expect(trigger.disabled).toBe(true)
      const { doc } = await ready(viewer)
      const line = doc.annotations.add(lineAt(700, 1))
      expect(trigger.disabled).toBe(true)
      doc.annotations.select([line.id])
      expect(trigger.disabled).toBe(false)
      trigger.click()
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
      expect(item('1 pt').getAttribute('aria-checked')).toBe('true')
      item('4 pt').click()
      expect(doc.annotations.get(line.id)).toMatchObject({ width: 4 })
      expect(item('4 pt').getAttribute('aria-checked')).toBe('true')
      item('Dashed').click()
      item('Arrowhead at end').click()
      expect(doc.annotations.get(line.id)).toMatchObject({
        dashes: [3, 3],
        tail: 'OpenArrow',
        head: 'None',
      })
      item('Solid').click()
      expect(doc.annotations.get(line.id)).not.toHaveProperty('dashes', [3, 3])
    })

    it('an ending Inkbar does not draw shows as no arrowhead', async () => {
      const { viewer } = make('text-simple')
      const trigger = createLineStyleMenu(viewer)
      viewer.element.prepend(trigger)
      const { doc } = await ready(viewer)
      const line = doc.annotations.add({
        ...lineAt(700, 1),
        head: 'Foo_1',
        tail: 'Square',
      })
      doc.annotations.select([line.id])
      trigger.click()
      expect(item('Arrowhead at end').getAttribute('aria-checked')).toBe('true')
      expect(item('Arrowheads at both ends').getAttribute('aria-checked')).toBe('false')
    })

    it('arrowheads section is disabled for a selected square', async () => {
      const { viewer } = make('text-simple')
      const trigger = createLineStyleMenu(viewer)
      viewer.element.prepend(trigger)
      const { doc } = await ready(viewer)
      const sq = doc.annotations.add({
        type: 'square',
        page: 0,
        rect: { x: 50, y: 500, width: 100, height: 60 },
      })
      doc.annotations.select([sq.id])
      trigger.click()
      const arrows = menu()!.querySelector('[aria-label="Arrowheads"]')!
      expect(arrows.getAttribute('aria-disabled')).toBe('true')
      expect(item('Arrowhead at end').disabled).toBe(true)
      expect(item('2 pt').disabled).toBe(false)
      expect(item('Dashed').disabled).toBe(false)
    })

    it('shows mixed for two lines with different widths', async () => {
      const { viewer } = make('text-simple')
      const trigger = createLineStyleMenu(viewer)
      viewer.element.prepend(trigger)
      const { doc } = await ready(viewer)
      const a = doc.annotations.add(lineAt(700, 1))
      const b = doc.annotations.add(lineAt(650, 3))
      doc.annotations.select([a.id, b.id])
      expect(trigger.hasAttribute('data-mixed')).toBe(true)
      trigger.click()
      const weights = menu()!.querySelector('[aria-label="Weight"]')!
      expect(weights.querySelectorAll('[aria-checked="true"]')).toHaveLength(0)
      expect(weights.querySelectorAll('.ink-select-indicator')).toHaveLength(0)
      item('2 pt').click()
      expect(trigger.hasAttribute('data-mixed')).toBe(false)
    })

    it('ArrowDown on the trigger opens the menu on the first enabled item', async () => {
      const { viewer } = make('text-simple')
      const trigger = createLineStyleMenu(viewer)
      viewer.element.prepend(trigger)
      const { doc } = await ready(viewer)
      doc.annotations.select([doc.annotations.add(lineAt(700, 3)).id])
      trigger.focus()
      key(trigger, 'ArrowDown')
      expect(menu()).not.toBeNull()
      expect(focused()).toBe(item('0.5 pt'))
    })

    it('closes when the selection clears and the control disables', async () => {
      const { viewer } = make('text-simple')
      const trigger = createLineStyleMenu(viewer)
      viewer.element.prepend(trigger)
      const { doc } = await ready(viewer)
      doc.annotations.select([doc.annotations.add(lineAt(700, 3)).id])
      trigger.click()
      expect(menu()).not.toBeNull()
      doc.annotations.select([])
      expect(trigger.disabled).toBe(true)
      expect(menu()).toBeNull()
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })

    it('dismisses on an outside press', async () => {
      const { viewer } = make('text-simple')
      const trigger = createLineStyleMenu(viewer)
      viewer.element.prepend(trigger)
      const { doc } = await ready(viewer)
      doc.annotations.select([doc.annotations.add(lineAt(700, 3)).id])
      trigger.click()
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      expect(menu()).toBeNull()
    })

    it('moves with the arrow keys, and Escape closes and returns focus', async () => {
      const { viewer } = make('text-simple')
      const trigger = createLineStyleMenu(viewer)
      viewer.element.prepend(trigger)
      const { doc } = await ready(viewer)
      doc.annotations.select([doc.annotations.add(lineAt(700, 3)).id])
      trigger.focus()
      trigger.click()
      expect(focused()).toBe(item('3 pt'))
      key(focused()!, 'ArrowDown')
      expect(focused()).toBe(item('4 pt'))
      key(focused()!, 'Home')
      expect(focused()).toBe(item('0.5 pt'))
      key(focused()!, 'Escape')
      expect(menu()).toBeNull()
      expect(focused()).toBe(trigger)
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })
  })

  describe('colour menus', () => {
    const square = {
      type: 'square',
      page: 0,
      rect: { x: 50, y: 500, width: 100, height: 60 },
    } as const
    const menu = (): HTMLElement | null =>
      document.querySelector<HTMLElement>('[data-ink-menu^="color"][role="menu"]')
    const item = (name: string): HTMLButtonElement =>
      [...menu()!.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]')].find(
        (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name
      )!

    it('border menu sets color on a selected square', async () => {
      const { viewer } = make('text-simple')
      const trigger = createColorMenu(viewer, { property: 'border' })
      viewer.element.prepend(trigger)
      expect(trigger.getAttribute('aria-label')).toBe('Border colour')
      expect(trigger.disabled).toBe(true)
      const { doc } = await ready(viewer)
      const sq = doc.annotations.add({ ...square, color: '#FF3B30' })
      doc.annotations.select([sq.id])
      expect(trigger.disabled).toBe(false)
      trigger.click()
      expect(menu()!.getAttribute('aria-label')).toBe('Border colour')
      expect(item('#FF3B30').getAttribute('aria-checked')).toBe('true')
      expect(
        menu()!.querySelector('[aria-label="No fill"], [data-key="no-fill"]')
      ).toBeNull()
      item('#007AFF').click()
      expect(doc.annotations.get(sq.id)).toMatchObject({ color: '#007AFF' })
      expect(item('#007AFF').getAttribute('aria-checked')).toBe('true')
      expect(trigger.querySelector('[data-ink-swatch]')!.getAttribute('data-color')).toBe(
        '#007AFF'
      )
    })

    it('fill menu has No fill and it clears interiorColor', async () => {
      const { viewer } = make('text-simple')
      const trigger = createColorMenu(viewer, { property: 'fill' })
      viewer.element.prepend(trigger)
      const { doc } = await ready(viewer)
      const sq = doc.annotations.add({ ...square, interiorColor: '#34C759' })
      doc.annotations.select([sq.id])
      trigger.click()
      expect(item('#34C759').getAttribute('aria-checked')).toBe('true')
      item('No fill').click()
      expect(
        (doc.annotations.get(sq.id) as { interiorColor?: string }).interiorColor
      ).toBeUndefined()
      expect(item('No fill').getAttribute('aria-checked')).toBe('true')
      expect(trigger.querySelector('[data-ink-swatch]')!.getAttribute('data-kind')).toBe(
        'none'
      )
    })

    const picker = (): HTMLInputElement =>
      document.querySelector<HTMLInputElement>('input[data-ink-color-input="border"]')!

    it('Custom opens a native color input and applies its value', async () => {
      const { viewer } = make('text-simple')
      const trigger = createColorMenu(viewer, { property: 'border' })
      viewer.element.prepend(trigger)
      const { doc } = await ready(viewer)
      const sq = doc.annotations.add(square)
      doc.annotations.select([sq.id])
      trigger.click()
      let opened = 0
      document.addEventListener('click', (e) => {
        if ((e.target as Element).matches?.('input[type="color"]')) opened++
      })
      item('Custom…').click()
      const input = picker()
      expect(opened).toBe(1)
      expect(input.getAttribute('aria-label')).toBe('Custom colour')
      input.value = '#123abc'
      input.dispatchEvent(new Event('change', { bubbles: true }))
      expect(doc.annotations.get(sq.id)).toMatchObject({ color: '#123ABC' })
    })

    it('Custom: the input survives the menu closing while the picker is open', async () => {
      const { viewer } = make('text-simple')
      const trigger = createColorMenu(viewer, { property: 'border' })
      viewer.element.prepend(trigger)
      const { doc } = await ready(viewer)
      const sq = doc.annotations.add(square)
      doc.annotations.select([sq.id])
      trigger.click()
      item('Custom…').click()
      const input = picker()
      key(focused() ?? input, 'Escape')
      expect(menu()).toBeNull()
      expect(input.isConnected).toBe(true)
      input.value = '#abcdef'
      input.dispatchEvent(new Event('change', { bubbles: true }))
      expect(doc.annotations.get(sq.id)).toMatchObject({ color: '#ABCDEF' })
    })

    it('a mixed selection shows a mixed trigger', async () => {
      const { viewer } = make('text-simple')
      const trigger = createColorMenu(viewer, { property: 'border' })
      viewer.element.prepend(trigger)
      const { doc } = await ready(viewer)
      const a = doc.annotations.add({ ...square, color: '#FF3B30' })
      const b = doc.annotations.add({ ...square, color: '#007AFF' })
      doc.annotations.select([a.id, b.id])
      expect(trigger.hasAttribute('data-mixed')).toBe(true)
      expect(trigger.querySelector('[data-ink-swatch]')!.getAttribute('data-kind')).toBe(
        'mixed'
      )
    })

    it('fill menu is disabled when only a line is selected', async () => {
      const { viewer } = make('text-simple')
      const border = createColorMenu(viewer, { property: 'border' })
      const fill = createColorMenu(viewer, { property: 'fill' })
      viewer.element.prepend(border, fill)
      const { doc } = await ready(viewer)
      const line = doc.annotations.add({
        type: 'line',
        page: 0,
        start: { x: 50, y: 700 },
        end: { x: 150, y: 700 },
      })
      doc.annotations.select([line.id])
      expect(border.disabled).toBe(false)
      expect(fill.disabled).toBe(true)
    })

    it('keyboard: arrows move between swatches, Enter applies, Escape returns focus', async () => {
      const { viewer } = make('text-simple')
      const trigger = createColorMenu(viewer, { property: 'fill' })
      viewer.element.prepend(trigger)
      const { doc } = await ready(viewer)
      const sq = doc.annotations.add(square)
      doc.annotations.select([sq.id])
      trigger.focus()
      key(trigger, 'ArrowDown')
      expect(focused()).toBe(item('No fill'))
      key(focused()!, 'ArrowDown')
      expect(focused()).toBe(item('#FF3B30'))
      key(focused()!, 'ArrowRight')
      expect(focused()).toBe(item('#FF9500'))
      key(focused()!, 'ArrowDown')
      // One row down is the greys.
      expect(focused()).toBe(item('#E8E8E8'))
      key(focused()!, 'ArrowLeft')
      expect(focused()).toBe(item('#FFFFFF'))
      key(focused()!, 'ArrowUp')
      expect(focused()).toBe(item('#FF3B30'))
      key(focused()!, 'ArrowUp')
      expect(focused()).toBe(item('No fill'))
      key(focused()!, 'ArrowDown')
      await userEvent.keyboard('{Enter}')
      expect(doc.annotations.get(sq.id)).toMatchObject({ interiorColor: '#FF3B30' })
      key(focused()!, 'Escape')
      expect(menu()).toBeNull()
      expect(focused()).toBe(trigger)
    })
  })

  describe('text style menu', () => {
    const box = {
      type: 'freetext',
      page: 0,
      rect: { x: 50, y: 500, width: 200, height: 40 },
      contents: 'Hello',
      defaultStyle: {
        fontFamily: 'Helvetica',
        fontSize: 12,
        color: '#000000',
        textAlign: 'left',
      },
    } as const
    const panel = (): HTMLElement | null =>
      document.querySelector<HTMLElement>('[data-ink-menu="text-style"]')
    const byLabel = <T extends HTMLElement>(label: string): T =>
      panel()!.querySelector<T>(`[aria-label="${label}"]`)!
    const setup = async () => {
      const { viewer } = make('text-simple')
      const trigger = createTextStyleMenu(viewer)
      viewer.element.prepend(trigger)
      const { doc, engine } = await ready(viewer)
      return { viewer, trigger, doc, engine }
    }

    it('bold toggle sets defaultStyle.fontWeight on the selected text box', async () => {
      const { trigger, doc } = await setup()
      expect(trigger.getAttribute('aria-label')).toBe('Text style')
      expect(trigger.disabled).toBe(true)
      const tb = doc.annotations.add(box)
      doc.annotations.select([tb.id])
      expect(trigger.disabled).toBe(false)
      trigger.click()
      expect(panel()!.getAttribute('role')).toBe('dialog')
      expect(panel()!.getAttribute('aria-label')).toBe('Text style')
      const bold = byLabel('Bold')
      expect(bold.getAttribute('aria-pressed')).toBe('false')
      bold.click()
      expect(bold.getAttribute('aria-pressed')).toBe('true')
      expect(doc.annotations.get(tb.id)).toMatchObject({
        defaultStyle: { fontWeight: 'bold' },
      })
      bold.click()
      expect(
        (doc.annotations.get(tb.id) as { defaultStyle: object }).defaultStyle
      ).not.toHaveProperty('fontWeight')
      byLabel('Align centre').click()
      const font = byLabel<HTMLSelectElement>('Font')
      font.value = 'Times'
      font.dispatchEvent(new Event('change', { bubbles: true }))
      expect(doc.annotations.get(tb.id)).toMatchObject({
        defaultStyle: { textAlign: 'center', fontFamily: 'Times' },
      })
      expect(byLabel('Align centre').getAttribute('aria-checked')).toBe('true')
    })

    it('size stepper clamps to 1..144', async () => {
      const { trigger, doc } = await setup()
      const tb = doc.annotations.add(box)
      doc.annotations.select([tb.id])
      trigger.click()
      const size = byLabel<HTMLInputElement>('Font size')
      const fontSize = () =>
        (doc.annotations.get(tb.id) as { defaultStyle: { fontSize: number } })
          .defaultStyle.fontSize
      expect(size.value).toBe('12')
      size.value = '500'
      size.dispatchEvent(new Event('input', { bubbles: true }))
      key(size, 'Enter')
      expect(fontSize()).toBe(144)
      expect(size.value).toBe('144')
      byLabel('Increase font size').click()
      expect(size.value).toBe('144')
      size.value = '0'
      size.dispatchEvent(new Event('input', { bubbles: true }))
      key(size, 'Enter')
      expect(size.value).toBe('1')
      byLabel('Decrease font size').click()
      expect(size.value).toBe('1')
      byLabel('Increase font size').click()
      expect(fontSize()).toBe(2)
    })

    it('menu disabled with only a square selected and the select tool active', async () => {
      const { trigger, doc, engine } = await setup()
      engine.tools.set('select')
      const sq = doc.annotations.add({
        type: 'square',
        page: 0,
        rect: { x: 50, y: 400, width: 100, height: 60 },
      })
      doc.annotations.select([sq.id])
      expect(trigger.disabled).toBe(true)
    })

    it('with the text tool active and nothing selected, changes become the text group default for the next box', async () => {
      const { trigger, engine } = await setup()
      engine.tools.set('freetext')
      expect(trigger.disabled).toBe(false)
      trigger.click()
      byLabel('Italic').click()
      byLabel('Align right').click()
      expect(engine.toolStyle.get('text')).toMatchObject({
        fontStyle: 'italic',
        textAlign: 'right',
      })
    })

    it('nests the text colour menu, and Escape closes it first, then the panel', async () => {
      const { trigger, doc } = await setup()
      const tb = doc.annotations.add(box)
      doc.annotations.select([tb.id])
      trigger.focus()
      key(trigger, 'ArrowDown')
      expect(focused()).toBe(byLabel('Font'))
      const colour = byLabel<HTMLButtonElement>('Text colour')
      colour.click()
      const swatches = document.querySelector<HTMLElement>(
        '[data-ink-menu="color-textColor"]'
      )!
      swatches.querySelector<HTMLElement>('[aria-label="#FF3B30"]')!.click()
      expect(doc.annotations.get(tb.id)).toMatchObject({
        defaultStyle: { color: '#FF3B30' },
      })
      expect(panel()).not.toBeNull()
      key(focused()!, 'Escape')
      expect(document.querySelector('[data-ink-menu="color-textColor"]')).toBeNull()
      expect(panel()).not.toBeNull()
      expect(focused()).toBe(colour)
      key(focused()!, 'Escape')
      expect(panel()).toBeNull()
      expect(focused()).toBe(trigger)
    })

    const fontValues = (): string[] =>
      [...byLabel<HTMLSelectElement>('Font').options].map((o) => o.value)

    it('the font select offers the host fonts', async () => {
      const { viewer } = make('text-simple', { fonts: ['Georgia', 'Verdana'] })
      const trigger = createTextStyleMenu(viewer)
      viewer.element.prepend(trigger)
      const { doc } = await ready(viewer)
      const tb = doc.annotations.add(box)
      doc.annotations.select([tb.id])
      trigger.click()
      // The box uses Helvetica, which the host list lacks: it stays selectable.
      expect(fontValues()).toEqual(['Georgia', 'Verdana', 'Helvetica'])
      const font = byLabel<HTMLSelectElement>('Font')
      font.value = 'Verdana'
      font.dispatchEvent(new Event('change', { bubbles: true }))
      expect(doc.annotations.get(tb.id)).toMatchObject({
        defaultStyle: { fontFamily: 'Verdana' },
      })
    })

    it('falls back to the built-in fonts without a host list', async () => {
      const { trigger, doc } = await setup()
      const tb = doc.annotations.add(box)
      doc.annotations.select([tb.id])
      trigger.click()
      expect(fontValues()).toEqual(['Helvetica', 'Times', 'Courier'])
    })

    it('closes when the selection clears and the control disables', async () => {
      const { trigger, doc } = await setup()
      const tb = doc.annotations.add(box)
      doc.annotations.select([tb.id])
      trigger.click()
      expect(panel()).not.toBeNull()
      doc.annotations.select([])
      expect(trigger.disabled).toBe(true)
      expect(panel()).toBeNull()
    })
  })

  describe('highlight menu', () => {
    const panel = (): HTMLElement | null =>
      document.querySelector<HTMLElement>('[data-ink-menu="highlight"][role="menu"]')
    const item = (name: string): HTMLButtonElement =>
      [...panel()!.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].find(
        (b) => b.textContent?.trim() === name
      )!
    const parts = (root: HTMLElement) => ({
      main: root.querySelector<HTMLButtonElement>('[data-ink-highlight-button]')!,
      chevron: root.querySelector<HTMLButtonElement>(
        '[data-ink-highlight-menu-trigger]'
      )!,
    })

    it('the main button activates the highlight tool with the current kind', async () => {
      const { viewer } = make('text-simple')
      const root = createHighlightMenu(viewer)
      viewer.element.prepend(root)
      const { main, chevron } = parts(root)
      expect(main.disabled).toBe(true)
      expect(chevron.disabled).toBe(true)
      const { engine } = await ready(viewer)
      expect(main.getAttribute('aria-label')).toBe('Highlight')
      main.click()
      expect(engine.tools.active.get()).toBe('highlight')
      expect(main.getAttribute('aria-pressed')).toBe('true')
      expect(engine.tools.options('highlight').get()).toEqual({ kind: 'highlight' })
    })

    it('choosing underline activates highlight with kind underline', async () => {
      const { viewer } = make('text-simple')
      const root = createHighlightMenu(viewer)
      viewer.element.prepend(root)
      const { main, chevron } = parts(root)
      const { engine } = await ready(viewer)
      chevron.click()
      expect(panel()!.getAttribute('aria-label')).toBe('Highlights')
      expect(
        [...panel()!.querySelectorAll('[role="menuitemradio"]')].map((b) =>
          b.textContent?.trim()
        )
      ).toEqual(['Highlight', 'Underline', 'Strikethrough', 'Squiggly underline'])
      expect(item('Highlight').getAttribute('aria-checked')).toBe('true')
      item('Underline').click()
      expect(engine.tools.active.get()).toBe('highlight')
      expect(engine.tools.options('highlight').get()).toEqual({ kind: 'underline' })
      expect(main.getAttribute('aria-label')).toBe('Underline')
      expect(panel()).toBeNull()
      expect(document.activeElement).toBe(chevron)
    })

    it("the colour row shows the chosen kind's default colour until a colour is picked", async () => {
      const { viewer } = make('text-simple')
      const root = createHighlightMenu(viewer)
      viewer.element.prepend(root)
      const { chevron } = parts(root)
      const { doc } = await ready(viewer)
      const swatch = (): HTMLElement =>
        panel()!.querySelector<HTMLElement>('.ink-highlight-colour .ink-swatch')!
      chevron.click()
      expect(swatch().dataset.kind).toBe('color')
      expect(swatch().dataset.color).toBe(doc.annotations.defaults.color('highlight'))
      item('Underline').click()
      chevron.click()
      expect(swatch().dataset.color).toBe(doc.annotations.defaults.color('underline'))
    })

    it('the colour sets the markup group under any tool, and recolours selected markup', async () => {
      const { viewer } = make('text-simple')
      const root = createHighlightMenu(viewer)
      viewer.element.prepend(root)
      const { chevron } = parts(root)
      const { doc, engine } = await ready(viewer)
      expect(engine.tools.active.get()).toBe('select-text')
      chevron.click()
      const colour = panel()!.querySelector<HTMLButtonElement>(
        '[data-ink-color-menu="border"]'
      )!
      expect(colour.getAttribute('aria-label')).toBe('Highlight colour')
      expect(colour.disabled).toBe(false)
      colour.click()
      const swatches = document.querySelector<HTMLElement>(
        '[data-ink-menu="color-border"][role="menu"]'
      )!
      // The nested menu keeps the highlight menu open.
      expect(panel()).not.toBeNull()
      swatches.querySelector<HTMLButtonElement>('.ink-swatch-item')!.click()
      const picked = engine.toolStyle.get('markup').border
      expect(picked).toMatch(/^#[0-9A-F]{6}$/)
      const p = (x: number, y: number) => ({ x, y })
      const hl = doc.annotations.add(
        engine.toolStyle.resolve('markup', {
          type: 'highlight' as const,
          page: 0,
          quads: [{ p1: p(72, 712), p2: p(200, 712), p3: p(72, 700), p4: p(200, 700) }],
        })
      )
      expect(hl.color).toBe(picked)
      doc.annotations.select([hl.id])
      engine.toolStyle.scoped('markup').set({ border: '#112233' })
      expect(doc.annotations.get(hl.id)?.color).toBe('#112233')
      await userEvent.keyboard('{Escape}')
      expect(panel()).not.toBeNull()
    })

    it('keyboard: ArrowDown opens on the first kind and moves on to the colour', async () => {
      const { viewer } = make('text-simple')
      const root = createHighlightMenu(viewer)
      viewer.element.prepend(root)
      const { chevron } = parts(root)
      await ready(viewer)
      chevron.focus()
      key(chevron, 'ArrowDown')
      expect(document.activeElement).toBe(item('Highlight'))
      const press = (k: string) =>
        document.activeElement!.dispatchEvent(
          new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
        )
      press('End')
      const colour = panel()!.querySelector('[data-ink-color-menu="border"]')
      expect(document.activeElement).toBe(colour)
      // ArrowDown moves on rather than opening the nested menu.
      press('ArrowDown')
      expect(document.activeElement).toBe(item('Highlight'))
      expect(document.querySelector('[data-ink-menu="color-border"]')).toBeNull()
      press('Escape')
      expect(panel()).toBeNull()
      expect(document.activeElement).toBe(chevron)
    })
  })

  describe('shape menu', () => {
    const panel = (): HTMLElement | null =>
      document.querySelector<HTMLElement>('[data-ink-menu="shape"][role="menu"]')
    const item = (name: string): HTMLButtonElement =>
      [...panel()!.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].find(
        (b) => b.textContent?.trim() === name
      )!
    const parts = (root: HTMLElement) => ({
      main: root.querySelector<HTMLButtonElement>('[data-ink-shape-button]')!,
      chevron: root.querySelector<HTMLButtonElement>('[data-ink-shape-menu-trigger]')!,
    })

    it('the main button activates the shape tool with the current kind', async () => {
      const { viewer } = make('text-simple')
      const root = createShapeMenu(viewer)
      viewer.element.prepend(root)
      const { main, chevron } = parts(root)
      expect(main.disabled).toBe(true)
      expect(chevron.disabled).toBe(true)
      const { engine } = await ready(viewer)
      expect(main.disabled).toBe(false)
      expect(main.getAttribute('aria-pressed')).toBe('false')
      main.click()
      expect(engine.tools.active.get()).toBe('shape')
      expect(main.getAttribute('aria-pressed')).toBe('true')
      expect(main.dataset.state).toBe('on')
      expect(engine.tools.options('shape').get()).toMatchObject({ kind: 'rectangle' })
    })

    it('the panel lines up under the whole split button, not the chevron', async () => {
      const { viewer } = make('text-simple')
      const root = createShapeMenu(viewer)
      root.style.marginLeft = '120px'
      viewer.element.prepend(root)
      const { chevron } = parts(root)
      await ready(viewer)
      chevron.click()
      const left = panel()!.getBoundingClientRect().left
      expect(left).toBeCloseTo(root.getBoundingClientRect().left, 0)
      expect(left).toBeLessThan(chevron.getBoundingClientRect().left)
    })

    it('choosing ellipse activates shape with kind ellipse', async () => {
      const { viewer } = make('text-simple')
      const root = createShapeMenu(viewer)
      viewer.element.prepend(root)
      const { chevron } = parts(root)
      const { engine } = await ready(viewer)
      chevron.click()
      expect(panel()!.getAttribute('aria-label')).toBe('Shapes')
      expect(item('Rectangle').getAttribute('aria-checked')).toBe('true')
      expect(item('Speech bubble')).toBeDefined()
      expect(item('Loupe')).toBeDefined()
      expect(item('Mask')).toBeDefined()
      expect(item('Oval mask')).toBeDefined()
      item('Ellipse').click()
      expect(engine.tools.active.get()).toBe('shape')
      expect(engine.tools.options('shape').get()).toMatchObject({ kind: 'ellipse' })
      expect(panel()).toBeNull()
      expect(document.activeElement).toBe(chevron)
      chevron.click()
      expect(item('Ellipse').getAttribute('aria-checked')).toBe('true')
      item('Speech bubble').click()
      expect(engine.tools.options('shape').get()).toMatchObject({ kind: 'bubble' })
      chevron.click()
      item('Loupe').click()
      expect(engine.tools.options('shape').get()).toMatchObject({ kind: 'loupe' })
      chevron.click()
      item('Mask').click()
      expect(engine.tools.options('shape').get()).toMatchObject({ kind: 'mask' })
      chevron.click()
      item('Oval mask').click()
      expect(engine.tools.options('shape').get()).toMatchObject({ kind: 'ovalMask' })
    })

    it('the trigger icon follows the current kind', async () => {
      const { viewer } = make('text-simple')
      const root = createShapeMenu(viewer)
      viewer.element.prepend(root)
      const { main } = parts(root)
      const { engine } = await ready(viewer)
      const rectangle = main.innerHTML
      expect(main.getAttribute('aria-label')).toBe('Shape: Rectangle')
      engine.tools.setOptions('shape', { kind: 'star' })
      expect(main.dataset.kind).toBe('star')
      expect(main.getAttribute('aria-label')).toBe('Shape: Star')
      expect(main.innerHTML).not.toBe(rectangle)
      // Changing the kind alone does not switch tools.
      expect(engine.tools.active.get()).not.toBe('shape')
    })

    it('keyboard: ArrowDown opens on the first kind, arrows move through the grid, Escape returns focus', async () => {
      const { viewer } = make('text-simple')
      const root = createShapeMenu(viewer)
      viewer.element.prepend(root)
      const { chevron } = parts(root)
      const { engine } = await ready(viewer)
      chevron.focus()
      chevron.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          bubbles: true,
          cancelable: true,
        })
      )
      const press = (key: string) =>
        document.activeElement!.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
        )
      expect(document.activeElement).toBe(item('Line'))
      press('ArrowRight')
      expect(document.activeElement).toBe(item('Arrow'))
      press('ArrowDown')
      expect(document.activeElement).toBe(item('Rounded rectangle'))
      press('ArrowLeft')
      expect(document.activeElement).toBe(item('Rectangle'))
      press('ArrowUp')
      expect(document.activeElement).toBe(item('Line'))
      press('Escape')
      expect(panel()).toBeNull()
      expect(document.activeElement).toBe(chevron)
      expect(engine.tools.active.get()).not.toBe('shape')
    })
  })

  describe('signature menu', () => {
    const panel = (): HTMLElement | null =>
      document.querySelector<HTMLElement>('[data-ink-menu="signature"][role="menu"]')
    const dialog = (): HTMLElement | null =>
      document.querySelector<HTMLElement>('[data-ink-signature-dialog]')
    const parts = (root: HTMLElement) => ({
      main: root.querySelector<HTMLButtonElement>('[data-ink-signature-button]')!,
      chevron: root.querySelector<HTMLButtonElement>(
        '[data-ink-signature-menu-trigger]'
      )!,
    })
    const INK: SignatureTemplate = {
      id: 'sig-a',
      kind: 'ink',
      inklist: [
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      ],
      aspect: 3,
    }
    const IMAGE: SignatureTemplate = {
      id: 'sig-b',
      kind: 'image',
      imagedata:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAABCAYAAAAb4BS0AAAADklEQVR4nGP4z8DwH4YBJuYF+2EsXwgAAAAASUVORK5CYII=',
      aspect: 3,
    }
    function scribble(pad: Element): void {
      const r = pad.getBoundingClientRect()
      const at = (type: string, x: number, y: number) =>
        pad.dispatchEvent(
          new PointerEvent(type, {
            clientX: r.left + x,
            clientY: r.top + y,
            bubbles: true,
            pointerId: 3,
            buttons: type === 'pointerup' ? 0 : 1,
            isPrimary: true,
          })
        )
      at('pointerdown', 10, 40)
      at('pointermove', 60, 10)
      at('pointermove', 120, 50)
      at('pointerup', 120, 50)
    }
    async function mounted(templates: SignatureTemplate[] = []) {
      const store = createMemorySignatureStore(templates)
      const { viewer } = make('text-simple', { signatures: store })
      const root = createSignatureMenu(viewer)
      viewer.element.prepend(root)
      const { engine } = await ready(viewer)
      await until(() => engine.signatures.templates.get().length === templates.length)
      return { viewer, engine, store, ...parts(root) }
    }

    it('create a drawn signature, it appears in the menu and is selected', async () => {
      const { engine, store, main, chevron } = await mounted()
      expect(main.getAttribute('aria-label')).toBe('Sign')
      chevron.click()
      expect(panel()!.getAttribute('aria-label')).toBe('Signatures')
      expect(panel()!.querySelectorAll('[role="menuitemradio"]')).toHaveLength(0)
      const create = panel()!.querySelector<HTMLButtonElement>(
        '[data-ink-signature-create]'
      )!
      expect(create.textContent?.trim()).toBe('Create signature')
      create.click()
      expect(panel()).toBeNull()
      const d = dialog()!
      expect(d.getAttribute('role')).toBe('dialog')
      expect(d.getAttribute('aria-modal')).toBe('true')
      expect(document.activeElement?.getAttribute('role')).toBe('tab')
      expect(document.activeElement?.textContent).toBe('Draw')
      const save = d.querySelector<HTMLButtonElement>('[data-ink-signature-save]')!
      expect(save.disabled).toBe(true)
      scribble(d.querySelector('[data-ink-signature-pad]')!)
      expect(save.disabled).toBe(false)
      save.click()
      await until(() => dialog() === null)
      const [saved] = await store.list()
      expect(saved).toMatchObject({ kind: 'ink' })
      expect(engine.tools.active.get()).toBe('signature')
      expect(engine.tools.options('signature').get()).toEqual({ templateId: saved!.id })
      expect(document.activeElement).toBe(main)
      expect(main.getAttribute('aria-pressed')).toBe('true')
      chevron.click()
      const items = panel()!.querySelectorAll<HTMLElement>('[role="menuitemradio"]')
      expect(items).toHaveLength(1)
      expect(items[0]!.getAttribute('aria-label')).toBe('Signature 1')
      expect(items[0]!.getAttribute('aria-checked')).toBe('true')
      expect(items[0]!.querySelector('svg path')).not.toBeNull()
    })

    it('choosing a saved signature selects it; the main button then activates it', async () => {
      const { engine, main, chevron } = await mounted([INK, IMAGE])
      // Nothing chosen yet: the main button opens the menu.
      main.click()
      expect(panel()).not.toBeNull()
      const items = panel()!.querySelectorAll<HTMLElement>('[role="menuitemradio"]')
      expect([...items].map((i) => i.getAttribute('aria-label'))).toEqual([
        'Signature 1',
        'Signature 2',
      ])
      expect(items[1]!.querySelector('img')!.getAttribute('src')).toBe(
        IMAGE.kind === 'image' ? IMAGE.imagedata : ''
      )
      items[1]!.click()
      expect(engine.tools.active.get()).toBe('signature')
      expect(engine.tools.options('signature').get()).toEqual({ templateId: 'sig-b' })
      expect(document.activeElement).toBe(chevron)
      engine.tools.set('select')
      main.click()
      expect(panel()).toBeNull()
      expect(engine.tools.active.get()).toBe('signature')
    })

    it('remove deletes from the store', async () => {
      const { engine, store, chevron } = await mounted([INK, IMAGE])
      chevron.click()
      const remove = panel()!.querySelector<HTMLButtonElement>(
        '[data-ink-signature-remove][data-key="sig-a"]'
      )!
      expect(remove.getAttribute('aria-label')).toBe('Remove signature 1')
      remove.focus()
      remove.click()
      await until(() => engine.signatures.templates.get().length === 1)
      expect(await store.list()).toEqual([IMAGE])
      const items = panel()!.querySelectorAll<HTMLElement>('[role="menuitemradio"]')
      expect(items).toHaveLength(1)
      expect(items[0]!.dataset.key).toBe('sig-b')
      await until(() => document.activeElement === items[0])
    })

    it('a save the store refuses shows an error and keeps the dialog open', async () => {
      const store = createMemorySignatureStore()
      store.save = () => Promise.reject(new Error('full'))
      const { viewer } = make('text-simple', { signatures: store })
      const root = createSignatureMenu(viewer)
      viewer.element.prepend(root)
      await ready(viewer)
      parts(root).chevron.click()
      panel()!.querySelector<HTMLButtonElement>('[data-ink-signature-create]')!.click()
      const d = dialog()!
      const error = d.querySelector<HTMLElement>('[data-ink-signature-save-error]')!
      expect(error.hidden).toBe(true)
      scribble(d.querySelector('[data-ink-signature-pad]')!)
      d.querySelector<HTMLButtonElement>('[data-ink-signature-save]')!.click()
      await until(() => !error.hidden)
      expect(error.getAttribute('role')).toBe('alert')
      expect(error.textContent).toMatch(/could not be saved/)
      expect(dialog()).not.toBeNull()
      expect(await store.list()).toEqual([])
    })

    it('a removal the store refuses shows an error in the menu', async () => {
      const store = createMemorySignatureStore([INK, IMAGE])
      store.remove = () => Promise.reject(new Error('full'))
      const { viewer } = make('text-simple', { signatures: store })
      const root = createSignatureMenu(viewer)
      viewer.element.prepend(root)
      const { engine } = await ready(viewer)
      await until(() => engine.signatures.templates.get().length === 2)
      parts(root).chevron.click()
      panel()!
        .querySelector<HTMLButtonElement>(
          '[data-ink-signature-remove][data-key="sig-a"]'
        )!
        .click()
      await until(
        () => panel()?.querySelector('[data-ink-signature-remove-error]') != null
      )
      const error = panel()!.querySelector<HTMLElement>(
        '[data-ink-signature-remove-error]'
      )!
      expect(error.getAttribute('role')).toBe('alert')
      expect(error.textContent).toMatch(/could not be removed/)
      expect(panel()!.querySelectorAll('[role="menuitemradio"]')).toHaveLength(2)
      expect(await store.list()).toEqual([INK, IMAGE])
    })

    it('dialog traps focus and Escape closes', async () => {
      const { main, chevron } = await mounted()
      chevron.click()
      panel()!.querySelector<HTMLButtonElement>('[data-ink-signature-create]')!.click()
      const d = dialog()!
      const draw = d.querySelector<HTMLElement>('[role="tab"][data-key="draw"]')!
      expect(document.activeElement).toBe(draw)
      // Arrow keys move between the tabs and open them.
      await userEvent.keyboard('{ArrowRight}')
      const type = d.querySelector<HTMLElement>('[role="tab"][data-key="type"]')!
      expect(document.activeElement).toBe(type)
      expect(type.getAttribute('aria-selected')).toBe('true')
      expect(
        d.querySelector<HTMLElement>('[role="tabpanel"][data-key="type"]')!.hidden
      ).toBe(false)
      // Save is disabled with no name, so Cancel is the last stop: Tab wraps both ways.
      const cancel = d.querySelector<HTMLElement>('[data-ink-signature-cancel]')!
      await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
      expect(document.activeElement).toBe(cancel)
      await userEvent.keyboard('{Tab}')
      expect(document.activeElement).toBe(type)
      await userEvent.keyboard('{Escape}')
      expect(dialog()).toBeNull()
      expect(document.activeElement).toBe(main)
    })

    it('the Type tab saves the name in the chosen font as an image template', async () => {
      const store = createMemorySignatureStore()
      const { viewer } = make('text-simple', {
        signatures: store,
        signatureFonts: ['serif', 'cursive'],
      })
      const root = createSignatureMenu(viewer)
      viewer.element.prepend(root)
      const { engine } = await ready(viewer)
      parts(root).chevron.click()
      panel()!.querySelector<HTMLButtonElement>('[data-ink-signature-create]')!.click()
      const d = dialog()!
      d.querySelector<HTMLElement>('[role="tab"][data-key="type"]')!.click()
      const fonts = d.querySelectorAll<HTMLElement>('[role="radio"]')
      expect([...fonts].map((f) => f.getAttribute('aria-label'))).toEqual([
        'serif',
        'cursive',
      ])
      expect(fonts[0]!.getAttribute('aria-checked')).toBe('true')
      const name = d.querySelector<HTMLInputElement>('[data-ink-signature-name]')!
      name.focus()
      await userEvent.keyboard('Ada Lovelace')
      expect(fonts[1]!.textContent).toBe('Ada Lovelace')
      fonts[1]!.click()
      expect(fonts[1]!.getAttribute('aria-checked')).toBe('true')
      d.querySelector<HTMLButtonElement>('[data-ink-signature-save]')!.click()
      await until(() => dialog() === null)
      const [saved] = await store.list()
      expect(saved).toMatchObject({ kind: 'image' })
      expect(saved!.aspect).toBeGreaterThan(1)
      expect(engine.tools.options('signature').get()).toEqual({ templateId: saved!.id })
    })
  })

  describe('thread popover', () => {
    it('opens with its thread, hands over to another annotation, and Escape returns focus', async () => {
      const { viewer } = make('annotated-notes-threaded')
      const { doc } = await ready(viewer)
      const anchor = await rootNote(viewer, doc)
      activate(anchor)
      const popover = threadPopover()!
      expect(isOpen(popover)).toBe(true)
      expect(popover.matches('[role="dialog"][aria-label="Note thread"]')).toBe(true)
      expect(popover.querySelectorAll('[data-ink-thread-item]')).toHaveLength(3)
      expect(popover.querySelector('[data-ink-thread-item]')!.textContent).toContain(
        'Root note'
      )
      expect(popover.querySelectorAll('[data-reply]')).toHaveLength(2)
      expect(popover.querySelector('time')?.getAttribute('datetime')).toBeTruthy()
      // Embedded notes are locked: no Delete.
      expect([...popover.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
        'Reply',
        'Close',
      ])
      expect(focused()).toBe(popover.querySelector('textarea[aria-label="Reply"]'))

      // A press on another annotation does not close: its activation takes over.
      const standalone = doc.annotations.list
        .get()
        .find((a) => a.type === 'text' && !a.inReplyTo && a.contents !== 'Root note')!
      const other = annotationEl(viewer, standalone.id)!
      pointer(other, 'pointerdown', 0, 0)
      expect(isOpen(popover)).toBe(true)
      activate(other)
      expect(isOpen(popover)).toBe(true)
      expect(popover.querySelectorAll('[data-ink-thread-item]')).toHaveLength(1)

      activate(anchor)
      expect(popover.querySelectorAll('[data-ink-thread-item]')).toHaveLength(3)
      popover.querySelector('textarea')!.focus()
      await userEvent.keyboard('{Escape}')
      expect(isOpen(popover)).toBe(false)
      await until(() => focused() === anchor)

      // A press outside closes.
      activate(anchor)
      expect(isOpen(popover)).toBe(true)
      pointer(document.body, 'pointerdown', 0, 0)
      expect(isOpen(popover)).toBe(false)
    })

    it('writes a new note, keeps the draft through list changes, and removes an abandoned one', async () => {
      const { viewer } = make('text-simple')
      const { doc, engine } = await ready(viewer)
      engine.tools.set('note')
      const scroll = viewer.element.querySelector<HTMLElement>('.ink-scroll')!
      scroll.focus()
      key(scroll, 'Enter')
      const [note] = doc.annotations.list.get()
      expect(note?.type).toBe('text')
      const popover = threadPopover()!
      expect(isOpen(popover)).toBe(true)
      const textarea = popover.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Comment"]'
      )!
      expect(textarea).not.toBeNull()
      expect(popover.querySelector('[data-ink-thread]')).toBeNull()
      const submit = popover.querySelector<HTMLButtonElement>('button[type="submit"]')!
      expect(submit.textContent).toBe('Comment')
      expect(submit.disabled).toBe(true)
      await userEvent.type(textarea, 'draft')
      expect(submit.disabled).toBe(false)

      doc.annotations.add({
        type: 'redact',
        page: 1,
        rect: { x: 72, y: 600, width: 50, height: 20 },
      })
      expect(popover.querySelector('textarea')).toBe(textarea)
      expect(textarea.value).toBe('draft')

      // Close with the draft unsent: the note never got text, so it goes.
      popover
        .querySelectorAll('button')
        .forEach((b) => b.textContent === 'Close' && b.click())
      expect(isOpen(popover)).toBe(false)
      expect(doc.annotations.get(note!.id)).toBeUndefined()
      await until(() => focused() === scroll)
    })

    it('a written comment turns the form into a reply', async () => {
      const { viewer } = make('text-simple')
      const { doc, engine } = await ready(viewer)
      engine.tools.set('note')
      const scroll = viewer.element.querySelector<HTMLElement>('.ink-scroll')!
      scroll.focus()
      key(scroll, 'Enter')
      const [note] = doc.annotations.list.get()
      const popover = threadPopover()!
      const textarea = popover.querySelector<HTMLTextAreaElement>('textarea')!
      await userEvent.type(textarea, 'First')
      popover.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
      expect(doc.annotations.get(note!.id)?.contents).toBe('First')
      expect(textarea.value).toBe('')
      expect(textarea.getAttribute('aria-label')).toBe('Reply')
      expect(popover.querySelectorAll('[data-ink-thread-item]')).toHaveLength(1)
      await userEvent.type(textarea, 'Second')
      popover.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
      expect(popover.querySelectorAll('[data-ink-thread-item]')).toHaveLength(2)
      expect(doc.annotations.list.get().at(-1)).toMatchObject({
        contents: 'Second',
        inReplyTo: note!.id,
      })
    })
  })

  describe('thread popover on text markup', () => {
    async function highlighted(viewer: Viewer, doc: InkDocument) {
      const p = (x: number, y: number) => ({ x, y })
      const hl = doc.annotations.add({
        type: 'highlight',
        page: 0,
        quads: [{ p1: p(72, 712), p2: p(200, 712), p3: p(72, 700), p4: p(200, 700) }],
      })
      await until(() => annotationEl(viewer, hl.id) !== null)
      return { hl, el: annotationEl(viewer, hl.id)! }
    }

    it('activating a highlight opens the thread popover rooted at it', async () => {
      const { viewer } = make('text-simple')
      const { doc } = await ready(viewer)
      const { el } = await highlighted(viewer, doc)
      activate(el)
      const popover = threadPopover()!
      expect(isOpen(popover)).toBe(true)
      expect(popover.getAttribute('aria-label')).toBe('Comment thread')
      expect(focused()).toBe(popover.querySelector('textarea[aria-label="Comment"]'))
      expect(popover.querySelector('[data-ink-thread]')).toBeNull()
      // Delete removes the highlight itself, and says so.
      const labels = [...popover.querySelectorAll('button')].map((b) => b.textContent)
      expect(labels).toContain('Delete highlight')
      expect(labels).not.toContain('Delete')
    })

    it('first comment sets the highlight contents; next adds a reply', async () => {
      const { viewer } = make('text-simple')
      const { doc } = await ready(viewer)
      const { hl, el } = await highlighted(viewer, doc)
      activate(el)
      const popover = threadPopover()!
      const textarea = popover.querySelector<HTMLTextAreaElement>('textarea')!
      const send = popover.querySelector<HTMLButtonElement>('button[type="submit"]')!
      await userEvent.type(textarea, 'Why?')
      send.click()
      expect(doc.annotations.get(hl.id)?.contents).toBe('Why?')
      expect(textarea.getAttribute('aria-label')).toBe('Reply')
      await userEvent.type(textarea, 'Because')
      send.click()
      expect(popover.querySelectorAll('[data-ink-thread-item]')).toHaveLength(2)
      expect(doc.annotations.list.get().at(-1)).toMatchObject({
        type: 'text',
        contents: 'Because',
        inReplyTo: hl.id,
      })
      await until(() => el.querySelector('.ink-comment-marker') !== null)
    })

    it('closing an empty highlight thread keeps the highlight', async () => {
      const { viewer } = make('text-simple')
      const { doc } = await ready(viewer)
      const { hl, el } = await highlighted(viewer, doc)
      activate(el)
      const popover = threadPopover()!
      popover
        .querySelectorAll('button')
        .forEach((b) => b.textContent === 'Close' && b.click())
      expect(isOpen(popover)).toBe(false)
      expect(doc.annotations.get(hl.id)).toBeDefined()
      await until(() => focused() === el)
    })
  })

  describe('suggestion card', () => {
    it('accepts into a user redaction, and dismiss moves focus to the next suggestion', async () => {
      const { viewer } = make('text-simple')
      const { doc } = await ready(viewer)
      const a = suggest(doc, 670)
      const b = suggest(doc, 640, 'possible email')
      const c = suggest(doc, 610, 'phone number')
      await until(() => annotationEl(viewer, c.id) !== null)

      activate(annotationEl(viewer, a.id)!)
      const panel = card()!
      expect(isOpen(panel)).toBe(true)
      expect(panel.matches('[role="dialog"][aria-label="Suggested redaction"]')).toBe(
        true
      )
      expect(panel.textContent).toContain('third-party name')
      expect(
        panel.querySelector('[data-confidence]')?.getAttribute('data-confidence')
      ).toBe('high')
      const accept = [...panel.querySelectorAll('button')].find(
        (x) => x.textContent === 'Accept'
      )!
      expect(focused()).toBe(accept)
      accept.click()
      expect(doc.annotations.get(a.id)).toMatchObject({ origin: 'user' })
      expect(isOpen(panel)).toBe(false)

      activate(annotationEl(viewer, b.id)!)
      expect(isOpen(panel)).toBe(true)
      ;[...panel.querySelectorAll('button')]
        .find((x) => x.textContent === 'Dismiss')!
        .click()
      expect(doc.annotations.get(b.id)).toBeUndefined()
      expect(isOpen(panel)).toBe(false)
      await until(() => focused() === annotationEl(viewer, c.id))
    })

    it('opens for a single suggestion selected by marquee', async () => {
      const { viewer } = make('text-simple')
      const { doc, engine } = await ready(viewer)
      suggest(doc, 670)
      const c = suggest(doc, 610)
      await until(() => annotationEl(viewer, c.id) !== null)
      engine.tools.set('select')
      const r = annotationEl(viewer, c.id)!.getBoundingClientRect()
      const scroll = viewer.element.querySelector<HTMLElement>('.ink-scroll')!
      const start = document.elementFromPoint(r.left - 4, r.top - 4)!
      pointer(start, 'pointerdown', r.left - 4, r.top - 4)
      pointer(scroll, 'pointermove', r.right + 4, r.bottom + 4)
      pointer(scroll, 'pointerup', r.right + 4, r.bottom + 4)
      expect(doc.annotations.selection.get()).toEqual([c.id])
      const panel = card()!
      expect(isOpen(panel)).toBe(true)
      expect(panel.textContent).toContain('third-party name')
    })

    it('closes when undo removes its suggestion', async () => {
      const { viewer } = make('text-simple')
      const { doc } = await ready(viewer)
      const s = suggest(doc, 670)
      await until(() => annotationEl(viewer, s.id) !== null)
      activate(annotationEl(viewer, s.id)!)
      expect(isOpen(card())).toBe(true)
      doc.history.undo()
      expect(doc.annotations.get(s.id)).toBeUndefined()
      expect(isOpen(card())).toBe(false)
    })
  })

  it('loops Tab inside an open popover', async () => {
    const { viewer } = make('annotated-notes-threaded')
    const { doc } = await ready(viewer)
    activate(await rootNote(viewer, doc))
    const popover = threadPopover()!
    const textarea = popover.querySelector('textarea')!
    await userEvent.type(textarea, 'x')
    const close = [...popover.querySelectorAll('button')].at(-1)!
    expect(close.textContent).toBe('Close')
    close.focus()
    await userEvent.tab()
    expect(focused()).toBe(textarea)
    await userEvent.tab({ shift: true })
    expect(focused()).toBe(close)
    expect(popover.hasAttribute('aria-modal')).toBe(false)
  })

  it('destroys a document that arrives after destroy, and mounts nothing', async () => {
    const onReady = vi.fn()
    const onError = vi.fn()
    const { host, viewer } = make('text-simple', { onReady, onError })
    viewer.destroy()
    // A second viewer loading the same file marks when the first load has had time to land.
    const other = make('text-simple')
    await ready(other.viewer)
    await settle(200)
    other.viewer.destroy()
    expect(host.childNodes).toHaveLength(0)
    expect(document.querySelector('.ink-page')).toBeNull()
    expect(viewer.document.get()).toBeNull()
    expect(viewer.engine.get()).toBeNull()
    expect(onReady).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('a popover follows its annotation when its page unmounts and mounts again', async () => {
    const { viewer } = make('text-simple', { buffer: 0 })
    const { doc } = await ready(viewer)
    const note = doc.annotations.add({
      type: 'text',
      page: 0,
      rect: { x: 100, y: 700, width: 20, height: 20 },
      contents: 'Keep me',
    })
    await until(() => annotationEl(viewer, note.id) !== null)
    activate(annotationEl(viewer, note.id)!)
    const popover = threadPopover()!
    expect(isOpen(popover)).toBe(true)
    const placed = (): boolean => {
      const r = popover.getBoundingClientRect()
      return !(r.left === 0 && r.top === 0)
    }
    expect(placed()).toBe(true)

    const scroll = viewer.element.querySelector<HTMLElement>('.ink-scroll')!
    scroll.scrollTop = scroll.scrollHeight
    await until(() => viewer.element.querySelector('.ink-page[data-page="0"]') === null)
    await settle()
    // Its anchor is gone: the panel hides rather than sit clamped somewhere unrelated.
    expect(isOpen(popover)).toBe(false)

    scroll.scrollTop = 0
    await until(() => annotationEl(viewer, note.id) !== null)
    await until(() => isOpen(popover))
    expect(placed()).toBe(true)
    const anchor = annotationEl(viewer, note.id)!.getBoundingClientRect()
    const r = popover.getBoundingClientRect()
    const below = Math.abs(r.top - (anchor.bottom + 6)) < 1
    const above = Math.abs(r.bottom - (anchor.top - 6)) < 1
    expect(below || above).toBe(true)
  })

  it('closes on Escape from inside the panel or the viewer, not from elsewhere on the page', async () => {
    const { viewer } = make('text-simple')
    const { doc } = await ready(viewer)
    const note = doc.annotations.add({
      type: 'text',
      page: 0,
      rect: { x: 100, y: 700, width: 20, height: 20 },
      contents: 'Keep me',
    })
    await until(() => annotationEl(viewer, note.id) !== null)
    activate(annotationEl(viewer, note.id)!)
    const popover = threadPopover()!
    expect(isOpen(popover)).toBe(true)

    // A host dialog elsewhere on the page owns this Escape.
    const dialog = document.createElement('button')
    document.body.append(dialog)
    cleanup.push(() => dialog.remove())
    key(dialog, 'Escape')
    await settle()
    expect(isOpen(popover)).toBe(true)

    key(popover.querySelector('textarea')!, 'Escape')
    await until(() => !isOpen(popover))
  })

  it('keeps the keyboard in the viewer while the anchor is gone and restores the draft focus', async () => {
    const { viewer } = make('text-simple', { buffer: 0 })
    const { doc } = await ready(viewer)
    const note = doc.annotations.add({
      type: 'text',
      page: 0,
      rect: { x: 100, y: 700, width: 20, height: 20 },
      contents: 'Keep me',
    })
    await until(() => annotationEl(viewer, note.id) !== null)
    activate(annotationEl(viewer, note.id)!)
    const popover = threadPopover()!
    const textarea = popover.querySelector('textarea')!
    textarea.focus()
    await userEvent.keyboard('draft text')
    expect(textarea.value).toBe('draft text')

    const scroll = viewer.element.querySelector<HTMLElement>('[data-ink-scroll]')!
    scroll.scrollTop = scroll.scrollHeight
    await until(() => viewer.element.querySelector('.ink-page[data-page="0"]') === null)
    await until(() => !isOpen(popover))
    expect(focused()).toBe(scroll)

    scroll.scrollTop = 0
    await until(() => isOpen(popover))
    await until(() => focused() === textarea)
    expect(textarea.value).toBe('draft text')
  })

  it('closes on Escape pressed on the scroll element', async () => {
    const { viewer } = make('text-simple')
    const { doc } = await ready(viewer)
    const note = doc.annotations.add({
      type: 'text',
      page: 0,
      rect: { x: 100, y: 700, width: 20, height: 20 },
      contents: 'Keep me',
    })
    await until(() => annotationEl(viewer, note.id) !== null)
    activate(annotationEl(viewer, note.id)!)
    const popover = threadPopover()!
    expect(isOpen(popover)).toBe(true)
    key(viewer.element.querySelector('[data-ink-scroll]')!, 'Escape')
    await until(() => !isOpen(popover))
  })

  it('leaves focus on a host element clicked while the panel is hidden', async () => {
    const { viewer } = make('text-simple', { buffer: 0 })
    const { doc } = await ready(viewer)
    const note = doc.annotations.add({
      type: 'text',
      page: 0,
      rect: { x: 100, y: 700, width: 20, height: 20 },
      contents: 'Keep me',
    })
    await until(() => annotationEl(viewer, note.id) !== null)
    activate(annotationEl(viewer, note.id)!)
    const popover = threadPopover()!
    popover.querySelector('textarea')!.focus()

    const scroll = viewer.element.querySelector<HTMLElement>('[data-ink-scroll]')!
    scroll.scrollTop = scroll.scrollHeight
    await until(() => !isOpen(popover))
    expect(focused()).toBe(scroll)

    const host = document.createElement('button')
    document.body.append(host)
    cleanup.push(() => host.remove())
    host.focus()
    scroll.scrollTop = 0
    await until(() => isOpen(popover))
    await settle(100)
    expect(focused()).toBe(host)
  })

  it('shows a page error in the page host and clears it on recovery', async () => {
    const { viewer } = make('text-simple')
    const { doc, engine } = await ready(viewer)
    await until(
      () => viewer.element.querySelector('.ink-page[data-page="0"] canvas') !== null
    )
    let failing = true
    const handles = doc._pdfjs
    const original = handles.getPage.bind(handles)
    handles.getPage = async (index) => {
      if (failing && index === 0) throw new Error('The page could not be drawn')
      return original(index)
    }
    engine.viewport.setZoom(0.5)
    await until(() => viewer.element.querySelector('.ink-page-error') !== null)
    const host = viewer.element.querySelector<HTMLElement>('.ink-page[data-page="0"]')!
    const shown = host.querySelector('.ink-page-error[role="alert"]')!
    expect(shown).not.toBeNull()
    expect(shown.querySelector('p')?.textContent).toBe('Page 1 could not be shown.')
    expect(shown.querySelector('code.ink-error-code')?.textContent).toBe('InvalidPdf')
    await settle(100)
    expect(viewer.element.querySelectorAll('.ink-page-error')).toHaveLength(1)

    failing = false
    engine.viewport.setZoom(0.75)
    await until(() => viewer.element.querySelector('.ink-page-error') === null)
  })

  it('tears everything down on destroy', async () => {
    const { host, viewer } = make('annotated-notes-threaded')
    const { doc } = await ready(viewer)
    activate(await rootNote(viewer, doc))
    expect(isOpen(threadPopover())).toBe(true)
    viewer.destroy()
    viewer.destroy()
    expect(host.childNodes).toHaveLength(0)
    expect(threadPopover()).toBeNull()
    expect(card()).toBeNull()
    expect(viewer.engine.get()).toBeNull()
    await expect(doc.text(0)).rejects.toMatchObject({ code: 'DocumentDestroyed' })
  })
})

/** A tools bar above the document and a page and zoom bar below it, as a host builds them. */
function bars(viewer: Viewer): { tools: HTMLElement; status: HTMLElement } {
  const tools = createToolbar()
  tools.append(
    ...(['select-text', 'select', 'highlight', 'redact-area', 'note'] as const).map((t) =>
      createToolButton(viewer, t)
    )
  )
  const status = createToolbar({ label: 'Page and zoom' })
  status.append(
    createPrevPage(viewer),
    createPageInput(viewer),
    createPageCount(viewer),
    createNextPage(viewer),
    createZoomOut(viewer),
    createZoomSelect(viewer),
    createZoomIn(viewer)
  )
  viewer.element.prepend(tools)
  viewer.element.append(status)
  return { tools, status }
}
