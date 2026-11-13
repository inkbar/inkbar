import { en, resolveLabel } from '@inkbar/core'
import { shallowRef } from 'vue'

import { injectInkContext } from '../context'

import type { InkMessages, Label } from '@inkbar/core'
import type { Ref } from 'vue'

const ENGLISH: Readonly<Ref<InkMessages>> = shallowRef(en)

/**
 * The root's words: InkRoot's `messages` over English, a new object on every change. English
 * outside a root, for the parts that work without one (a sidebar and its panels).
 */
export function useMessages(): Readonly<Ref<InkMessages>> {
  return injectInkContext(null)?.messages ?? ENGLISH
}

/**
 * A host's `label` over the default `fallback(messages)`. It reads `messages`, so a computed
 * built on it re-runs on every change and a label function reads its own language again. An
 * empty host label stays empty.
 */
export function hostLabel(
  messages: Readonly<Ref<InkMessages>>,
  label: Label | undefined,
  fallback: (m: InkMessages) => string
): string {
  const text = fallback(messages.value)
  return label === undefined ? text : resolveLabel(label, text)
}
