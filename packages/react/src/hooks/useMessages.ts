import { en, resolveLabel } from '@inkbar/core'
import { useContext } from 'react'

import { InkContextObject } from '../context'

import type { InkMessages, Label } from '@inkbar/core'

/**
 * The root's words: InkRoot's `messages` over English, a new object on every change. English
 * outside a root, for the parts that work without one (a sidebar and its panels).
 */
export function useMessages(): InkMessages {
  return useContext(InkContextObject)?.messages ?? en
}

/**
 * A host's `label` over the default `fallback`. Call it while rendering: the context changes
 * with every new `messages` or `locale`, so a label function reads its own language again. An
 * empty host label stays empty.
 */
export function hostLabel(label: Label | undefined, fallback: string): string {
  return label === undefined ? fallback : resolveLabel(label, fallback)
}
