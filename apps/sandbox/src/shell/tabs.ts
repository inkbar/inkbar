/*
 * A tablist: one tab selected and in the tab order, arrow keys, Home and End to move, and the
 * selected tab's panel shown. Tabs and panels are paired by index.
 */
export interface Tabs {
  select(index: number, focus?: boolean): void
  readonly selected: number
}

export function createTabs(
  tabs: readonly HTMLElement[],
  panels: readonly HTMLElement[],
  onSelect?: (index: number) => void
): Tabs {
  let selected = 0
  const apply = (index: number): void => {
    selected = index
    tabs.forEach((tab, i) => {
      const on = i === index
      tab.setAttribute('aria-selected', String(on))
      tab.tabIndex = on ? 0 : -1
      if (panels[i]) panels[i].hidden = !on
    })
  }
  const select = (index: number, focus = false): void => {
    apply(index)
    if (focus) tabs[index]?.focus()
    onSelect?.(index)
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i))
    tab.addEventListener('keydown', (e) => {
      const last = tabs.length - 1
      const moves: Record<string, number> = {
        ArrowRight: i === last ? 0 : i + 1,
        ArrowLeft: i === 0 ? last : i - 1,
        Home: 0,
        End: last,
      }
      const next = moves[e.key] ?? -1
      if (next < 0) return
      e.preventDefault()
      select(next, true)
    })
  })
  apply(0)
  return {
    select,
    get selected() {
      return selected
    },
  }
}

/** Markup for one tab; the caller places it in a `role="tablist"`. */
export function tabMarkup(id: string, panelId: string, label: string): string {
  return `<button type="button" role="tab" id="${id}" aria-controls="${panelId}" aria-selected="false" tabindex="-1">${label}</button>`
}
