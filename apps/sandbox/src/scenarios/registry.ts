import { en } from '../shared/strings/en.ts'

import type { DocumentName } from '../../vite/documents/index.ts'
import type { ScenarioText } from '../shared/strings/types.ts'
import type { FrameworkId } from '../shell/frameworks.ts'

export type ScenarioId =
  | 'tour'
  | 'tools'
  | 'forms'
  | 'save'
  | 'redactions'
  | 'controlled'
  | 'search'
  | 'sidebars'
  | 'outline'
  | 'locked'
  | 'events'

/** A scenario. Its title, blurb and notes are English here; the shell shows the chosen language's. */
export interface Scenario extends ScenarioText {
  id: ScenarioId
  document: DocumentName
  panels: readonly ('events' | 'values')[]
  /** More Code tabs for every framework, after the scenario's own file. */
  extraFiles?: readonly string[]
  /** More Code tabs for one framework, such as a component the scenario file renders. */
  frameworkFiles?: Partial<Record<FrameworkId, readonly string[]>>
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'tour',
    ...en.scenarios.tour,
    document: 'tour',
    panels: ['events'],
  },
  {
    id: 'tools',
    ...en.scenarios.tools,
    document: 'letter',
    panels: ['events'],
  },
  {
    id: 'forms',
    ...en.scenarios.forms,
    document: 'form',
    panels: ['events', 'values'],
  },
  {
    id: 'save',
    ...en.scenarios.save,
    document: 'letter',
    panels: ['events'],
  },
  {
    id: 'redactions',
    ...en.scenarios.redactions,
    document: 'redactions',
    panels: ['events'],
    extraFiles: [
      'src/plugin/suggestions.ts',
      'src/plugin/suggestions-text.ts',
      'src/plugin/suggestions.css',
    ],
    frameworkFiles: {
      vue: ['src/scenarios/redactions/ReviewSidebar.vue'],
      svelte: [
        'src/scenarios/redactions/ReviewSidebar.svelte',
        'src/scenarios/redactions/CommandLog.svelte',
      ],
    },
  },
  {
    id: 'controlled',
    ...en.scenarios.controlled,
    document: 'tour',
    panels: ['events'],
  },
  {
    id: 'search',
    ...en.scenarios.search,
    document: 'long',
    panels: ['events'],
    frameworkFiles: {
      vue: ['src/scenarios/search/ResultsSidebar.vue'],
      svelte: [
        'src/scenarios/search/ResultsSidebar.svelte',
        'src/scenarios/search/SearchLog.svelte',
      ],
    },
  },
  {
    id: 'sidebars',
    ...en.scenarios.sidebars,
    document: 'tour',
    panels: ['events'],
  },
  {
    id: 'outline',
    ...en.scenarios.outline,
    document: 'handbook',
    panels: ['events'],
  },
  {
    id: 'locked',
    ...en.scenarios.locked,
    document: 'locked',
    panels: ['events'],
  },
  {
    id: 'events',
    ...en.scenarios.events,
    document: 'letter',
    panels: ['events'],
    extraFiles: ['src/plugin/presses.ts', 'src/plugin/presses.css'],
  },
]
