import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { cx } from '../class-names'
import { domAttrs } from '../dom-attrs'

import {
  useSidebarContext,
  useSidebarState,
  type SidebarPanelEntry,
} from './sidebar-context'
import { SidebarTrigger } from './SidebarTrigger'

import type { SidebarPanelInfo } from '@inkbar/core/dom'
import type { IconNode } from '@inkbar/icons'

export interface InkPanelProps {
  /** Names the panel in the sidebar's `open`. */
  id: string
  /** Names its trigger. */
  label: string
  /** An `@inkbar/icons` node, shown on the rail. */
  icon?: IconNode | undefined
  /** A count or short text beside it, hidden when empty or 0. */
  badge?: string | number | undefined
  children?: ReactNode
}

/**
 * One panel of an `InkSidebar`, holding `children` as its content. Closed, the panel stays
 * mounted and hidden. In a stack it renders its own header above its content.
 */
export function InkPanel({ id, label, icon, badge, children }: InkPanelProps) {
  const ctx = useSidebarContext('InkPanel')
  const { controller } = ctx
  const info = useMemo<SidebarPanelInfo>(
    () => ({
      id,
      label,
      ...(icon !== undefined && { icon }),
      ...(badge !== undefined && { badge }),
    }),
    [id, label, icon, badge]
  )
  // Before the sidebar mounts, so this render already shows whether the panel is open.
  ctx.preregister(info)
  const state = useSidebarState(controller)

  const wrapper = useRef<HTMLDivElement>(null)
  const [entry] = useState<SidebarPanelEntry>(() => ({
    info,
    element: () => wrapper.current,
  }))
  useLayoutEffect(() => ctx.register(entry), [ctx, entry])
  useLayoutEffect(() => {
    if (entry.info === info) return
    entry.info = info
    ctx.changed()
  }, [ctx, entry, info])

  const stack = state.layout === 'stack'
  return (
    // A section in a stack; in rail and tabs the theme leaves the layout to the panel. Kept in
    // every layout, so the content is never remounted.
    <div ref={wrapper} className={cx('ink-sidebar-slot', stack && 'ink-sidebar-section')}>
      {stack ? (
        <button className="ink-sidebar-header" {...domAttrs(controller.triggerAttrs(id))}>
          <SidebarTrigger panel={info} rail={false} />
        </button>
      ) : null}
      <div className="ink-sidebar-panel" {...domAttrs(controller.panelAttrs(id))}>
        {children}
      </div>
    </div>
  )
}
