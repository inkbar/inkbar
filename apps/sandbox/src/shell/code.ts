/*
 * The Code tab's files: the scenario's file for the framework, then any extra files it names.
 * Each is highlighted at build time (`?highlight`), and each loads only when it is shown.
 */
import { SCENARIO_FILE } from '../frameworks/index.ts'
import { SCENARIOS, type ScenarioId } from '../scenarios/registry.ts'

import type { FrameworkId } from './frameworks.ts'

interface Highlighted {
  html: string
  code: string
}

export interface SourceFile extends Highlighted {
  /** Relative to `apps/sandbox/`. */
  path: string
}

type Loaders = Record<string, () => Promise<Highlighted>>

const SCENARIO_SOURCES: Loaders = import.meta.glob<Highlighted>(
  '../scenarios/*/*.{tsx,vue,svelte,ts}',
  {
    query: '?highlight',
    import: 'default',
  }
)

/** The files a scenario's `extraFiles` may name. */
const EXTRA_SOURCES: Loaders = import.meta.glob<Highlighted>(
  ['../plugin/*.{ts,css}', '!../plugin/*.test.ts'],
  { query: '?highlight', import: 'default' }
)

/** `src/plugin/suggestions.ts` is `../plugin/suggestions.ts` from here. */
const fromSrc = (path: string): string => `../${path.replace(/^src\//, '')}`

async function loadOne(loaders: Loaders, path: string): Promise<SourceFile> {
  const loader = loaders[fromSrc(path)]
  if (!loader) throw new Error(`No highlighted source for ${path}`)
  return { path, ...(await loader()) }
}

export function loadSources(
  framework: FrameworkId,
  scenario: ScenarioId
): Promise<SourceFile[]> {
  const extra = SCENARIOS.find((s) => s.id === scenario)?.extraFiles ?? []
  return Promise.all([
    loadOne(SCENARIO_SOURCES, `src/scenarios/${scenario}/${SCENARIO_FILE[framework]}`),
    ...extra.map((path) => loadOne(EXTRA_SOURCES, path)),
  ])
}
