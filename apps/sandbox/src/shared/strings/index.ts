/*
 * The sandbox's own words. English is part of the page; French and German load on demand, as
 * the viewer's own sets do, so an English visit downloads neither.
 */
import { en } from './en.ts'

import type { SandboxStrings } from './types.ts'
import type { LangId } from '../../shell/route.ts'

export { en }
export type { SandboxStrings, ScenarioLabels, ScenarioText, ShellText } from './types.ts'

export async function loadStrings(id: LangId): Promise<SandboxStrings> {
  switch (id) {
    case 'fr':
      return (await import('./fr.ts')).fr
    case 'de':
      return (await import('./de.ts')).de
    case 'en':
      return en
  }
}
