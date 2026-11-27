import { loadStrings, type SandboxStrings } from '../shared/strings/index.ts'

import type { LangId } from './route.ts'
import type { InkMessagesInput } from '@inkbar/core'

export interface Language {
  /** `undefined` is Inkbar's English. */
  messages: InkMessagesInput | undefined
  locale: string | undefined
  /** The sandbox's own words. */
  strings: SandboxStrings
}

async function loadMessages(id: LangId): Promise<InkMessagesInput | undefined> {
  switch (id) {
    case 'fr':
      return (await import('@inkbar/core/locales/fr')).fr
    case 'de':
      return (await import('@inkbar/core/locales/de')).de
    case 'en':
      return undefined
  }
}

/**
 * Loads a language on demand, the viewer's words and the sandbox's together, so English never
 * downloads French or German.
 */
export async function loadLanguage(id: LangId): Promise<Language> {
  const [messages, strings] = await Promise.all([loadMessages(id), loadStrings(id)])
  return { messages, locale: id === 'en' ? undefined : id, strings }
}
