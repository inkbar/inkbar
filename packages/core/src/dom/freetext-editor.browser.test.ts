import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { staticDefaults } from '../model/annotations/defaults'
import { createAnnotationStore } from '../model/annotations/store'

import { editFreeText, editFreeTextIn, type EditorCloseReason } from './freetext-editor'
import { createOverlay } from './overlay'
import { mountContainer, until } from './test-utils'
import { FONT_STACKS } from './text-fonts'
import { createPageTransform } from './transform'

import type { FreeTextAnnotation } from '../model/annotations/types'
import type { Rect } from '../model/geometry'
import type { PageInfo } from '../model/pages'

const page: PageInfo = {
  index: 0,
  box: { x: 0, y: 0, width: 612, height: 792 },
  rotate: 0,
  userUnit: 1,
  width: 612,
  height: 792,
}

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

function setup(contents = 'Hi', rotation: 0 | 90 = 0) {
  // The text is 144 pt across and 20 pt high; on a view turned 90 degrees it shows 20 css px
  // wide and 144 high.
  const rect =
    rotation === 0
      ? { x: 100, y: 600, width: 144, height: 20 }
      : { x: 100, y: 400, width: 144, height: 20 }
  const style = document.createElement('style')
  style.textContent = themeCss
  document.head.append(style)
  const store = createAnnotationStore({
    mode: { mode: 'uncontrolled' },
    defaults: staticDefaults,
  })
  const host = mountContainer(rotation ? 792 : 612, rotation ? 612 : 792)
  const transform = createPageTransform(page, 1, rotation)
  const overlay = createOverlay({ host, page: 0, store, transform })
  cleanup.push(() => (overlay.destroy(), host.remove(), style.remove()))
  const a = store.add({
    type: 'freetext',
    page: 0,
    rect,
    contents,
  }) as FreeTextAnnotation
  const el = overlay.elementFor(a.id)!
  const commit =
    vi.fn<(contents: string, rect: Rect, grown: number, how: EditorCloseReason) => void>()
  const cancel = vi.fn()
  const editor = editFreeText(el, a, { transform, commit, cancel })
  cleanup.unshift(() => editor.close(false))
  const field = () => el.querySelector<HTMLElement>('[data-ink-editor]')
  return { store, host, overlay, a, el, transform, commit, cancel, editor, field }
}

describe('editFreeText', () => {
  it('opens a focused plain-text editor in the box font, over the box drawn without its text', () => {
    const { el, field } = setup()
    const f = field()!
    expect(f).not.toBeNull()
    expect(['plaintext-only', 'true']).toContain(f.contentEditable)
    expect(document.activeElement).toBe(f)
    expect(f.textContent).toBe('Hi')
    expect(f.classList.contains('ink-free-text')).toBe(true)
    const cs = getComputedStyle(f)
    expect(cs.fontSize).toBe('12px')
    expect(cs.fontFamily).toBe(FONT_STACKS.Helvetica)
    expect(cs.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(cs.borderTopStyle).toBe('none')
    // The box is still drawn, and its text is the editor's now.
    expect(el.querySelector('rect[data-ink-part="box"]')).not.toBeNull()
    expect(el.querySelector('text')).toBeNull()
  })

  it('typing grows the box height and commits contents and rect together on Escape', async () => {
    const { a, el, transform, commit, field } = setup('')
    const before = parseFloat(el.style.height)
    await userEvent.keyboard('one{Enter}two{Enter}three{Enter}four')
    await until(() => parseFloat(el.style.height) > before)
    const grown = parseFloat(el.style.height)
    await userEvent.keyboard('{Escape}')
    expect(commit).toHaveBeenCalledTimes(1)
    const [contents, rect] = commit.mock.calls[0]!
    expect(contents).toBe('one\ntwo\nthree\nfour')
    expect(commit.mock.calls[0]![3]).toBe('escape')
    expect(rect.height).toBeGreaterThan(a.rect.height * 2)
    // The top edge and the width stay where they were.
    expect(rect.x).toBeCloseTo(a.rect.x)
    expect(rect.width).toBeCloseTo(a.rect.width)
    expect(rect.y + rect.height).toBeCloseTo(a.rect.y + a.rect.height)
    expect(transform.toCssRect(rect).height).toBeCloseTo(grown, 0)
    expect(field()).toBeNull()
    // The box is drawn again, at its own size.
    expect(el.querySelector('rect[data-ink-part="box"]')).not.toBeNull()
    expect(parseFloat(el.style.height)).toBeCloseTo(20)
  })

  it('commits on a press outside the editor', async () => {
    const { commit, field } = setup()
    await userEvent.keyboard('{End}!')
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, isPrimary: true })
    )
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0]![0]).toBe('Hi!')
    expect(commit.mock.calls[0]![3]).toBe('press')
    expect(field()).toBeNull()
  })

  it('commits when focus leaves the editor', () => {
    const { commit, field } = setup()
    const button = document.createElement('button')
    document.body.append(button)
    cleanup.push(() => button.remove())
    button.focus()
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0]![3]).toBe('focus')
    expect(field()).toBeNull()
  })

  it('close(true) commits with the api reason', () => {
    const { commit, editor } = setup()
    editor.close(true)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0]![3]).toBe('api')
  })

  it('a press inside the editor keeps it open', () => {
    const { commit, field } = setup()
    field()!.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, isPrimary: true })
    )
    expect(commit).not.toHaveBeenCalled()
    expect(field()).not.toBeNull()
  })

  it('keys typed in the editor do not reach the page', async () => {
    const { host } = setup()
    const keys = vi.fn()
    host.addEventListener('keydown', keys)
    cleanup.push(() => host.removeEventListener('keydown', keys))
    await userEvent.keyboard('ab{Backspace}{Delete}{ArrowLeft}')
    expect(keys).not.toHaveBeenCalled()
  })

  it('close(false) cancels without committing and restores the box', () => {
    const { el, commit, cancel, editor, field } = setup()
    editor.close(false)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(commit).not.toHaveBeenCalled()
    expect(field()).toBeNull()
    // The text is drawn again.
    expect(el.querySelector('g[data-ink-part="text"] > text')!.textContent).toBe('Hi')
    // Closing twice does nothing more.
    editor.close(true)
    expect(commit).not.toHaveBeenCalled()
  })

  it('pastes as plain text', async () => {
    const { commit, field } = setup('')
    const data = new DataTransfer()
    data.setData('text/html', '<b>bold</b>')
    data.setData('text/plain', 'bold')
    field()!.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      })
    )
    await userEvent.keyboard('{Escape}')
    expect(commit.mock.calls[0]![0]).toBe('bold')
  })

  it("grows along the text's own downward direction on a view turned 90", async () => {
    const { a, el, transform, commit, field } = setup('', 90)
    const css = transform.toCssRect(a.rect)
    // The text turns with the view: the 144 pt box shows 20 px wide and 144 tall.
    expect(css.width).toBeCloseTo(20)
    expect(css.height).toBeCloseTo(144)
    await userEvent.keyboard('one{Enter}two{Enter}three')
    await until(() => parseFloat(el.style.width) > css.width)
    // The editor is turned onto the box, and the element grows sideways, not down.
    expect(field()!.style.transform).toMatch(/^rotate\(90deg\)/)
    expect(parseFloat(el.style.height)).toBeCloseTo(css.height)
    await userEvent.keyboard('{Escape}')
    const rect = commit.mock.calls[0]![1]
    // In user space the text runs along x and down is -y: the top edge and the width stay.
    expect(rect.x).toBeCloseTo(a.rect.x)
    expect(rect.width).toBeCloseTo(a.rect.width)
    expect(rect.y + rect.height).toBeCloseTo(a.rect.y + a.rect.height)
    expect(rect.height).toBeGreaterThan(a.rect.height * 2)
    // On screen the box grew to the left, its right edge fixed.
    const back = transform.toCssRect(rect)
    expect(back.left + back.width).toBeCloseTo(css.left + css.width)
    expect(back.top).toBeCloseTo(css.top)
    expect(back.height).toBeCloseTo(css.height)
    expect(back.width).toBeGreaterThan(css.width * 2)
  })

  it("on a view turned 90 the editor's box coincides with the text box", () => {
    const { el, field } = setup('Hi', 90)
    const at = field()!.getBoundingClientRect()
    const box = el.querySelector('rect[data-ink-part="box"]')!.getBoundingClientRect()
    expect(at.left).toBeCloseTo(box.left, 0)
    expect(at.top).toBeCloseTo(box.top, 0)
    expect(at.width).toBeCloseTo(box.width, 0)
    expect(at.height).toBeCloseTo(box.height, 0)
  })

  it('a redraw for a new zoom commits the open editor first', async () => {
    const { overlay, el, commit, field } = setup()
    await userEvent.keyboard('{End}!')
    // A relayout at the same zoom and rotation keeps the edit going.
    overlay.update(createPageTransform(page, 1, 0))
    expect(field()).not.toBeNull()
    expect(document.activeElement).toBe(field())
    overlay.update(createPageTransform(page, 2, 0))
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0]![0]).toBe('Hi!')
    expect(field()).toBeNull()
    // Focus goes to the box, not <body>.
    expect(document.activeElement).toBe(el)
  })

  it('closes the editor without committing when the box is removed', () => {
    const { store, a, commit, field } = setup()
    store.remove(a.id)
    expect(field()).toBeNull()
    expect(commit).not.toHaveBeenCalled()
    // Its listeners went with it: a later press commits nothing.
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, isPrimary: true })
    )
    expect(commit).not.toHaveBeenCalled()
  })

  it('opens over the text box of a box with a fringe and grows its rect by the same amount', async () => {
    const style = document.createElement('style')
    style.textContent = themeCss
    document.head.append(style)
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const host = mountContainer(612, 792)
    const transform = createPageTransform(page, 1, 0)
    const overlay = createOverlay({ host, page: 0, store, transform })
    cleanup.push(() => (overlay.destroy(), host.remove(), style.remove()))
    const a = store.add({
      type: 'freetext',
      page: 0,
      rect: { x: 60, y: 560, width: 200, height: 70 },
      fringe: { left: 40, top: 5, right: 10, bottom: 45 },
      contents: '',
    }) as FreeTextAnnotation
    const el = overlay.elementFor(a.id)!
    const commit = vi.fn<(contents: string, rect: Rect) => void>()
    const editor = editFreeText(el, a, { transform, commit, cancel: vi.fn() })
    cleanup.unshift(() => editor.close(false))
    const f = el.querySelector<HTMLElement>('[data-ink-editor]')!
    const at = f.getBoundingClientRect()
    const origin = host.getBoundingClientRect()
    // The box is x 100..250, top 625: css left 100, top 792 - 625.
    expect(at.left - origin.left).toBeCloseTo(100)
    // Within a pixel: the editor sits where the text is drawn, not where the box is.
    expect(Math.abs(at.top - origin.top - 167)).toBeLessThanOrEqual(1)
    expect(at.width).toBeCloseTo(150)
    expect(at.height).toBeCloseTo(20)
    const before = parseFloat(el.style.height)
    await userEvent.keyboard('one{Enter}two{Enter}three')
    await until(() => parseFloat(el.style.height) > before)
    // The element grows by what the text box grew.
    const grown = parseFloat(el.style.height) - before
    expect(f.getBoundingClientRect().height).toBeCloseTo(20 + grown)
    await userEvent.keyboard('{Escape}')
    const [, rect] = commit.mock.calls[0]!
    expect(rect.height).toBeCloseTo(70 + grown, 0)
    expect(rect.y + rect.height).toBeCloseTo(630)
  })

  it('caret lands at the given point', () => {
    const { store, a, el, transform, editor, field } = setup('Hello world')
    editor.close(true)
    // The left edge of the "w", in the box as drawn.
    const text = el.querySelector<SVGTextElement>('g[data-ink-part="text"] > text')!
    const ctm = text.getScreenCTM()!
    const from = text.getStartPositionOfChar(6).matrixTransform(ctm)
    const box = text.getBoundingClientRect()
    const w = { left: from.x, top: box.top, height: box.height }
    const opened = editFreeTextIn(store, el, a.id, transform, {
      caret: { clientX: w.left + 1, clientY: w.top + w.height / 2 },
    })
    cleanup.unshift(() => opened?.close(false))
    const f = field()!
    expect(document.activeElement).toBe(f)
    const selection = window.getSelection()!
    expect(selection.isCollapsed).toBe(true)
    expect(f.contains(selection.anchorNode)).toBe(true)
    expect(selection.anchorOffset).toBe(6)
  })

  it('a caret point outside the text puts the caret at the end', () => {
    const { store, a, el, transform, editor, field } = setup('Hello world')
    editor.close(true)
    const opened = editFreeTextIn(store, el, a.id, transform, {
      caret: { clientX: -100, clientY: -100 },
    })
    cleanup.unshift(() => opened?.close(false))
    const selection = window.getSelection()!
    expect(selection.isCollapsed).toBe(true)
    const range = selection.getRangeAt(0)
    const end = document.createRange()
    end.selectNodeContents(field()!)
    end.collapse(false)
    expect(range.compareBoundaryPoints(Range.START_TO_START, end)).toBe(0)
  })

  it('gives a box its fringe leaves no width to a usable editor', () => {
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const host = mountContainer(612, 792)
    const transform = createPageTransform(page, 1, 0)
    const overlay = createOverlay({ host, page: 0, store, transform })
    cleanup.push(() => (overlay.destroy(), host.remove()))
    const a = store.add({
      type: 'freetext',
      page: 0,
      rect: { x: 60, y: 560, width: 50, height: 70 },
      fringe: { left: 30, top: 5, right: 30, bottom: 45 },
      contents: '',
      defaultStyle: { fontSize: 12 },
    }) as FreeTextAnnotation
    const el = overlay.elementFor(a.id)!
    const editor = editFreeText(el, a, { transform, commit: vi.fn(), cancel: vi.fn() })
    cleanup.unshift(() => editor.close(false))
    const f = el.querySelector<HTMLElement>('[data-ink-editor]')!
    // Two ems of the 12 pt text at zoom 1.
    expect(f.style.width).toBe('24px')
  })
})

describe('editing leaves the text where it is', () => {
  const FAMILIES = ['Helvetica', 'Times', 'Courier'] as const
  const SIZES = [10, 12, 18] as const
  /** About 300 characters of ordinary prose, which wraps in a few places at each size. */
  const paragraph =
    'The quick brown fox jumps over the lazy dog while a second sentence follows it, and a third one trails along behind to fill the box. Pack my box with five dozen liquor jugs, then wait for the lazy morning to turn into a quiet afternoon by the river bank.'

  function open(family: string, size: number, rotation: 0 | 90 = 0) {
    const style = document.createElement('style')
    style.textContent = themeCss
    document.head.append(style)
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const host = mountContainer(792, 792)
    const transform = createPageTransform(page, 1, rotation)
    const overlay = createOverlay({ host, page: 0, store, transform })
    cleanup.push(() => (overlay.destroy(), host.remove(), style.remove()))
    const a = store.add({
      type: 'freetext',
      page: 0,
      rect: { x: 100, y: 500, width: 200, height: 20 },
      contents: paragraph,
      defaultStyle: { fontFamily: family, fontSize: size },
    }) as FreeTextAnnotation
    const el = overlay.elementFor(a.id)!
    return { store, a, el, transform }
  }

  /** Screen y of the first drawn line's baseline. */
  const drawnBaseline = (el: HTMLElement): number => {
    const t = el.querySelector<SVGTextElement>('g[data-ink-part="text"] > text')!
    return t.getStartPositionOfChar(0).matrixTransform(t.getScreenCTM()!).y
  }
  /** Screen y of the editor's first baseline: the bottom of a zero-size inline-block at its start. */
  const editorBaseline = (field: HTMLElement): number => {
    const probe = document.createElement('span')
    probe.style.cssText = 'display:inline-block;width:0;height:0'
    field.prepend(probe)
    const y = probe.getBoundingClientRect().bottom
    probe.remove()
    return y
  }
  const drawnLines = (el: HTMLElement): number =>
    el.querySelectorAll('g[data-ink-part="text"] > text').length
  /** How many lines the editor's text breaks into: distinct tops of its characters. */
  const editorLines = (field: HTMLElement): number => {
    const node = field.firstChild as Text
    const tops: number[] = []
    for (let i = 0; i < node.length; i++) {
      if (/\s/.test(node.data[i]!)) continue
      const range = document.createRange()
      range.setStart(node, i)
      range.setEnd(node, i + 1)
      const top = range.getBoundingClientRect().top
      if (!tops.some((t) => Math.abs(t - top) < 2)) tops.push(top)
    }
    return tops.length
  }

  for (const family of FAMILIES) {
    for (const size of SIZES) {
      it(`${family} ${size}: the first baseline moves by at most a pixel when editing starts and ends, and the lines are the same`, () => {
        const { store, a, el, transform } = open(family, size)
        const before = drawnBaseline(el)
        const linesBefore = drawnLines(el)
        const editor = editFreeTextIn(store, el, a.id, transform)!
        cleanup.unshift(() => editor.close(false))
        const field = el.querySelector<HTMLElement>('[data-ink-editor]')!
        const inEditor = editorBaseline(field)
        const linesEditing = editorLines(field)
        editor.close(true)
        const after = drawnBaseline(el)
        const linesAfter = drawnLines(el)
        console.log(
          `[editing] ${family} ${size}: baseline on open ${(inEditor - before).toFixed(3)}, on commit ${(after - inEditor).toFixed(3)}; lines drawn ${linesBefore}, editor ${linesEditing}, drawn after commit ${linesAfter}`
        )
        expect(Math.abs(inEditor - before)).toBeLessThanOrEqual(1)
        expect(Math.abs(after - inEditor)).toBeLessThanOrEqual(1)
        expect(linesEditing).toBeGreaterThan(3)
        expect(linesAfter).toBe(linesEditing)
        expect(linesBefore).toBe(linesAfter)
      })
    }
  }

  it('on a view turned 90 the first baseline also stays within a pixel', () => {
    const { store, a, el, transform } = open('Helvetica', 12, 90)
    const baseline = (node: Element): number => {
      const t = node as SVGTextElement
      // Turned: the baseline runs down the screen, so it is a vertical line at this x.
      return t.getStartPositionOfChar(0).matrixTransform(t.getScreenCTM()!).x
    }
    const before = baseline(el.querySelector('g[data-ink-part="text"] > text')!)
    const editor = editFreeTextIn(store, el, a.id, transform)!
    cleanup.unshift(() => editor.close(false))
    const field = el.querySelector<HTMLElement>('[data-ink-editor]')!
    const probe = document.createElement('span')
    probe.style.cssText = 'display:inline-block;width:0;height:0'
    field.prepend(probe)
    // The editor is turned a quarter, so its baseline is the probe's left edge on screen.
    const inEditor = probe.getBoundingClientRect().left
    probe.remove()
    console.log(`[editing] view 90: baseline on open ${(inEditor - before).toFixed(3)}`)
    expect(Math.abs(inEditor - before)).toBeLessThanOrEqual(1)
  })
})
