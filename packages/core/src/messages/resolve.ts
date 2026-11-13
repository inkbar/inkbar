import { en } from './en'

import type { InkMessages, InkMessagesInput, Label } from './types'

/** The `group.key` of each host function that has failed, so each warns once. */
const warned = new Set<string>()

/**
 * `given` called in place of `fallback`: a throw or a result that is not a string logs one
 * warning for `key` and gives `fallback`'s text for the same params. `given`'s `source`, when it
 * has one, stays readable on the result.
 */
type AnyFn = (params: unknown) => unknown

function guarded(key: string, given: AnyFn, fallback: unknown): AnyFn {
  const english: AnyFn =
    typeof fallback === 'function' ? (fallback as AnyFn) : () => fallback
  const fail = (why: unknown, params: unknown): unknown => {
    if (!warned.has(key)) {
      warned.add(key)
      console.warn(`[inkbar] the message ${key} failed; using the English`, why)
    }
    return english(params)
  }
  const fn = (params: unknown): unknown => {
    let text: unknown
    try {
      text = given(params)
    } catch (e) {
      return fail(e, params)
    }
    return typeof text === 'string' ? text : fail(`it returned ${typeof text}`, params)
  }
  const source: unknown = (given as { source?: unknown }).source
  if (source !== undefined)
    Object.defineProperty(fn, 'source', { value: source, enumerable: false })
  return fn
}

/** The `group.key` of each host value of the wrong kind, so each warns once. */
const mismatched = new Set<string>()

function warnMismatch(key: string, given: string, wanted: string): void {
  if (mismatched.has(key)) return
  mismatched.add(key)
  console.warn(
    `[inkbar] the message ${key} is a ${given}, not a ${wanted}; using the English`
  )
}

/**
 * English merged with `input`, per group, with the input's `lang` (else English's). Unknown
 * groups and keys are dropped. A value of another kind than English's (a string for a function
 * key, or the reverse) is dropped with one warning per key. A host function that throws or
 * returns anything but a string gives the English text instead, with one warning per key.
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
        if (v === undefined) continue
        if (typeof v !== typeof merged[key]) {
          warnMismatch(`${group}.${key}`, typeof v, typeof merged[key])
          continue
        }
        if (typeof v === 'string') merged[key] = v
        else if (typeof v === 'function')
          merged[key] = guarded(`${group}.${key}`, v as AnyFn, merged[key])
      }
    }
    out[group] = merged
  }
  return out as unknown as InkMessages
}

/**
 * Calls a function label; a throw or a result that is not a string logs one console.warn and
 * returns `fallback`.
 */
export function resolveLabel(label: Label | undefined, fallback = ''): string {
  if (typeof label === 'function') {
    let text: unknown
    try {
      text = label()
    } catch (e) {
      console.warn('[inkbar] a label function threw; using the default', e)
      return fallback
    }
    if (typeof text === 'string') return text
    console.warn(`[inkbar] a label function returned ${typeof text}; using the default`)
    return fallback
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
