import { afterEach, describe, expect, it } from 'vitest'

import { keepHistoryFocus } from './history-keys'

let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.forEach((f) => f())
  cleanup = []
})

function setup() {
  const root = document.createElement('div')
  const scroll = document.createElement('div')
  const undo = document.createElement('button')
  undo.dataset.inkUndo = ''
  const other = document.createElement('button')
  root.append(undo, other, scroll)
  document.body.append(root)
  const stop = keepHistoryFocus(root, () => scroll)
  cleanup.push(() => {
    stop()
    root.remove()
  })
  return { root, scroll, undo, other }
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('keepHistoryFocus', () => {
  it('moves focus to the scroll element when the focused button is disabled', () => {
    const { scroll, undo } = setup()
    undo.focus()
    undo.disabled = true
    expect(document.activeElement).toBe(scroll)
  })

  it('moves focus when a browser leaves it on the disabled button', async () => {
    const { scroll, undo } = setup()
    // As WebKit can: the button keeps focus and no focusout comes with the disable.
    const real = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement')!
    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      get: () => undo,
    })
    try {
      undo.disabled = true
      await settle()
    } finally {
      Object.defineProperty(document, 'activeElement', real)
      delete (document as { activeElement?: unknown }).activeElement
    }
    expect(document.activeElement).toBe(scroll)
  })

  it('leaves a later focusout from a disabled button alone', async () => {
    const { other, undo } = setup()
    undo.disabled = true
    await settle()
    other.focus()
    // A click on content that takes no focus, long after the disable.
    undo.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))
    expect(document.activeElement).toBe(other)
  })

  it('leaves an enabled button, and a move to another control, alone', () => {
    const { other, undo } = setup()
    undo.focus()
    other.focus()
    expect(document.activeElement).toBe(other)
    undo.focus()
    undo.blur()
    expect(document.activeElement).toBe(document.body)
  })

  it('stops when removed', () => {
    const { undo } = setup()
    cleanup.shift()!()
    document.body.append(undo)
    cleanup.push(() => undo.remove())
    undo.focus()
    undo.disabled = true
    expect(document.activeElement).toBe(document.body)
  })
})
