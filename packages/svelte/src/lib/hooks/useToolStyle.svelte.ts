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
 *
 * With `group`, the style as a control for that group sees it, whatever tool is active: the
 * selection's when it is all in the group, else the group's own; `set` updates the group, and
 * the selection only when it is all in the group.
 */
export function useToolStyle(group?: StyleGroup) {
  const ctx = useInkContext('useToolStyle()')
  const view = () => {
    const style = ctx.toolStyle
    return group && style ? style.scoped(group) : style
  }
  const current = useReadable(() => view()?.current, NO_STYLE)
  const supported = useReadable(() => view()?.supported, NO_PROPS)
  return {
    get current() {
      return current.current
    },
    get supported() {
      return supported.current
    },
    set: (patch: StyleProps, opts?: { group?: StyleGroup; apply?: boolean }) => {
      const style = ctx.toolStyle
      if (group) style?.scoped(group).set(patch)
      else style?.set(patch, opts)
    },
    get: (group: StyleGroup): Readonly<StyleProps> => ctx.toolStyle?.get(group) ?? EMPTY,
  }
}
