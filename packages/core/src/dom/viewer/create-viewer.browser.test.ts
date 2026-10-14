import { browserAssets, fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { mountContainer, settle, until } from '../test-utils'

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
  it('opens a document and renders the viewer, toolbar and pages', async () => {
    const onReady = vi.fn()
    const { viewer } = make('annotated-notes-threaded', { onReady })
    expect(viewer.status.get().state).toBe('loading')
    expect(viewer.element.querySelector('.ink-status')?.textContent).toBe(
      'Loading document…'
    )
    const { doc } = await ready(viewer)
    expect(viewer.element.matches('[data-ink-root][data-state="ready"]')).toBe(true)
    expect(viewer.element.querySelector('.ink-viewport-root .ink-scroll')).not.toBeNull()
    expect(viewer.element.querySelector('.ink-default-toolbar')).toBe(viewer.toolbar)
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
    it('toolbar: false leaves the toolbar out', async () => {
      const { viewer } = make('text-simple', { toolbar: false })
      await ready(viewer)
      expect(viewer.toolbar).toBeNull()
      expect(viewer.element.querySelector('.ink-default-toolbar')).toBeNull()
    })

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

  describe('toolbar', () => {
    it('is one tab stop with arrow keys, Home and End', async () => {
      const { viewer } = make('text-simple')
      await ready(viewer)
      const bar = viewer.toolbar!
      expect(bar.getAttribute('role')).toBe('toolbar')
      expect(bar.getAttribute('aria-label')).toBe('Document tools')
      expect(bar.getAttribute('aria-orientation')).toBe('horizontal')
      const controls = [...bar.querySelectorAll<HTMLElement>('button, select, input')]
      expect(controls).toHaveLength(9)
      expect(controls.filter((c) => c.tabIndex === 0)).toHaveLength(1)

      // Tab from before the viewer lands on the toolbar once, then leaves it.
      const before = document.createElement('button')
      before.textContent = 'before'
      viewer.element.before(before)
      cleanup.push(() => before.remove())
      before.focus()
      await userEvent.tab()
      expect(focused()).toBe(controls[0])
      await userEvent.tab()
      expect(bar.contains(focused())).toBe(false)

      controls[0]!.focus()
      await userEvent.keyboard('{ArrowRight}')
      expect(focused()).toBe(controls[1])
      expect(controls[1]!.tabIndex).toBe(0)
      expect(controls.filter((c) => c.tabIndex === 0)).toHaveLength(1)
      await userEvent.keyboard('{ArrowLeft}')
      await userEvent.keyboard('{ArrowLeft}')
      expect(focused()).toBe(controls[8])
      await userEvent.keyboard('{ArrowRight}')
      expect(focused()).toBe(controls[0])
      await userEvent.keyboard('{End}')
      expect(focused()).toBe(controls[8])
      await userEvent.keyboard('{Home}')
      expect(focused()).toBe(controls[0])
      // The zoom select keeps its own up and down.
      const select = bar.querySelector<HTMLSelectElement>('.ink-zoom-select')!
      select.focus()
      await userEvent.keyboard('{ArrowRight}')
      expect(focused()).toBe(bar.querySelector('[data-ink-zoom-in]'))
    })

    it('includes controls a host adds', async () => {
      const { viewer } = make('text-simple')
      await ready(viewer)
      const extra = document.createElement('button')
      extra.textContent = 'Extra'
      viewer.toolbar!.append(extra)
      await settle()
      expect(extra.tabIndex).toBe(-1)
      bar(viewer).querySelector<HTMLElement>('[data-ink-page-input]')!.focus()
      await userEvent.keyboard('{ArrowRight}')
      expect(focused()).toBe(extra)
    })

    it('drives the tools, zoom and page', async () => {
      const { viewer } = make('text-simple')
      const { engine } = await ready(viewer)
      const b = bar(viewer)
      const highlight = b.querySelector<HTMLButtonElement>('[data-tool="highlight"]')!
      expect(highlight.getAttribute('aria-label')).toBe('Highlight')
      expect(highlight.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
      highlight.click()
      expect(highlight.getAttribute('aria-pressed')).toBe('true')
      expect(highlight.dataset.state).toBe('on')
      expect(engine.tools.active.get()).toBe('highlight')
      expect(b.querySelector('[data-tool="view"]')!.getAttribute('aria-pressed')).toBe(
        'false'
      )

      const select = b.querySelector<HTMLSelectElement>('.ink-zoom-select')!
      expect(select.value).toBe('1')
      select.value = '2'
      select.dispatchEvent(new Event('change'))
      expect(engine.viewport.zoom.get()).toBe(2)
      b.querySelector<HTMLButtonElement>('[data-ink-zoom-out]')!.click()
      expect(engine.viewport.zoom.get()).toBeCloseTo(1.6)
      expect(select.value).toBe('custom')
      expect(select.selectedOptions[0]!.textContent).toBe('160%')

      expect(b.querySelector('[data-ink-page-count]')!.textContent).toBe('of 3')
      const input = b.querySelector<HTMLInputElement>('[data-ink-page-input]')!
      expect(input.value).toBe('1')
      input.value = '3'
      input.dispatchEvent(new Event('change'))
      await until(() => engine.viewport.currentPage.get() === 2)
      input.value = '9'
      input.dispatchEvent(new Event('change'))
      expect(input.value).toBe('3')
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
        .find((a) => a.type === 'note' && !a.inReplyTo && a.contents !== 'Root note')!
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
      expect(note?.type).toBe('note')
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

  it('a popover follows its annotation when its page unmounts and mounts again', async () => {
    const { viewer } = make('text-simple', { buffer: 0 })
    const { doc } = await ready(viewer)
    const note = doc.annotations.add({
      type: 'note',
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
    expect(!isOpen(popover) || placed()).toBe(true)

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

function bar(viewer: Viewer): HTMLElement {
  return viewer.toolbar!
}
