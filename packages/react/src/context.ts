import { createContext, useContext } from 'react'

import type {
  Annotation,
  InkDocument,
  InkStatus,
  PdfAssets,
  PluginHistory,
  SignatureLibrary,
  Writable,
} from '@inkbar/core'
import type {
  DecorateAnnotation,
  PluginHost,
  SearchController,
  Tool,
  ToolController,
  ToolId,
  ToolOptions,
  ToolStyle,
  Viewport,
  ZoomValue,
} from '@inkbar/core/dom'

export type { InkStatus }

/**
 * Undo and redo for the current document, whichever mode its annotations are in. `track` and
 * `react` (from `PluginHistory`) reach the same history, so plugin stores undo with the edits.
 */
export interface InkHistory extends PluginHistory {
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  clear: () => void
  /**
   * Runs `fn` and records what it changes as one undo step. The host still receives one change
   * per add. Controlled, the history groups the resulting list changes into one step, and
   * `canUndo` updates once the current task ends. Any other change the host applies in that
   * same window joins the step.
   */
  batch: (fn: () => void) => void
}

export interface InkContext {
  assets: PdfAssets
  document: InkDocument | null
  /** `loading` from the moment a document starts opening, then the document's own status. */
  status: InkStatus
  annotations: readonly Annotation[]
  selection: readonly string[]
  /**
   * The plugins from InkRoot's `plugins` prop, set up once the root has mounted and kept for
   * its life; `null` before that, and on the server. InkViewport hands it to the engine;
   * InkCommand places its commands.
   */
  pluginHost: PluginHost | null
  /**
   * The search controller from the same set-up as `pluginHost`: shared by the find bar, the
   * search button, the engine's highlights and the plugins. `null` before the root has
   * mounted, and on the server.
   */
  search: SearchController | null
  /** InkViewport's scroll element while it is mounted: the plugins' `root`. */
  viewportEl: Writable<HTMLElement | null>
  /** Set by InkViewport once it has built its viewport and tool controller. */
  viewport: Viewport | null
  tools: ToolController | null
  /** Desired tool; InkViewport applies it to the controller. */
  tool: ToolId
  setTool: (id: ToolId) => void
  /** Host tools from InkRoot's `tools` prop; InkViewport registers them. */
  hostTools: Tool[] | undefined
  /**
   * Calls InkRoot's current `decorateAnnotation` prop. The function itself stays the same
   * across renders, so a new prop does not re-render the context's consumers.
   */
  decorateAnnotation: DecorateAnnotation
  /**
   * Calls `listener` after InkRoot's `decorateAnnotation` prop changes; InkViewport re-applies
   * the decorations then. Returns the unsubscribe.
   */
  onDecorateAnnotationChange: (listener: () => void) => () => void
  /** The font families text boxes offer: InkRoot's `fonts`, else `FONT_FAMILIES`. */
  fonts: readonly string[]
  /** The tools' options for InkRoot's life, so they persist across documents. */
  toolOptions: ToolOptions
  /** The saved signatures, from InkRoot's `signatures` store (memory by default). */
  signatures: SignatureLibrary
  /** The fonts a typed signature offers: InkRoot's `signatureFonts`, else `SIGNATURE_FONTS`. */
  signatureFonts: readonly string[]
  /** The open document's tool style; `null` while no document is open. */
  toolStyle: ToolStyle | null
  /** Desired zoom and page from the host's props; InkViewport applies and reports back. */
  zoomModel: ZoomValue | undefined
  pageModel: number | undefined
  reportZoom: (z: ZoomValue) => void
  reportPage: (p: number) => void
  /** Last activated annotation (Enter, click with the note tool, etc.). Popovers key off this. */
  activated: string | null
  /**
   * Activates annotation `id`, or clears the activation with `null`. This is the context's
   * own: unlike core's `Viewer.setActivated`, it calls InkRoot's `onActivate` for an id, and
   * it does not check that the id is in the document.
   */
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
