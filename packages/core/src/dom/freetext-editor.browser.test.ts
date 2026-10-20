import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { staticDefaults } from '../model/annotations/defaults'
import { createAnnotationStore } from '../model/annotations/store'

import { editFreeText } from './freetext-editor'
import { createOverlay } from './overlay'
import { mountContainer, until } from './test-utils'
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
  // On a page turned 90 degrees, a 20 x 144 rect shows 144 css px wide and 20 high.
  const rect =
    rotation === 0
      ? { x: 100, y: 600, width: 144, height: 20 }
      : { x: 100, y: 400, width: 20, height: 144 }
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
  const commit = vi.fn<(contents: string, rect: Rect) => void>()
  const cancel = vi.fn()
  const editor = editFreeText(el, a, { transform, commit, cancel })
  cleanup.unshift(() => editor.close(false))
  const field = () => el.querySelector<HTMLElement>('[data-ink-editor]')
  return { store, host, overlay, a, el, transform, commit, cancel, editor, field }
}

describe('editFreeText', () => {
  it('opens a focused plain-text editor styled like the box, over the hidden box', () => {
    const { el, field } = setup()
    const f = field()!
    expect(f).not.toBeNull()
    expect(['plaintext-only', 'true']).toContain(f.contentEditable)
    expect(document.activeElement).toBe(f)
    expect(f.textContent).toBe('Hi')
    expect(f.classList.contains('ink-free-text')).toBe(true)
    expect(f.style.getPropertyValue('--ink-font-size')).toBe('12px')
    const box = el.querySelector<HTMLElement>('.ink-free-text:not([data-ink-editor])')!
    expect(getComputedStyle(box).visibility).toBe('hidden')
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
    expect(rect.height).toBeGreaterThan(a.rect.height * 2)
    // The top edge and the width stay where they were.
    expect(rect.x).toBeCloseTo(a.rect.x)
    expect(rect.width).toBeCloseTo(a.rect.width)
    expect(rect.y + rect.height).toBeCloseTo(a.rect.y + a.rect.height)
    expect(transform.toCssRect(rect).height).toBeCloseTo(grown, 0)
    expect(field()).toBeNull()
    // The box shows again.
    const box = el.querySelector<HTMLElement>('.ink-free-text')!
    expect(getComputedStyle(box).visibility).toBe('visible')
  })

  it('commits on a press outside the editor', async () => {
    const { commit, field } = setup()
    await userEvent.keyboard('{End}!')
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, isPrimary: true })
    )
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0]![0]).toBe('Hi!')
    expect(field()).toBeNull()
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
    expect(el.querySelector<HTMLElement>('.ink-free-text')!.style.visibility).toBe('')
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

  it('grows downwards on screen on a rotated page', async () => {
    const { a, el, transform, commit } = setup('', 90)
    const css = transform.toCssRect(a.rect)
    await userEvent.keyboard('one{Enter}two{Enter}three')
    await until(() => parseFloat(el.style.height) > css.height)
    await userEvent.keyboard('{Escape}')
    const back = transform.toCssRect(commit.mock.calls[0]![1])
    expect(back.left).toBeCloseTo(css.left)
    expect(back.top).toBeCloseTo(css.top)
    expect(back.width).toBeCloseTo(css.width)
    expect(css.width).toBeCloseTo(144)
    expect(back.height).toBeGreaterThan(css.height * 2)
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
})
