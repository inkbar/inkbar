// What a save has to write: the session's annotations and the form values that differ from the
// file's, as a snapshot whose key two snapshots compare by.
import { sameValue } from '../form/values'

import type { Annotation } from '../annotations/types'
import type { FieldValue, FieldValues, FormField } from '../form/types'

/**
 * A form value that differs from the file's. `null` for a field the session emptied. `text` is
 * what a text field or combo box shows for it, when its format script set any.
 */
export interface FieldChange {
  value: FieldValue | null
  text?: string
}

export interface Snapshot {
  /** The session's annotations, in list order: file annotations (`source: 'pdf'`) left out. */
  readonly annotations: readonly Annotation[]
  /** Fields whose value or formatted text differs from the file's, by full name. */
  readonly fields: Readonly<Record<string, FieldChange>>
  /**
   * Both of the above as canonical JSON: object keys sorted, annotations in id order. Equal
   * snapshots have equal keys.
   */
  readonly key: string
}

/** True when `now` holds something `opened` does not: the file needs writing. */
export function hasChanges(now: Snapshot, opened: Snapshot): boolean {
  return now.key !== opened.key
}

/** Each annotation's canonical JSON. Annotations are replaced, never changed, so it holds. */
const canonicalOf = new WeakMap<Annotation, string>()

function canonicalAnnotation(a: Annotation): string {
  let json = canonicalOf.get(a)
  if (json === undefined) {
    json = canonical(a)
    canonicalOf.set(a, json)
  }
  return json
}

/** JSON with every object's keys sorted, so equal values give equal text. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, (v as Record<string, unknown>)[k]])
        )
      : v
  )
}

/** The snapshot of `annotations` (file annotations are dropped) and `fields`. */
export function takeSnapshot(state: {
  annotations: readonly Annotation[]
  fields: Readonly<Record<string, FieldChange>>
}): Snapshot {
  const annotations = state.annotations.filter((a) => a.source !== 'pdf')
  const ids = annotations
    .map((a) => [a.id, canonicalAnnotation(a)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, json]) => json)
  const key = `[${ids.join(',')}]${canonical(state.fields)}`
  return { annotations, fields: state.fields, key }
}

/** Whether a field of this type shows formatted text the engine can draw. */
const showsText = (f: FormField) => f.type === 'text' || f.type === 'combo'

/**
 * `value` with the field's empty value as `undefined`: a cleared text field holds `''` and an
 * unticked box `'Off'`, which show the same as no value at all.
 */
function filled(f: FormField, value: FieldValue | undefined): FieldValue | undefined {
  if (value === '' && (f.type === 'text' || f.type === 'combo')) return undefined
  if (value === 'Off' && (f.type === 'checkbox' || f.type === 'radio')) return undefined
  if (Array.isArray(value) && value.length === 0) return undefined
  return value
}

/**
 * The fields of `form` whose value differs from the file's (`FormField.value`), or whose
 * formatted text differs from `file.formatted`, the text the fields showed when the document
 * opened. An empty value (`''`, `'Off'`, no options) is the same as none. Buttons and locked
 * fields never change.
 */
export function changedFields(
  form: {
    fields: readonly FormField[]
    values: FieldValues
    formatted: Readonly<Record<string, string>>
  },
  file: { formatted: Readonly<Record<string, string>> }
): Record<string, FieldChange> {
  const out: Record<string, FieldChange> = {}
  for (const f of form.fields) {
    if (f.type === 'button' || f.locked) continue
    const value = form.values[f.name]
    const text = showsText(f) ? form.formatted[f.name] : undefined
    const fileText = showsText(f) ? file.formatted[f.name] : undefined
    if (sameValue(filled(f, value), filled(f, f.value)) && text === fileText) continue
    out[f.name] = { value: value ?? null, ...(text === undefined ? {} : { text }) }
  }
  return out
}
