import { getContext, setContext } from 'svelte'

import type { ReadableRef } from '../use-readable.svelte.js'
import type { SidebarController, SidebarPanelInfo, SidebarState } from '@inkbar/core/dom'

/** A panel as `InkPanel` registers it. */
export interface SidebarPanelEntry {
  /** The panel's props; read inside an effect, so changes reach the sidebar. */
  info(): SidebarPanelInfo
  /** The panel's element once mounted, to keep the panels in DOM order. */
  element(): HTMLElement | null
}

/** What `InkSidebar` gives its panels. */
export interface SidebarContext {
  controller: SidebarController
  /** The controller's state: read it to re-render when the attributes change. */
  state: ReadableRef<SidebarState>
  /** Adds a panel at the end; returns the function that removes it. */
  register(entry: SidebarPanelEntry): () => void
  /** Puts the registered panels in the order of their elements in the DOM. */
  arrange(): void
}

const KEY = Symbol('inkbar-sidebar')

/** Called once by InkSidebar during its initialisation. */
export function setSidebarContext(ctx: SidebarContext): void {
  setContext(KEY, ctx)
}

/** The sidebar's context, or a readable error outside `InkSidebar`. */
export function useSidebarContext(consumer: string): SidebarContext {
  const ctx = getContext<SidebarContext | undefined>(KEY)
  if (!ctx) throw new Error(`[inkbar] ${consumer} must be inside <InkSidebar>.`)
  return ctx
}
