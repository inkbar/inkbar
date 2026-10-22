import type { FieldValue, FormField } from './types'

/**
 * Why `value` cannot be the field's value, or `undefined` when it can. A locked or read-only
 * field is `readOnly`; otherwise the value must suit the type: any text within `maxLength`, an
 * option of a non-editable choice, an array of options for a multi-select list, an on state or
 * `Off` for a checkbox or radio, and `{ signature }` for a signature field. A button has no value.
 */
export function checkValue(
  field: FormField,
  value: unknown
): 'readOnly' | 'invalid' | undefined {
  if (field.locked || field.flags.readOnly) return 'readOnly'
  return suits(field, value) ? undefined : 'invalid'
}

/** Whether `value` suits the field's type, whatever its flags. */
export function suits(field: FormField, value: unknown): boolean {
  const isOption = (v: unknown) => field.options.some((o) => o.value === v)
  switch (field.type) {
    case 'text':
      return (
        typeof value === 'string' &&
        (field.maxLength === undefined || value.length <= field.maxLength)
      )
    case 'combo':
      return typeof value === 'string' && (field.flags.editable || isOption(value))
    case 'list':
      return field.flags.multiSelect
        ? Array.isArray(value) && value.every(isOption)
        : typeof value === 'string' && isOption(value)
    case 'checkbox':
    case 'radio':
      return (
        value === 'Off' ||
        (typeof value === 'string' &&
          (isOption(value) || field.widgets.some((w) => w.onState === value)))
      )
    case 'signature':
      return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        typeof (value as { signature?: unknown }).signature === 'string' &&
        (value as { signature: string }).signature !== ''
      )
    case 'button':
      return false
  }
}

/**
 * A checked value as it is stored: frozen, a multi-select's options in option order without
 * repeats, and a signature with only its id.
 */
export function normaliseValue(field: FormField, value: FieldValue): FieldValue {
  if (Array.isArray(value)) {
    const chosen = new Set(value)
    return Object.freeze(
      field.options.map((o) => o.value).filter((v) => chosen.has(v) && chosen.delete(v))
    )
  }
  if (typeof value === 'object')
    return Object.freeze({ signature: (value as { signature: string }).signature })
  return value
}

/** The value a reset gives: the PDF's default, else empty for the type, else none. */
export function resetValue(field: FormField): FieldValue | undefined {
  if (field.defaultValue !== undefined) return field.defaultValue
  switch (field.type) {
    case 'text':
    case 'combo':
      return ''
    case 'checkbox':
    case 'radio':
      return 'Off'
    case 'list':
      return field.flags.multiSelect ? Object.freeze([]) : undefined
    default:
      return undefined
  }
}

export function sameValue(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => v === b[i])
    )
  return (
    typeof a === 'object' &&
    typeof b === 'object' &&
    (a as { signature: string }).signature === (b as { signature: string }).signature
  )
}
