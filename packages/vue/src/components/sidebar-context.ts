import { createContext } from 'reka-ui'

import type { SidebarController, SidebarPanelInfo, SidebarState } from '@inkbar/core/dom'
import type { Ref } from 'vue'

/** A panel as `InkPanel` registers it. */
export interface SidebarPanelEntry {
  /** The panel's props; read inside a computed, so changes reach the sidebar. */
  info(): SidebarPanelInfo
  /** The panel's element once mounted, to keep the panels in DOM order. */
  element(): HTMLElement | null
}

/** What `InkSidebar` gives its panels. */
export interface SidebarContext {
  controller: SidebarController
  /** The controller's state: read it to re-render when the attributes change. */
  state: Readonly<Ref<SidebarState>>
  /** Adds a panel at the end; returns the function that removes it. */
  register(entry: SidebarPanelEntry): () => void
  /** Puts the registered panels in the order of their elements in the DOM. */
  arrange(): void
}

export const [injectSidebarContext, provideSidebarContext] =
  createContext<SidebarContext>('InkSidebar')
