import { afterEach, describe, expect, it } from 'vitest'

import { createMenuOpenFocus } from '../lib/components/menu-open-focus.js'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

/** A trigger and a menu of three radio items, the second checked. */
function setup() {
  const trigger = document.createElement('button')
  const menu = document.createElement('div')
  const items = ['a', 'b', 'c'].map((name) => {
    const item = document.createElement('button')
    item.setAttribute('role', 'menuitemradio')
    item.setAttribute('aria-checked', String(name === 'b'))
    item.tabIndex = -1
    item.textContent = name
    return item
  })
  menu.append(...items)
  document.body.append(trigger, menu)
  cleanup.push(() => {
    trigger.remove()
    menu.remove()
  })
  const focus = createMenuOpenFocus()
  menu.addEventListener('focusin', focus.onfocusin)
  const open = () => focus.onOpenAutoFocus(new Event('open', { cancelable: true }), menu)
  return { trigger, menu, items, focus, open }
}

describe('createMenuOpenFocus', () => {
  it('opens on the checked item, or the first after first()', () => {
    const { items, focus, open } = setup()
    open()
    expect(document.activeElement).toBe(items[1])
    focus.reset()
    focus.first()
    open()
    expect(document.activeElement).toBe(items[0])
  })

  it('a repeat run while open goes back to where the user moved, even from the trigger', () => {
    const { trigger, items, open } = setup()
    open()
    items[2]!.focus()
    // Bits remounting its focus scope: focus goes to the trigger, then the callback runs again.
    trigger.focus()
    open()
    expect(document.activeElement).toBe(items[2])
  })

  it('forgets the last item on reset, so the next open starts afresh', () => {
    const { items, focus, open } = setup()
    open()
    items[2]!.focus()
    focus.reset()
    open()
    expect(document.activeElement).toBe(items[1])
  })

  it('cancels the event, and does nothing without a menu', () => {
    const focus = createMenuOpenFocus()
    const e = new Event('open', { cancelable: true })
    expect(() => focus.onOpenAutoFocus(e, null)).not.toThrow()
    expect(e.defaultPrevented).toBe(true)
  })
})
