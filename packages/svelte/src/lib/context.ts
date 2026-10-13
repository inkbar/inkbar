import { getContext, setContext } from 'svelte'

import type { Annotation, InkDocument, InkStatus, PdfAssets } from '@inkbar/core'
import type { ToolController, ToolId, Viewport, ZoomValue } from '@inkbar/core/dom'

export type { InkStatus }

/** Undo and redo for the current document, whichever mode its annotations are in. */
export interface InkHistory {
  readonly canUndo: boolean
  readonly canRedo: boolean
  undo(): void
  redo(): void
  clear(): void
}

/**
 * What InkRoot shares with everything inside it. Every `readonly` member is a getter over
 * InkRoot's state, so a template or effect that reads one re-runs when it changes.
 */
export interface InkContext {
  readonly assets: PdfAssets
  readonly document: InkDocument | null
  /** `loading` from the moment a document starts opening, then the document's own status. */
  readonly status: InkStatus
  readonly annotations: readonly Annotation[]
  readonly selection: readonly string[]
  /** Set by InkViewport once it has built its viewport and tool controller. */
  readonly viewport: Viewport | null
  readonly tools: ToolController | null
  /** Desired tool; InkViewport applies it to the controller. */
  readonly tool: ToolId
  setTool(id: ToolId): void
  /** Desired zoom and page from the host's props; InkViewport applies and reports back. */
  readonly zoomModel: ZoomValue | undefined
  readonly pageModel: number | undefined
  reportZoom(z: ZoomValue): void
  reportPage(p: number): void
  /** Last activated annotation (Enter, click with the note tool, etc.). Popovers key off this. */
  readonly activated: string | null
  setActivated(id: string | null): void
  readonly history: InkHistory
  readonly rootEl: HTMLElement | null
  setViewport(viewport: Viewport | null, tools: ToolController | null): void
}

const KEY = Symbol('inkbar')

/**
 * `activated` as last set, not tracked, per context. Internal to the package. For code that
 * runs while an effect is torn down (a popover's close handler): there Svelte serves a
 * reactive read the value from before the change that caused the teardown.
 */
const activatedPeeks = new WeakMap<InkContext, () => string | null>()

/** Called once by InkRoot during its initialisation. */
export function setInkContext(ctx: InkContext, peekActivated: () => string | null): void {
  activatedPeeks.set(ctx, peekActivated)
  setContext(KEY, ctx)
}

/** The untracked `activated` of a context made by InkRoot. Not part of the public entry. */
export function peekActivated(ctx: InkContext): string | null {
  const peek = activatedPeeks.get(ctx)
  return peek ? peek() : ctx.activated
}

/**
 * The context for hooks and components: throws a readable error when called outside a component
 * rendered inside `InkRoot`, including when called outside any component at all.
 */
export function useInkContext(consumer: string): InkContext {
  let ctx: InkContext | undefined
  try {
    ctx = getContext<InkContext | undefined>(KEY)
  } catch {
    ctx = undefined
  }
  if (!ctx)
    throw new Error(
      `[inkbar] ${consumer} must be called in a component inside <InkRoot>.`
    )
  return ctx
}
