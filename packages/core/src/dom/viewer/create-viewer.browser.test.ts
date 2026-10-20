import { browserAssets, fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { mountContainer, settle, until } from '../test-utils'

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

const notePopover = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-ink-note-popover]')
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
  await until(() => viewer.element.querySelectorAll('[data-annotation]').length === 4)
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
    it('notes: false opens no note popover', async () => {
      const { viewer } = make('annotated-notes-threaded', { notes: false })
      const { doc } = await ready(viewer)
      activate(await rootNote(viewer, doc))
      await settle()
      expect(notePopover()).toBeNull()
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

  describe('note popover', () => {
    it('opens with its thread, hands over to another annotation, and Escape returns focus', async () => {
      const { viewer } = make('annotated-notes-threaded')
      const { doc } = await ready(viewer)
      const anchor = await rootNote(viewer, doc)
      activate(anchor)
      const popover = notePopover()!
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
      const popover = notePopover()!
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
      const popover = notePopover()!
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
    const popover = notePopover()!
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
    const popover = notePopover()!
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
    const popover = notePopover()!
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
    const popover = notePopover()!
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
    const popover = notePopover()!
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
    const popover = notePopover()!
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
    expect(isOpen(notePopover())).toBe(true)
    viewer.destroy()
    viewer.destroy()
    expect(host.childNodes).toHaveLength(0)
    expect(notePopover()).toBeNull()
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
