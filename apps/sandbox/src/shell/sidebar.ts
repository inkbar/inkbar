/*
 * The scenario list: a framework picker, then that framework's scenarios. Every entry is a hash
 * route, so picking one changes the hash and the shell follows it. Picking a framework keeps the
 * scenario, so the same scenario can be compared across frameworks.
 */
import { SCENARIOS } from '../scenarios/registry.ts'

import { FRAMEWORK_ORDER, FRAMEWORKS, type FrameworkId } from './frameworks.ts'
import { formatRoute, type Route } from './route.ts'

export interface Sidebar {
  /** Shows `route`'s framework and marks its scenario as the current page. */
  select(route: Route): void
}

const CHEVRON =
  '<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'
const CHECK =
  '<svg class="fw-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'

export function createSidebar(nav: HTMLElement): Sidebar {
  nav.innerHTML = `
<div class="fw-picker">
  <button type="button" class="fw-trigger" aria-expanded="false" aria-controls="fw-menu" aria-label="Framework">
    <span class="fw-tile" data-fw-mark></span>
    <span class="fw-trigger-text">
      <span class="fw-name" data-fw-name></span>
      <span class="fw-package" data-fw-package></span>
    </span>
    ${CHEVRON}
  </button>
  <ul class="fw-menu" id="fw-menu" hidden>
    ${FRAMEWORK_ORDER.map(
      (fw) => `
    <li><a data-framework="${fw}">
      <span class="fw-tile">${FRAMEWORKS[fw].mark}</span>
      <span class="fw-trigger-text">
        <span class="fw-name">${FRAMEWORKS[fw].name}</span>
        <span class="fw-package">${FRAMEWORKS[fw].package}</span>
      </span>
      ${CHECK}
    </a></li>`
    ).join('')}
  </ul>
</div>
<ul class="nav-scenarios">
  ${SCENARIOS.map((s) => `<li><a data-scenario="${s.id}">${s.title}</a></li>`).join('')}
</ul>`

  const trigger = nav.querySelector<HTMLButtonElement>('.fw-trigger')!
  const menu = nav.querySelector<HTMLElement>('.fw-menu')!
  const options = [...menu.querySelectorAll<HTMLAnchorElement>('a')]
  const scenarios = [...nav.querySelectorAll<HTMLAnchorElement>('.nav-scenarios a')]

  const isOpen = (): boolean => !menu.hidden
  function open(focus: 'current' | 'first' | 'last' | null): void {
    menu.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
    const current = options.find((a) => a.hasAttribute('aria-current'))
    const target =
      focus === 'first' ? options[0] : focus === 'last' ? options.at(-1) : current
    if (focus) target?.focus()
  }
  function close(refocus: boolean): void {
    if (!isOpen()) return
    menu.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    if (refocus) trigger.focus()
  }

  trigger.addEventListener('click', () => (isOpen() ? close(false) : open(null)))
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      open(e.key === 'ArrowDown' ? 'current' : 'last')
    }
  })
  menu.addEventListener('keydown', (e) => {
    const i = options.indexOf(document.activeElement as HTMLAnchorElement)
    const step: Record<string, number> = {
      ArrowDown: i + 1,
      ArrowUp: i - 1,
      Home: 0,
      End: options.length - 1,
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    } else if (e.key in step) {
      e.preventDefault()
      const n = options.length
      options[(step[e.key]! + n) % n]!.focus()
    }
  })
  // Following a link changes the hash; the menu closes and focus returns to the picker.
  menu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) close(true)
  })
  // The menu closes when focus or a press goes anywhere else.
  nav.querySelector('.fw-picker')!.addEventListener('focusout', (e) => {
    const next = (e as FocusEvent).relatedTarget
    if (!(next instanceof Node) || !nav.querySelector('.fw-picker')!.contains(next))
      close(false)
  })
  document.addEventListener('pointerdown', (e) => {
    if (!nav.querySelector('.fw-picker')!.contains(e.target as Node)) close(false)
  })

  let shown: FrameworkId | null = null

  return {
    select(route) {
      const fw = FRAMEWORKS[route.framework]
      if (shown !== route.framework) {
        shown = route.framework
        nav.querySelector('[data-fw-mark]')!.innerHTML = fw.mark
        nav.querySelector('[data-fw-name]')!.textContent = fw.name
        nav.querySelector('[data-fw-package]')!.textContent = fw.package
        trigger.setAttribute('aria-label', `Framework: ${fw.name}`)
      }
      for (const a of options) {
        const id = a.dataset.framework as FrameworkId
        a.href = formatRoute({ framework: id, scenario: route.scenario })
        if (id === route.framework) a.setAttribute('aria-current', 'true')
        else a.removeAttribute('aria-current')
      }
      for (const a of scenarios) {
        const id = a.dataset.scenario as Route['scenario']
        a.href = formatRoute({ framework: route.framework, scenario: id })
        if (id === route.scenario) a.setAttribute('aria-current', 'page')
        else a.removeAttribute('aria-current')
      }
    },
  }
}
