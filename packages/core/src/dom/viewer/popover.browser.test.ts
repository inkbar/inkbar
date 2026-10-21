import { afterEach, describe, expect, it, vi } from 'vitest'

import { createFocusReturn } from '../popover-focus'
import { settle } from '../test-utils'

import { createPopover } from './popover'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

/** A viewer root holding one page with annotation `a1`, as a host app sees it. */
function setup() {
  const root = document.createElement('div')
  root.setAttribute('data-ink-root', '')
  const scroll = document.createElement('div')
  scroll.setAttribute('data-ink-scroll', '')
  scroll.tabIndex = 0
  const page = document.createElement('div')
  const mark = document.createElement('div')
  mark.setAttribute('data-annotation', 'a1')
  mark.tabIndex = 0
  Object.assign(mark.style, { width: '40px', height: '20px' })
  page.append(mark)
  scroll.append(page)
  root.append(scroll)
  document.body.append(root)
  const onDismiss = vi.fn()
  const popover = createPopover({
    root,
    attrs: { class: 'my-card', 'aria-label': 'My card', 'data-my-card': '' },
    focusReturn: createFocusReturn({ root: () => root, activated: () => null }),
    onDismiss,
  })
  popover.panel.append(document.createElement('button'))
  cleanup.push(() => (popover.destroy(), root.remove()))
  return { root, scroll, page, mark, popover, onDismiss }
}

describe('createPopover', () => {
  it("puts the host's attributes on a themed dialog panel", () => {
    const { popover } = setup()
    const { panel } = popover
    expect(panel.parentElement).toBe(document.body)
    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.hasAttribute('data-ink-popover')).toBe(true)
    expect(panel.classList.contains('my-card')).toBe(true)
    expect(panel.getAttribute('aria-label')).toBe('My card')
    expect(panel.hasAttribute('data-my-card')).toBe(true)
    expect(panel.hidden).toBe(true)
  })

  it('shows anchored to the annotation and hides again', () => {
    const { popover, mark } = setup()
    popover.show('a1')
    expect(popover.panel.hidden).toBe(false)
    expect(popover.anchor).toBe(mark)
    expect(popover.panel.style.position).toBe('fixed')
    popover.hide()
    expect(popover.panel.hidden).toBe(true)
    expect(popover.anchor).toBeNull()
  })

  it('calls onDismiss on Escape and on a press outside, not on a press inside', () => {
    const { popover, mark, onDismiss } = setup()
    popover.show('a1')
    const button = popover.panel.querySelector('button')!
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(onDismiss).not.toHaveBeenCalled()
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(onDismiss).toHaveBeenCalledTimes(2)
    // A press on an annotation activates it instead of dismissing.
    mark.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })

  it('has no anchor while the page is unmounted, and re-anchors when it mounts again', async () => {
    const { popover, page, mark } = setup()
    popover.show('a1')
    page.remove()
    await settle()
    expect(popover.anchor).toBeNull()
    expect(popover.panel.hidden).toBe(true)
    const again = mark.cloneNode() as HTMLElement
    page.replaceChildren(again)
    document.querySelector('[data-ink-scroll]')!.append(page)
    await settle()
    expect(popover.anchor).toBe(again)
    expect(popover.panel.hidden).toBe(false)
  })
})
