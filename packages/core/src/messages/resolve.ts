import { en } from './en'

import type { InkMessages, InkMessagesInput, Label } from './types'

/**
 * English merged with `input`, per group, with the input's `lang` (else English's). Unknown
 * groups and keys are dropped.
 */
export function resolveMessages(input?: InkMessagesInput): InkMessages {
  const lang = input && typeof input.lang === 'string' ? input.lang : en.lang
  const out: Record<string, unknown> = { lang }
  for (const [group, defaults] of Object.entries(en) as [string, unknown][]) {
    if (group === 'lang' || typeof defaults !== 'object' || defaults === null) continue
    const merged: Record<string, unknown> = { ...(defaults as Record<string, unknown>) }
    const given: unknown =
      input && Object.hasOwn(input, group)
        ? (input as Record<string, unknown>)[group]
        : undefined
    if (given && typeof given === 'object') {
      for (const key of Object.keys(merged)) {
        const v = Object.hasOwn(given, key)
          ? (given as Record<string, unknown>)[key]
          : undefined
        if (typeof v === 'string' || typeof v === 'function') merged[key] = v
      }
    }
    out[group] = merged
  }
  return out as unknown as InkMessages
}

/** Calls a function label; a throw logs one console.warn and returns `fallback`. */
export function resolveLabel(label: Label | undefined, fallback = ''): string {
  if (typeof label === 'function') {
    try {
      return label()
    } catch (e) {
      console.warn('[inkbar] a label function threw; using the default', e)
      return fallback
    }
  }
  return label ?? fallback
}

/** True when `Intl` accepts the tag (used to decide whether to set `lang`). */
export function isValidLocale(locale: string | undefined): locale is string {
  if (!locale) return false
  try {
    Intl.getCanonicalLocales(locale)
    return true
  } catch {
    return false
  }
}

/** `new Date(ms).toLocaleString(locale)`; an invalid locale falls back to the default. */
export function formatDate(ms: number, locale: string | undefined): string {
  return new Date(ms).toLocaleString(isValidLocale(locale) ? locale : undefined)
}
