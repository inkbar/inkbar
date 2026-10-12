import { createContext } from 'reka-ui'
import { getCurrentInstance } from 'vue'

import type { Annotation, DocumentStatus, InkDocument, PdfAssets } from '@inkbar/core'
import type { ToolController, ToolId, Viewport, ZoomValue } from '@inkbar/core/dom'
import type { Ref, ShallowRef } from 'vue'

export type InkStatus = DocumentStatus | { state: 'idle' }

/** Undo and redo for the current document, whichever mode its annotations are in. */
export interface InkHistory {
  canUndo: Readonly<Ref<boolean>>
  canRedo: Readonly<Ref<boolean>>
  undo: () => void
  redo: () => void
  clear: () => void
}

export interface InkContext {
  assets: Readonly<Ref<PdfAssets>>
  document: Readonly<ShallowRef<InkDocument | null>>
  /** `loading` from the moment a document starts opening, then the document's own status. */
  status: Readonly<Ref<InkStatus>>
  annotations: Readonly<Ref<readonly Annotation[]>>
  selection: Readonly<Ref<readonly string[]>>
  /** Set by InkViewport once it has mounted its viewport and tool controller. */
  viewport: ShallowRef<Viewport | null>
  tools: ShallowRef<ToolController | null>
  /** Desired tool; InkViewport applies it to the controller. */
  tool: Readonly<Ref<ToolId>>
  setTool(id: ToolId): void
  /** Desired zoom and page from the host's v-models; InkViewport applies and reports back. */
  zoomModel: Readonly<Ref<ZoomValue | undefined>>
  pageModel: Readonly<Ref<number | undefined>>
  reportZoom(z: ZoomValue): void
  reportPage(p: number): void
  /** Last activated annotation (Enter, click with the note tool, etc.). Popovers key off this. */
  activated: Readonly<Ref<string | null>>
  setActivated(id: string | null): void
  history: InkHistory
  rootEl: Readonly<Ref<HTMLElement | null>>
}

export const [injectInkContext, provideInkContext] = createContext<InkContext>('InkRoot')

/**
 * The context for composables: throws a readable error when called outside a component
 * rendered inside `InkRoot`, instead of Vue's injection warning.
 */
export function useInkContext(consumer: string): InkContext {
  const ctx = getCurrentInstance() ? injectInkContext(null) : null
  if (!ctx)
    throw new Error(
      `[inkbar] ${consumer} must be called in a component inside <InkRoot>.`
    )
  return ctx
}
