import { SCENARIOS, type ScenarioId } from '../scenarios/registry.ts'

import { FRAMEWORK_ORDER, type FrameworkId } from './frameworks.ts'

export type LangId = 'en' | 'fr' | 'de'

/** Each language with its name in that language, as the sandbox's language select lists it. */
export const LANGUAGES: { id: LangId; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
  { id: 'de', name: 'Deutsch' },
]

export interface Route {
  framework: FrameworkId
  scenario: ScenarioId
  lang: LangId
}

const DEFAULT_ROUTE: Route = { framework: 'react', scenario: 'tour', lang: 'en' }

/**
 * Reads `#/<framework>/<scenario>` and the `lang` query parameter. Anything empty or unknown is
 * the default: the React tour, in English.
 */
export function parseRoute(hash: string, search = ''): Route {
  const [framework, scenario] = hash.replace(/^#\/?/, '').split('/')
  const f = FRAMEWORK_ORDER.find((id) => id === framework)
  const s = SCENARIOS.find((x) => x.id === scenario)
  const lang = LANGUAGES.find((l) => l.id === new URLSearchParams(search).get('lang'))
  const base = f && s ? { framework: f, scenario: s.id } : DEFAULT_ROUTE
  return { framework: base.framework, scenario: base.scenario, lang: lang?.id ?? 'en' }
}

/** The hash for a route. The language lives in the query string, so it is not part of this. */
export function formatRoute(r: Pick<Route, 'framework' | 'scenario'>): string {
  return `#/${r.framework}/${r.scenario}`
}

export function withLang(r: Route, lang: LangId): Route {
  return { ...r, lang }
}

/** `search` with `lang` set to the route's language, or dropped for English. Other parameters stay. */
export function formatSearch(r: Route, search: string): string {
  const params = new URLSearchParams(search)
  if (r.lang === 'en') params.delete('lang')
  else params.set('lang', r.lang)
  const text = params.toString()
  return text ? `?${text}` : ''
}
