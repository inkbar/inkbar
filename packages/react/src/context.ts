import { createContext, useContext } from 'react'

import type { Annotation, InkDocument, InkStatus, PdfAssets } from '@inkbar/core'
import type { ToolController, ToolId, Viewport, ZoomValue } from '@inkbar/core/dom'

export type { InkStatus }

/** Undo and redo for the current document, whichever mode its annotations are in. */
export interface InkHistory {
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  clear: () => void
}

export interface InkContext {
  assets: PdfAssets
  document: InkDocument | null
  /** `loading` from the moment a document starts opening, then the document's own status. */
  status: InkStatus
  annotations: readonly Annotation[]
  selection: readonly string[]
  /** Set by InkViewport once it has built its viewport and tool controller. */
  viewport: Viewport | null
  tools: ToolController | null
  /** Desired tool; InkViewport applies it to the controller. */
  tool: ToolId
  setTool: (id: ToolId) => void
  /** Desired zoom and page from the host's props; InkViewport applies and reports back. */
  zoomModel: ZoomValue | undefined
  pageModel: number | undefined
  reportZoom: (z: ZoomValue) => void
  reportPage: (p: number) => void
  /** Last activated annotation (Enter, click with the note tool, etc.). Popovers key off this. */
  activated: string | null
  setActivated: (id: string | null) => void
  history: InkHistory
  rootEl: HTMLElement | null
  setViewport: (viewport: Viewport | null, tools: ToolController | null) => void
}

export const InkContextObject = createContext<InkContext | null>(null)

/**
 * The context for hooks: throws a readable error when called outside a component rendered
 * inside `InkRoot`.
 */
export function useInkContext(consumer: string): InkContext {
  const ctx = useContext(InkContextObject)
  if (!ctx)
    throw new Error(
      `[inkbar] ${consumer} must be called in a component inside <InkRoot>.`
    )
  return ctx
}
