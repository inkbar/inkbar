import { useMemo } from 'react'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import type { CurrentStyle, StyleGroup, StyleKey, StyleProps } from '@inkbar/core'

const NO_STYLE: CurrentStyle = {}
const NO_PROPS: ReadonlySet<StyleKey> = new Set()
const EMPTY: Readonly<StyleProps> = {}

interface ToolStyleView {
  current: CurrentStyle
  supported: ReadonlySet<StyleKey>
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

/**
 * The tool style the style controls read and write: `current` shows the selection's values
 * (`'mixed'` where they differ), else the active tool's group; `supported` names the props
 * the active tool or the selection has. `set` updates the group and the selected annotations.
 *
 * With `group`, the style as a control for that group sees it, whatever tool is active: the
 * selection's when it is all in the group, else the group's own; `set` updates the group, and
 * the selection only when it is all in the group.
 */
export function useToolStyle(): ToolStyleHandle
export function useToolStyle(group: StyleGroup | undefined): ScopedToolStyleHandle
export function useToolStyle(group?: StyleGroup): ToolStyleHandle {
  const ctx = useInkContext('useToolStyle()')
  const style = ctx.toolStyle
  const scope = group && style ? style.scoped(group) : undefined
  const view = scope ?? style
  const current = useReadable(view?.current, NO_STYLE)
  const supported = useReadable(view?.supported, NO_PROPS)
  return useMemo(
    () => ({
      current,
      supported,
      set: (patch: StyleProps, opts?: { group?: StyleGroup; apply?: boolean }) =>
        scope ? scope.set(patch) : style?.set(patch, opts),
      get: (g: StyleGroup): Readonly<StyleProps> => style?.get(g) ?? EMPTY,
    }),
    [current, supported, style, scope]
  )
}
