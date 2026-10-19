// Keyboard support the style menus share across the bindings and the vanilla factories. Items
// are `[role="menuitemradio"]` buttons that are not focus stops themselves (`tabindex="-1"`):
// the menu moves focus between them, and Tab leaves the menu.

const ITEMS = '[role="menuitemradio"]:not(:disabled):not([aria-disabled="true"])'

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

/** ArrowDown and ArrowUp move between enabled items and wrap; Home and End go to the ends. */
export function handleMenuKeys(e: KeyboardEvent, root: ParentNode): void {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
  const items = menuItems(root)
  if (items.length === 0) return
  const i = items.indexOf(document.activeElement as HTMLElement)
  const last = items.length - 1
  const next =
    e.key === 'ArrowDown'
      ? i < 0 || i === last
        ? 0
        : i + 1
      : e.key === 'ArrowUp'
        ? i <= 0
          ? last
          : i - 1
        : e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? last
            : -1
  if (next < 0) return
  e.preventDefault()
  items[next]!.focus({ preventScroll: true })
}
