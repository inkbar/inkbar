import { useInkContext } from '../context.js'
import { useReadable } from '../use-readable.svelte.js'

import type { FieldValues, FormField, FormSetResult } from '@inkbar/core'

const NO_FIELDS: readonly FormField[] = []
const NO_VALUES: FieldValues = Object.freeze({})

export interface FormHandle {
  /** The open document's form fields; empty while none is open or it has none. */
  readonly fields: readonly FormField[]
  /** What the fields hold now, keyed by full name. */
  readonly values: FieldValues
  /**
   * Commits values as a person would: scripts run, and the call is one undo step. Returns the
   * names applied and rejected, or `undefined` while no document is open.
   */
  set: (values: FieldValues) => FormSetResult | undefined
  /** Restores the PDF's default values of `names`, or of every field. */
  reset: (names?: string[]) => void
}

/** The open document's form: its fields, their values, and `set` and `reset`. */
export function useForm(): FormHandle {
  const ctx = useInkContext('useForm()')
  const fields = useReadable(() => ctx.document?.form.fields, NO_FIELDS)
  const values = useReadable(() => ctx.document?.form.values, NO_VALUES)
  return {
    get fields() {
      return fields.current
    },
    get values() {
      return values.current
    },
    set: (v) => ctx.document?.form.set(v),
    reset: (names) => ctx.document?.form.reset(names),
  }
}
