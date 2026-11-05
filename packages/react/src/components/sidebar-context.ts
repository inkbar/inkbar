import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'

import type { SidebarController, SidebarPanelInfo, SidebarState } from '@inkbar/core/dom'

/** A panel as `InkPanel` registers it. */
export interface SidebarPanelEntry {
  /** The panel's props as they were last committed. */
  info: SidebarPanelInfo
  /** The panel's element once mounted, to keep the panels in DOM order. */
  element(): HTMLElement | null
}

/** What `InkSidebar` gives its panels. */
export interface SidebarContext {
  controller: SidebarController
  /**
   * Before the sidebar has mounted (on the server, and in the browser's first render), adds or
   * replaces the panel in render order, so the controller knows the panels that render first
   * and the markup shows the right one open. A no-op once mounted.
   */
  preregister(info: SidebarPanelInfo): void
  /** Adds a mounted panel; returns the function that removes it. */
  register(entry: SidebarPanelEntry): () => void
  /** Tells the sidebar a registered panel's props changed. */
  changed(): void
}

export const SidebarContextObject = createContext<SidebarContext | null>(null)

/** The sidebar context: throws a readable error outside `InkSidebar`. */
export function useSidebarContext(consumer: string): SidebarContext {
  const ctx = useContext(SidebarContextObject)
  if (!ctx) throw new Error(`[inkbar] ${consumer} must be rendered inside <InkSidebar>.`)
  return ctx
}

/**
 * The controller's state, re-rendering as it changes. Unlike `useReadable` it reads the live
 * state on the server too: the sidebar works without a document, so its markup is known there.
 */
export function useSidebarState(controller: SidebarController): SidebarState {
  const { state } = controller
  const subscribe = useCallback(
    (onChange: () => void) => state.subscribe(() => onChange()),
    [state]
  )
  const get = useCallback(() => state.get(), [state])
  return useSyncExternalStore(subscribe, get, get)
}
