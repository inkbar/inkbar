/*
 * A menu anchored to a trigger button, shared by the vanilla style controls. The shell owns
 * the panel (`role="menu"`, created on open and removed on close), its placement (the
 * popover's), and dismissal: an outside press, focus leaving, or Escape (which returns focus
 * to the trigger). ArrowDown on the trigger opens it with the first enabled item focused.
 * It closes when the trigger becomes disabled. Items are `[role="menuitemradio"]` buttons;
 * ArrowUp, ArrowDown, Home and End move between them.
 */
import { focusInitialMenuItem, handleMenuKeys, menuItems } from '../menu-keys'

import { h } from './dom'
import { placePanel } from './popover'

export interface MenuOptions {
  label: string
  /** Extra attributes for the panel. */
  attrs?: Record<string, string>
  /** Builds the items on first call and updates them in place after; called on open and `refresh`. */
  render(menu: HTMLElement): void
}

export interface Menu {
  readonly isOpen: boolean
  /** Re-renders an open menu, and closes it if the trigger has become disabled. */
  refresh(): void
  close(restoreFocus?: boolean): void
}

export function createMenu(trigger: HTMLButtonElement, opts: MenuOptions): Menu {
  let panel: HTMLElement | null = null
  let teardown: (() => void) | null = null

  const place = (): void => {
    if (panel) placePanel(panel, trigger.getBoundingClientRect())
  }

  function close(restoreFocus = false): void {
    if (!panel) return
    teardown?.()
    teardown = null
    panel.remove()
    panel = null
    trigger.setAttribute('aria-expanded', 'false')
    trigger.dataset.state = 'closed'
    if (restoreFocus) trigger.focus()
  }

  function open(focus: 'initial' | 'first'): void {
    if (panel || trigger.disabled) return
    const el = h('div', {
      role: 'menu',
      'aria-label': opts.label,
      class: 'ink-select-content ink-menu-content',
      'data-ink-select-content': '',
      ...opts.attrs,
    })
    panel = el
    el.style.visibility = 'hidden'
    document.body.append(el)
    opts.render(el)
    place()
    el.style.visibility = ''
    trigger.setAttribute('aria-expanded', 'true')
    trigger.dataset.state = 'open'
    if (focus === 'first') menuItems(el)[0]?.focus({ preventScroll: true })
    else focusInitialMenuItem(el)

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(true)
      } else if (el.contains(e.target as Node)) handleMenuKeys(e, el)
    }
    const onPress = (e: PointerEvent): void => {
      const t = e.target as Node
      if (!el.contains(t) && !trigger.contains(t)) close()
    }
    const onFocus = (e: FocusEvent): void => {
      const t = e.target as Node
      if (!el.contains(t) && !trigger.contains(t)) close()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPress, true)
    document.addEventListener('focusin', onFocus)
    window.addEventListener('resize', place)
    document.addEventListener('scroll', place, true)
    teardown = () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPress, true)
      document.removeEventListener('focusin', onFocus)
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', place, true)
    }
  }

  trigger.addEventListener('click', () => (panel ? close(true) : open('initial')))
  trigger.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' || panel || trigger.disabled) return
    e.preventDefault()
    open('first')
  })

  return {
    get isOpen() {
      return panel !== null
    },
    refresh() {
      if (!panel) return
      if (trigger.disabled) close()
      else {
        opts.render(panel)
        place()
      }
    },
    close,
  }
}
