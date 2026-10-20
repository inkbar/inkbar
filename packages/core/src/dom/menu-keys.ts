// Keyboard support the style menus share across the bindings and the vanilla factories. Items
// are `[role="menuitemradio"]` (or `menuitem`) buttons that are not focus stops themselves
// (`tabindex="-1"`): the menu moves focus between them, and Tab leaves the menu.
//
// An element with `data-ink-menu-columns="N"` lays its items out as a grid N wide: ArrowLeft
// and ArrowRight move within a row, ArrowUp and ArrowDown between rows, and past the first or
// last row they carry on to the items before or after the grid.

const ITEMS =
  ':is([role="menuitemradio"], [role="menuitem"]):not(:disabled):not([aria-disabled="true"])'

/** The menu's enabled items in document order. */
export function menuItems(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(ITEMS)]
}

/** Focuses the first checked item, else the first enabled one. */
export function focusInitialMenuItem(root: ParentNode): void {
  const items = menuItems(root)
  const target =
    items.find((el) => el.getAttribute('aria-checked') === 'true') ?? items[0]
  target?.focus({ preventScroll: true })
}

/** The index to focus for a key, or -1 when the key means nothing here. */
function nextIndex(key: string, items: HTMLElement[], i: number): number {
  const last = items.length - 1
  if (key === 'Home') return 0
  if (key === 'End') return last
  const grid = items[i]?.closest<HTMLElement>('[data-ink-menu-columns]')
  const cols = Number(grid?.dataset.inkMenuColumns)
  if (grid && cols > 0) {
    const cells = items.filter((el) => grid.contains(el))
    const first = items.indexOf(cells[0]!)
    const end = first + cells.length - 1
    const at = i - first
    if (key === 'ArrowRight')
      return at % cols === cols - 1 || at === cells.length - 1 ? i : i + 1
    if (key === 'ArrowLeft') return at % cols === 0 ? i : i - 1
    if (key === 'ArrowDown')
      return at + cols < cells.length ? i + cols : end === last ? 0 : end + 1
    if (key === 'ArrowUp')
      return at - cols >= 0 ? i - cols : first === 0 ? last : first - 1
    return -1
  }
  if (key === 'ArrowDown') return i < 0 || i === last ? 0 : i + 1
  if (key === 'ArrowUp') return i <= 0 ? last : i - 1
  return -1
}

/**
 * ArrowDown and ArrowUp move between enabled items and wrap; Home and End go to the ends.
 * Inside a grid the arrow keys move in both directions.
 */
export function handleMenuKeys(e: KeyboardEvent, root: ParentNode): void {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
  const items = menuItems(root)
  if (items.length === 0) return
  const next = nextIndex(
    e.key,
    items,
    items.indexOf(document.activeElement as HTMLElement)
  )
  if (next < 0) return
  e.preventDefault()
  items[next]!.focus({ preventScroll: true })
}

/**
 * Arrow keys inside a `role="radiogroup"`: the next (or previous) enabled `role="radio"`
 * takes focus and is chosen, wrapping at the ends, as a native radio group does.
 */
export function handleRadioKeys(e: KeyboardEvent, group: ParentNode): void {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown'
  if (!forward && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp') return
  const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)')]
  const at = radios.indexOf(document.activeElement as HTMLElement)
  if (at < 0) return
  e.preventDefault()
  const next = radios[(at + (forward ? 1 : -1) + radios.length) % radios.length]!
  next.focus({ preventScroll: true })
  next.click()
}

/**
 * Arrow keys, Home and End inside a `role="tablist"`: the next (or previous) enabled
 * `role="tab"` takes focus and is chosen, wrapping at the ends.
 */
export function handleTabKeys(e: KeyboardEvent, tablist: ParentNode): void {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  const tabs = [
    ...tablist.querySelectorAll<HTMLElement>(
      '[role="tab"]:not(:disabled):not([aria-disabled="true"])'
    ),
  ]
  const at = tabs.indexOf(document.activeElement as HTMLElement)
  if (at < 0) return
  const last = tabs.length - 1
  const next =
    e.key === 'ArrowRight' || e.key === 'ArrowDown'
      ? at === last
        ? 0
        : at + 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
        ? at === 0
          ? last
          : at - 1
        : e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? last
            : -1
  if (next < 0) return
  e.preventDefault()
  tabs[next]!.focus({ preventScroll: true })
  tabs[next]!.click()
}

const TABBABLE = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]',
]
  .map((s) => `${s}:not([tabindex="-1"])`)
  .join(', ')

/**
 * Keeps Tab inside `container`, a modal: Tab from its last stop goes to its first, and
 * Shift+Tab from the first to the last.
 */
export function trapTab(e: KeyboardEvent, container: HTMLElement): void {
  if (e.key !== 'Tab' || e.defaultPrevented) return
  const stops = [...container.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (el) => !el.matches(':disabled') && el.getClientRects().length > 0
  )
  if (stops.length === 0) {
    e.preventDefault()
    return
  }
  const first = stops[0]!
  const last = stops[stops.length - 1]!
  const active = document.activeElement
  if (e.shiftKey && (active === first || !container.contains(active))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (active === last || !container.contains(active))) {
    e.preventDefault()
    first.focus()
  }
}
