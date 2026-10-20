import { useInkContext } from '../context.js'
import { useReadable } from '../use-readable.svelte.js'

import type { CurrentStyle, StyleGroup, StyleKey, StyleProps } from '@inkbar/core'

const NO_STYLE: CurrentStyle = {}
const NO_PROPS: ReadonlySet<StyleKey> = new Set()
const EMPTY: Readonly<StyleProps> = {}

interface ToolStyleView {
  readonly current: CurrentStyle
  readonly supported: ReadonlySet<StyleKey>
  /** A group's own style. */
  get: (group: StyleGroup) => Readonly<StyleProps>
}

/** The tool style for the active tool or the selection. */
export interface ToolStyleHandle extends ToolStyleView {
  set: (patch: StyleProps, opts?: { group?: StyleGroup; apply?: boolean }) => void
}

/** The tool style scoped to one group: `set` writes that group, so it takes no options. */
export interface ScopedToolStyleHandle extends ToolStyleView {
  set: (patch: StyleProps) => void
}

/** A style group, or a getter for one that may change (a prop). */
export type StyleGroupSource = StyleGroup | undefined | (() => StyleGroup | undefined)

/**
 * The tool style the style controls read and write: `current` shows the selection's values
 * (`'mixed'` where they differ), else the active tool's group; `supported` names the props
 * the active tool or the selection has. `set` updates the group and the selected annotations.
 *
 * With `group` (or a getter for it, so a prop can change it), the style as a control for that group sees it, whatever tool is active: the
 * selection's when it is all in the group, else the group's own; `set` updates the group, and
 * the selection only when it is all in the group.
 */
export function useToolStyle(): ToolStyleHandle
export function useToolStyle(group: StyleGroupSource): ScopedToolStyleHandle
export function useToolStyle(group?: StyleGroupSource): ToolStyleHandle {
  const ctx = useInkContext('useToolStyle()')
  const scope = (): StyleGroup | undefined =>
    typeof group === 'function' ? group() : group
  const view = () => {
    const style = ctx.toolStyle
    const g = scope()
    return g && style ? style.scoped(g) : style
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
      const g = scope()
      if (g) style?.scoped(g).set(patch)
      else style?.set(patch, opts)
    },
    get: (group: StyleGroup): Readonly<StyleProps> => ctx.toolStyle?.get(group) ?? EMPTY,
  }
}
