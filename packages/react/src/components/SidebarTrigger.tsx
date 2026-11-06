import { sidebarBadge, type SidebarPanelInfo } from '@inkbar/core/dom'

import { InkIcon } from './InkIcon'

/**
 * A sidebar trigger's content: `createSidebar`'s markup, so the theme styles both alike. The
 * rail shows the icon alone (the trigger's `title` carries the label); tabs and stack headers
 * show the label too. The badge is hidden from assistive technology: the trigger's name has it.
 */
export function SidebarTrigger({
  panel,
  rail,
}: {
  panel: SidebarPanelInfo
  rail: boolean
}) {
  const badge = sidebarBadge(panel.badge)
  return (
    <>
      {panel.icon ? <InkIcon icon={panel.icon} /> : null}
      {!panel.icon || !rail ? (
        <span className="ink-sidebar-label">{panel.label}</span>
      ) : null}
      <span className="ink-sidebar-badge" aria-hidden="true" hidden={badge === null}>
        {badge}
      </span>
    </>
  )
}
