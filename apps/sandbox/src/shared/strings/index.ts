/*
 * The sandbox's own words. English is part of the page.
 */
import { en } from './en.ts'

import type { SandboxStrings } from './types.ts'
import type { LangId } from '../../shell/route.ts'

export { en }
export type { SandboxStrings, ScenarioLabels, ScenarioText, ShellText } from './types.ts'

/** The words for a language. Every language has English words for now. */
export function loadStrings(_id: LangId): Promise<SandboxStrings> {
  return Promise.resolve(en)
}
