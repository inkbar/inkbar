import { SCENARIOS, type ScenarioId } from '../scenarios/registry.ts'

import { FRAMEWORK_ORDER, type FrameworkId } from './frameworks.ts'

export interface Route {
  framework: FrameworkId
  scenario: ScenarioId
}

const DEFAULT_ROUTE: Route = { framework: 'react', scenario: 'tour' }

/** Reads `#/<framework>/<scenario>`; anything empty or unknown is the default route. */
export function parseRoute(hash: string): Route {
  const [framework, scenario] = hash.replace(/^#\/?/, '').split('/')
  const f = FRAMEWORK_ORDER.find((id) => id === framework)
  const s = SCENARIOS.find((x) => x.id === scenario)
  return f && s ? { framework: f, scenario: s.id } : { ...DEFAULT_ROUTE }
}

export function formatRoute(r: Route): string {
  return `#/${r.framework}/${r.scenario}`
}
