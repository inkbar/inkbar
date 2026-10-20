import { afterEach, describe, expect, it } from 'vitest'

import { handleMenuKeys, handleTabKeys, trapTab } from './menu-keys'

let root: HTMLElement
afterEach(() => root?.remove())

function key(k: string, shiftKey = false): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: k, shiftKey, cancelable: true })
}

/** A menu holding a grid `cols` wide of `n` items, then one item after it. */
function grid(n: number, cols: number) {
  root = document.createElement('div')
  const g = document.createElement('div')
  g.dataset.inkMenuColumns = String(cols)
  const cells = Array.from({ length: n }, (_, i) => {
    const b = document.createElement('button')
    b.setAttribute('role', 'menuitemradio')
    b.tabIndex = -1
    b.textContent = `cell ${i}`
    return b
  })
  g.append(...cells)
  const after = document.createElement('button')
  after.setAttribute('role', 'menuitem')
  after.tabIndex = -1
  root.append(g, after)
  document.body.append(root)
  return cells
}

describe('handleMenuKeys in a grid', () => {
  it('stops ArrowLeft and ArrowRight at the ends of each row', () => {
    const cells = grid(7, 3)
    const press = (from: number, k: string) => {
      cells[from]!.focus()
      handleMenuKeys(key(k), root)
      return cells.indexOf(document.activeElement as HTMLButtonElement)
    }
    expect(press(2, 'ArrowRight')).toBe(2)
    expect(press(3, 'ArrowLeft')).toBe(3)
    expect(press(5, 'ArrowRight')).toBe(5)
    expect(press(6, 'ArrowRight')).toBe(6)
    expect(press(1, 'ArrowRight')).toBe(2)
    expect(press(4, 'ArrowLeft')).toBe(3)
  })
})

describe('handleTabKeys', () => {
  it('skips a tab marked aria-disabled', () => {
    root = document.createElement('div')
    const tabs = ['a', 'b', 'c'].map((id) => {
      const t = document.createElement('button')
      t.setAttribute('role', 'tab')
      t.id = id
      return t
    })
    tabs[1]!.setAttribute('aria-disabled', 'true')
    root.append(...tabs)
    document.body.append(root)
    tabs[0]!.focus()
    handleTabKeys(key('ArrowRight'), root)
    expect(document.activeElement).toBe(tabs[2])
  })
})

describe('trapTab', () => {
  it('wraps from the last enabled stop when a disabled one with a tabindex follows it', () => {
    root = document.createElement('div')
    const first = document.createElement('button')
    const last = document.createElement('button')
    const off = document.createElement('button')
    off.disabled = true
    off.tabIndex = 0
    for (const b of [first, last, off]) b.textContent = 'x'
    root.append(first, last, off)
    document.body.append(root)
    last.focus()
    const e = key('Tab')
    trapTab(e, root)
    expect(e.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
  })
})
