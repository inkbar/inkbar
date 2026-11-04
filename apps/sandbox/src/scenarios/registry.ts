import type { DocumentName } from '../../vite/documents/index.ts'
import type { FrameworkId } from '../shell/frameworks.ts'

export type ScenarioId =
  'tour' | 'tools' | 'forms' | 'redactions' | 'controlled' | 'search'

export interface Scenario {
  id: ScenarioId
  title: string
  blurb: string
  document: DocumentName
  panels: readonly ('events' | 'values')[]
  extraFiles?: readonly string[]
  /** A line shown under the blurb for one framework, where it differs from the rest. */
  notes?: Partial<Record<FrameworkId, string>>
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'tour',
    title: 'Annotation tour',
    blurb: 'Every creation tool, on a document that already has one of each annotation.',
    document: 'tour',
    panels: ['events'],
  },
  {
    id: 'tools',
    title: 'Pick your tools',
    blurb:
      'Only the tools you import end up in your bundle. This one registers highlight and note.',
    document: 'letter',
    panels: ['events'],
  },
  {
    id: 'forms',
    title: 'Fill a form',
    blurb:
      'Text fields, checkboxes, radios, a choice list and a signature field. No creation tools needed.',
    document: 'form',
    panels: ['events', 'values'],
  },
  {
    id: 'redactions',
    title: 'Suggest redactions',
    blurb: 'A plugin adds a command, its own records and a card per suggestion.',
    document: 'redactions',
    panels: ['events'],
    extraFiles: ['src/plugin/suggestions.ts'],
  },
  {
    id: 'controlled',
    title: 'Controlled annotations',
    blurb: 'Your app owns the annotation list and hears every change.',
    document: 'tour',
    panels: ['events'],
    notes: {
      vanilla:
        "createViewer can't take a controlled annotation list yet, so this page follows the list instead.",
    },
  },
  {
    id: 'search',
    title: 'Search a long document',
    blurb:
      'Two hundred pages. Only the pages near the viewport render, and search runs across all of them.',
    document: 'long',
    panels: ['events'],
  },
]
