import { en, resolveLabel } from '@inkbar/core'

import { useOptionalInkContext } from './context.js'

import type { InkMessages, Label } from '@inkbar/core'

export interface MessagesRef {
  /**
   * The root's words: InkRoot's `messages` over English, a new object on every change. Read it
   * in a template or a `$derived`, so what reads it follows the root's `messages` and `locale`.
   */
  readonly current: InkMessages
}

/**
 * The root's words, English outside a root, for the parts that work without one (a sidebar and
 * its panels). Call it while the component initialises.
 */
export function useMessages(): MessagesRef {
  const ctx = useOptionalInkContext()
  return {
    get current() {
      return ctx?.messages ?? en
    },
  }
}

/**
 * A host's `label` over the default `fallback`. Call it in a template or a `$derived` that also
 * reads the messages, so a label function reads its own language again on every change. An
 * empty host label stays empty.
 */
export function hostLabel(label: Label | undefined, fallback: string): string {
  return label === undefined ? fallback : resolveLabel(label, fallback)
}
