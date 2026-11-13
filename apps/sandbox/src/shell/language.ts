import type { LangId } from './route.ts'
import type { InkMessagesInput } from '@inkbar/core'

export interface Language {
  /** `undefined` is Inkbar's English. */
  messages: InkMessagesInput | undefined
  locale: string | undefined
}

/** Loads a language set on demand, so English never downloads French or German. */
export async function loadLanguage(id: LangId): Promise<Language> {
  switch (id) {
    case 'fr':
      return { messages: (await import('@inkbar/core/locales/fr')).fr, locale: 'fr' }
    case 'de':
      return { messages: (await import('@inkbar/core/locales/de')).de, locale: 'de' }
    case 'en':
      return { messages: undefined, locale: undefined }
  }
}
