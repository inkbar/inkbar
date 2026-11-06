/**
 * Core's attributes (`rootAttrs()`, `triggerAttrs(id)`, `panelAttrs(id)` and the like) as React
 * props. Core names them as the DOM does; React wants `hidden` as a boolean and `tabindex` as
 * `tabIndex`. `aria-*`, `data-*`, `id`, `role`, `type` and `title` pass through as they are.
 * Every component that spreads core's attributes goes through this, so the mapping lives once.
 */
export function domAttrs(attrs: Readonly<Record<string, string>>): DomProps {
  const out: DomProps = {}
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'hidden') out.hidden = true
    else if (name === 'tabindex') out.tabIndex = Number(value)
    else out[name] = value
  }
  return out
}

/** What `domAttrs` returns, to spread on an element. */
export interface DomProps {
  hidden?: boolean
  tabIndex?: number
  [name: string]: string | number | boolean | undefined
}
