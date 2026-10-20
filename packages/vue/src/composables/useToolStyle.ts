import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

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
  return {
    current: useReadable(() => ctx.toolStyle.value?.current, NO_STYLE),
    supported: useReadable(() => ctx.toolStyle.value?.supported, NO_PROPS),
    set: (patch: StyleProps, opts?: { group?: StyleGroup; apply?: boolean }) =>
      ctx.toolStyle.value?.set(patch, opts),
    get: (group: StyleGroup): Readonly<StyleProps> =>
      ctx.toolStyle.value?.get(group) ?? EMPTY,
  }
}
