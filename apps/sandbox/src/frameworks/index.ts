/*
 * Mounts a scenario in one framework. Each framework's scenario files and its adapter load
 * only when that framework is picked, so a React scenario never downloads Vue or Svelte.
 */
import type { MountedScenario, MountScenario, ScenarioProps } from './types.ts'
import type { VanillaScenario } from './vanilla.ts'
import type { ScenarioId } from '../scenarios/registry.ts'
import type { FrameworkId } from '../shell/frameworks.ts'
import type { ComponentType } from 'react'
import type { Component as SvelteComponent } from 'svelte'
import type { Component as VueComponent } from 'vue'

type Loaders<T> = Record<string, () => Promise<T>>

const SCENARIO_FILES = {
  react: import.meta.glob<ComponentType<ScenarioProps>>('../scenarios/*/react.tsx', {
    import: 'default',
  }),
  vue: import.meta.glob<VueComponent<ScenarioProps>>('../scenarios/*/vue.vue', {
    import: 'default',
  }),
  svelte: import.meta.glob<SvelteComponent<ScenarioProps>>(
    '../scenarios/*/svelte.svelte',
    { import: 'default' }
  ),
  vanilla: import.meta.glob<VanillaScenario>('../scenarios/*/vanilla.ts', {
    import: 'mount',
  }),
} satisfies Record<FrameworkId, Loaders<unknown>>

/** The scenario's file name for each framework, inside `src/scenarios/<id>/`. */
export const SCENARIO_FILE: Record<FrameworkId, string> = {
  react: 'react.tsx',
  vue: 'vue.vue',
  svelte: 'svelte.svelte',
  vanilla: 'vanilla.ts',
}

const key = (framework: FrameworkId, scenario: ScenarioId): string =>
  `../scenarios/${scenario}/${SCENARIO_FILE[framework]}`

/** Whether the scenario has been written for this framework yet. */
export function hasScenario(framework: FrameworkId, scenario: ScenarioId): boolean {
  return key(framework, scenario) in SCENARIO_FILES[framework]
}

function load<T>(files: Loaders<T>, path: string): Promise<T> {
  const loader = files[path]
  if (!loader) return Promise.reject(new Error(`No scenario file at ${path}`))
  return loader()
}

export async function mountScenario(
  framework: FrameworkId,
  ...[scenario, el, props]: Parameters<MountScenario>
): Promise<MountedScenario> {
  const path = key(framework, scenario)
  switch (framework) {
    case 'react': {
      const [{ mountReact }, component] = await Promise.all([
        import('./react.tsx'),
        load(SCENARIO_FILES.react, path),
      ])
      return mountReact(component, el, props)
    }
    case 'vue': {
      const [{ mountVue }, component] = await Promise.all([
        import('./vue.ts'),
        load(SCENARIO_FILES.vue, path),
      ])
      return mountVue(component, el, props)
    }
    case 'svelte': {
      const [{ mountSvelte }, component] = await Promise.all([
        import('./svelte.svelte.ts'),
        load(SCENARIO_FILES.svelte, path),
      ])
      return mountSvelte(component, el, props)
    }
    case 'vanilla': {
      const [{ mountVanilla }, mount] = await Promise.all([
        import('./vanilla.ts'),
        load(SCENARIO_FILES.vanilla, path),
      ])
      return mountVanilla(mount, el, props)
    }
  }
}
