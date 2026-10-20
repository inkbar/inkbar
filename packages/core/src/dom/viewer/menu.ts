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
  /**
   * The panel's role. `menu` (the default) is a list of items with arrow-key movement; `dialog`
   * is for a panel of mixed widgets, which take Tab and their own keys, and opens on the first
   * focusable one.
   */
  role?: 'menu' | 'dialog'
  /**
   * Whether `target` belongs to a menu nested in this one (its panel sits outside this panel
   * in the DOM). Presses, focus and Escape inside it neither dismiss this menu nor close it.
   */
  owns?(target: Node): boolean
  /** Builds the items on first call and updates them in place after; called on open and `refresh`. */
  render(menu: HTMLElement): void
}

export interface Menu {
  readonly isOpen: boolean
  /** Re-renders an open menu, and closes it if the trigger has become disabled. */
  refresh(): void
  close(restoreFocus?: boolean): void
}

const FOCUSABLE =
  'select:not(:disabled), input:not(:disabled), button:not(:disabled):not([tabindex="-1"])'

export function createMenu(trigger: HTMLButtonElement, opts: MenuOptions): Menu {
  const role = opts.role ?? 'menu'
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
      role,
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
    if (role === 'dialog')
      el.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true })
    else if (focus === 'first') menuItems(el)[0]?.focus({ preventScroll: true })
    else focusInitialMenuItem(el)

    const onKey = (e: KeyboardEvent): void => {
      const nested = opts.owns?.(e.target as Node) === true
      if (e.key === 'Escape') {
        // The nested menu closes itself; this one stays.
        if (nested) return
        e.preventDefault()
        close(true)
      } else if (role === 'menu' && el.contains(e.target as Node)) handleMenuKeys(e, el)
    }
    const outside = (t: Node): boolean =>
      !el.contains(t) && !trigger.contains(t) && opts.owns?.(t) !== true
    const onPress = (e: PointerEvent): void => {
      if (outside(e.target as Node)) close()
    }
    const onFocus = (e: FocusEvent): void => {
      if (outside(e.target as Node)) close()
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
