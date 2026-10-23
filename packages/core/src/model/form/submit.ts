import { fieldsToGloss } from './gloss'

import type { FieldValue, FieldValues, FormField } from './types'

/**
 * The values a submit sends: every field with a value that is not no-export, limited to
 * `names` (or everything but them, when `include` is false). A name covers the fields under it.
 * An empty list means every field.
 */
export function submitValues(
  values: FieldValues,
  fields: readonly FormField[],
  names: readonly string[],
  include: boolean
): FieldValues {
  const all = fieldsToGloss(values, fields)
  if (names.length === 0) return Object.freeze(all)
  const listed = (name: string) =>
    names.some((n) => name === n || name.startsWith(`${n}.`))
  const out: Record<string, FieldValue> = {}
  for (const [name, value] of Object.entries(all))
    if (listed(name) === include) out[name] = value
  return Object.freeze(out)
}
