import { z } from 'zod'

import { checkValue, normaliseValue } from './values'

import type { FieldValue, FieldValues, FormField } from './types'

/** A Gloss value the form could not apply. No script runs on one, so none is `script`. */
export interface GlossRejection {
  name: string
  reason: 'unknown' | 'readOnly' | 'invalid'
}

/** A field value as Gloss writes it: text, the options of a multi-select, or a signature id. */
export const GlossFieldValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.looseObject({ signature: z.string().min(1) }),
])

/** Gloss's `fields`: values keyed by full field name. */
export const GlossFieldsSchema = z.record(z.string().min(1), GlossFieldValueSchema)

/**
 * The values to export: every field that has one and is not no-export, in field order, with a
 * multi-select's options in option order.
 */
export function fieldsToGloss(
  values: FieldValues,
  fields: readonly FormField[]
): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {}
  for (const field of fields) {
    const value = values[field.name]
    if (value === undefined || field.flags.noExport) continue
    out[field.name] = normaliseValue(field, value)
  }
  return out
}

/**
 * The values of a Gloss `fields` map that suit the form, and the names that do not: unknown,
 * read-only (or locked), or invalid for the field. Anything other than a map applies nothing.
 */
export function fieldsFromGloss(
  raw: unknown,
  fields: readonly FormField[]
): { values: FieldValues; rejected: GlossRejection[] } {
  const values: Record<string, FieldValue> = {}
  const rejected: GlossRejection[] = []
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return { values, rejected }
  const byName = new Map(fields.map((f) => [f.name, f]))
  for (const [name, value] of Object.entries(raw)) {
    const field = byName.get(name)
    if (!field) {
      rejected.push({ name, reason: 'unknown' })
      continue
    }
    const parsed = GlossFieldValueSchema.safeParse(value)
    const reason = checkValue(field, value) ?? (parsed.success ? undefined : 'invalid')
    if (reason || !parsed.success) {
      rejected.push({ name, reason: reason ?? 'invalid' })
      continue
    }
    values[name] = normaliseValue(field, parsed.data)
  }
  return { values, rejected }
}
