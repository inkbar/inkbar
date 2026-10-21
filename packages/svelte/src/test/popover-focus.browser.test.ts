import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useFocusReturn } from '../lib/components/popover-focus.js'

import { guardConsole } from './console-guard.js'
import { focused } from './dom.js'

import type { InkContext } from '../lib/context.js'

guardConsole()

/**
 * `useFocusReturn` on its own, with the reports Bits UI makes written out by hand. It reads
 * two things from the context: the root element, and the activated id (through the untracked
 * accessor InkRoot registers, or the context's own `activated` when there is none, as here).
 */
let root: HTMLElement
let scroll: HTMLElement
let annotations: HTMLElement[]
let outside: HTMLElement
let inner: HTMLElement

beforeEach(() => {
  root = document.createElement('div')
  root.setAttribute('data-ink-root', '')
  scroll = document.createElement('div')
  scroll.setAttribute('data-ink-scroll', '')
  scroll.tabIndex = 0
  const overlay = document.createElement('div')
  annotations = ['a', 'b', 'c'].map((id) => {
    const el = document.createElement('div')
    el.setAttribute('data-annotation', id)
    el.tabIndex = 0
    overlay.appendChild(el)
    return el
  })
  scroll.appendChild(overlay)
  root.appendChild(scroll)
  document.body.appendChild(root)
  outside = document.createElement('p')
  const popover = document.createElement('div')
  popover.setAttribute('data-popover', '')
  inner = document.createElement('button')
  popover.appendChild(inner)
  document.body.append(outside, popover)
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
})
afterEach(() => {
  root.remove()
  outside.remove()
  inner.parentElement?.remove()
})

const focusReturn = () =>
  useFocusReturn({ rootEl: root, activated: null } as unknown as InkContext)
/** A primary pointerdown whose target is `el`. */
const pressOn = (el: Element): PointerEvent => {
  const event = new PointerEvent('pointerdown', { button: 0 })
  Object.defineProperty(event, 'target', { value: el })
  return event
}
const report = () => new CustomEvent('report', { cancelable: true })
/** The planner answers a close one microtask after it is reported. */
const settled = () => new Promise<void>((resolve) => queueMicrotask(resolve))

describe('useFocusReturn', () => {
  it('a plain close returns focus to the anchor', async () => {
    const focus = focusReturn()
    const [a] = annotations
    const event = report()
    focus.onCloseAutoFocus(event, a!)
    // The library's own focus return is prevented at once; the planner's answer comes after.
    expect(event.defaultPrevented).toBe(true)
    expect(focused()).toBe(document.body)
    await settled()
    expect(focused()).toBe(a)
  })

  it('a close followed by an open in the same tick moves no focus and uses up the removal plan', async () => {
    const focus = focusReturn()
    const [a] = annotations
    focus.beforeRemove(a!)
    focus.onCloseAutoFocus(report(), a!)
    const opened = report()
    focus.onOpenAutoFocus(opened)
    // The open keeps its default: the library moves focus into the popover.
    expect(opened.defaultPrevented).toBe(false)
    await settled()
    expect(focused()).toBe(document.body)

    // The plan is gone: a later plain close goes back to its anchor, not to what follows it.
    focus.onCloseAutoFocus(report(), a!)
    await settled()
    expect(focused()).toBe(a)
  })

  it('a close reported twice in the same tick keeps the removal plan for the last one', async () => {
    const focus = focusReturn()
    const [a, b] = annotations
    focus.beforeRemove(a!)
    a!.remove()
    focus.onCloseAutoFocus(report(), a!)
    focus.onCloseAutoFocus(report(), a!)
    await settled()
    expect(focused()).toBe(b)
  })

  it("an outside pointer press that closes the popover doesn't move focus to the anchor", async () => {
    const focus = focusReturn()
    const [a] = annotations
    let closed = 0
    focus.onPressOutside(pressOn(outside), '[data-popover]', () => closed++)
    expect(closed).toBe(1)
    focus.onCloseAutoFocus(report(), a!)
    await settled()
    expect(focused()).toBe(document.body)
    focus.onPressEnd()
    // The next close, from the keyboard, returns focus as usual.
    focus.onCloseAutoFocus(report(), a!)
    await settled()
    expect(focused()).toBe(a)
  })

  it('a press inside the popover, or on an annotation, closes nothing', () => {
    const focus = focusReturn()
    let closed = 0
    focus.onPressOutside(pressOn(inner), '[data-popover]', () => closed++)
    focus.onPressOutside(pressOn(annotations[0]!), '[data-popover]', () => closed++)
    expect(closed).toBe(0)
  })

  it('an open with no close does nothing', async () => {
    const focus = focusReturn()
    const opened = report()
    focus.onOpenAutoFocus(opened)
    await settled()
    expect(opened.defaultPrevented).toBe(false)
    expect(focused()).toBe(document.body)
  })
})
