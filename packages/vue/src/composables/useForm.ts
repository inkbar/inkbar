import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import type { FieldValues, FormField, FormSetResult } from '@inkbar/core'
import type { Ref } from 'vue'

const NO_FIELDS: readonly FormField[] = []
const NO_VALUES: FieldValues = Object.freeze({})

export interface FormHandle {
  /** The open document's form fields; empty while none is open or it has none. */
  fields: Readonly<Ref<readonly FormField[]>>
  /** What the fields hold now, keyed by full name. */
  values: Readonly<Ref<FieldValues>>
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
  const form = () => ctx.document.value?.form
  return {
    fields: useReadable(() => form()?.fields, NO_FIELDS),
    values: useReadable(() => form()?.values, NO_VALUES),
    set: (values) => form()?.set(values),
    reset: (names) => form()?.reset(names),
  }
}
