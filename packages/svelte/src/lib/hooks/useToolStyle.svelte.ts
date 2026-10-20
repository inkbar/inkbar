import { useInkContext } from '../context.js'
import { useReadable } from '../use-readable.svelte.js'

import type { CurrentStyle, StyleGroup, StyleKey, StyleProps } from '@inkbar/core'

const NO_STYLE: CurrentStyle = {}
const NO_PROPS: ReadonlySet<StyleKey> = new Set()
const EMPTY: Readonly<StyleProps> = {}

/**
 * The tool style the style controls read and write: `current` shows the selection's values
 * (`'mixed'` where they differ), else the active tool's group; `supported` names the props
 * the active tool or the selection has. `set` updates the group and the selected annotations.
 */
export function useToolStyle() {
  const ctx = useInkContext('useToolStyle()')
  const current = useReadable(() => ctx.toolStyle?.current, NO_STYLE)
  const supported = useReadable(() => ctx.toolStyle?.supported, NO_PROPS)
  return {
    get current() {
      return current.current
    },
    get supported() {
      return supported.current
    },
    set: (patch: StyleProps, opts?: { group?: StyleGroup; apply?: boolean }) =>
      ctx.toolStyle?.set(patch, opts),
    get: (group: StyleGroup): Readonly<StyleProps> => ctx.toolStyle?.get(group) ?? EMPTY,
  }
}
