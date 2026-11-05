/*
 * The scenario list: a search box, then a collapsible group of links per framework. Each link
 * is a hash route, so picking one changes the hash and the shell follows it.
 */
import { SCENARIOS } from '../scenarios/registry.ts'

import { FRAMEWORK_ORDER, FRAMEWORKS } from './frameworks.ts'
import { formatRoute, type Route } from './route.ts'

export interface Sidebar {
  /** Marks `route`'s link as the current page. */
  select(route: Route): void
}

const CHEVRON =
  '<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'

export function createSidebar(nav: HTMLElement): Sidebar {
  nav.innerHTML = `
<label class="nav-search">
  <span>Find a scenario</span>
  <input type="search" placeholder="Name or framework" autocomplete="off" />
</label>
${FRAMEWORK_ORDER.map(
  (fw) => `
<div class="nav-group" role="group" aria-labelledby="nav-${fw}" data-framework="${fw}">
  <h2><button type="button" id="nav-${fw}" aria-expanded="true" aria-controls="nav-${fw}-list">${FRAMEWORKS[fw].name}${CHEVRON}</button></h2>
  <ul id="nav-${fw}-list">
    ${SCENARIOS.map(
      (s) =>
        `<li data-scenario="${s.id}"><a href="${formatRoute({ framework: fw, scenario: s.id })}">${s.title}</a></li>`
    ).join('')}
  </ul>
</div>`
).join('')}
<p class="nav-empty" hidden></p>`

  const search = nav.querySelector<HTMLInputElement>('input[type=search]')!
  const empty = nav.querySelector<HTMLElement>('.nav-empty')!
  const groups = [...nav.querySelectorAll<HTMLElement>('.nav-group')]
  const collapsed = new Set<string>()

  const render = (): void => {
    const q = search.value.trim().toLowerCase()
    let shown = 0
    for (const g of groups) {
      const fw = g.dataset.framework!
      const fwMatches = FRAMEWORKS[fw as keyof typeof FRAMEWORKS].name
        .toLowerCase()
        .includes(q)
      let items = 0
      for (const li of g.querySelectorAll<HTMLElement>('li')) {
        const title = SCENARIOS.find((s) => s.id === li.dataset.scenario)!.title
        li.hidden = !(fwMatches || title.toLowerCase().includes(q))
        if (!li.hidden) items++
      }
      g.hidden = items === 0
      if (!g.hidden) shown++
      const expanded = !collapsed.has(fw)
      g.querySelector('button')!.setAttribute('aria-expanded', String(expanded))
      g.querySelector('ul')!.hidden = !expanded
    }
    empty.hidden = shown > 0
    empty.textContent = shown > 0 ? '' : `No scenario matches “${search.value.trim()}”.`
  }

  search.addEventListener('input', () => {
    // A new search shows every match, whatever was collapsed.
    collapsed.clear()
    render()
  })
  for (const g of groups) {
    const fw = g.dataset.framework!
    g.querySelector('button')!.addEventListener('click', () => {
      if (collapsed.has(fw)) collapsed.delete(fw)
      else collapsed.add(fw)
      render()
    })
  }
  render()

  return {
    select(route) {
      const href = formatRoute(route)
      for (const a of nav.querySelectorAll('a')) {
        if (a.getAttribute('href') === href) a.setAttribute('aria-current', 'page')
        else a.removeAttribute('aria-current')
      }
    },
  }
}
