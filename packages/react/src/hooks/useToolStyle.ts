import { useMemo } from 'react'

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
  const style = ctx.toolStyle
  const current = useReadable(style?.current, NO_STYLE)
  const supported = useReadable(style?.supported, NO_PROPS)
  return useMemo(
    () => ({
      current,
      supported,
      set: (patch: StyleProps, opts?: { group?: StyleGroup; apply?: boolean }) =>
        style?.set(patch, opts),
      get: (group: StyleGroup): Readonly<StyleProps> => style?.get(group) ?? EMPTY,
    }),
    [current, supported, style]
  )
}
