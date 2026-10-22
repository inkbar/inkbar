import { getContext, setContext } from 'svelte'

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
  readonly canUndo: boolean
  readonly canRedo: boolean
  undo(): void
  redo(): void
  clear(): void
  /**
   * Runs `fn` and records what it changes as one undo step. The host still receives one change
   * per add. Controlled, the history groups the resulting list changes into one step, and
   * `canUndo` updates once the current task ends. Any other change the host applies in that
   * same window joins the step.
   */
  batch(fn: () => void): void
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
  /**
   * The plugins from InkRoot's `plugins` prop, set up once the root has mounted and kept for
   * its life; `null` before that, and on the server. InkViewport hands it to the engine;
   * InkCommand places its commands.
   */
  readonly pluginHost: PluginHost | null
  /** InkViewport's scroll element while it is mounted: the plugins' `root`. */
  readonly viewportEl: Writable<HTMLElement | null>
  /** Set by InkViewport once it has built its viewport and tool controller. */
  readonly viewport: Viewport | null
  readonly tools: ToolController | null
  /** Desired tool; InkViewport applies it to the controller. */
  readonly tool: ToolId
  setTool(id: ToolId): void
  /** Host tools from InkRoot's `tools` prop; InkViewport registers them. */
  readonly hostTools: Tool[] | undefined
  /** InkRoot's `decorateAnnotation` prop. InkViewport re-applies decorations when it changes. */
  readonly decorateAnnotation: DecorateAnnotation | undefined
  /** The font families text boxes offer: InkRoot's `fonts`, else `FONT_FAMILIES`. */
  readonly fonts: readonly string[]
  /** The tools' options for InkRoot's life, so they persist across documents. */
  readonly toolOptions: ToolOptions
  /** The saved signatures, from InkRoot's `signatures` store (memory by default). */
  readonly signatures: SignatureLibrary
  /** The fonts a typed signature offers: InkRoot's `signatureFonts`, else `SIGNATURE_FONTS`. */
  readonly signatureFonts: readonly string[]
  /** The open document's tool style; `null` while no document is open. */
  readonly toolStyle: ToolStyle | null
  /** Desired zoom and page from the host's props; InkViewport applies and reports back. */
  readonly zoomModel: ZoomValue | undefined
  readonly pageModel: number | undefined
  reportZoom(z: ZoomValue): void
  reportPage(p: number): void
  /** Last activated annotation (Enter, click with the note tool, etc.). Popovers key off this. */
  readonly activated: string | null
  /**
   * Activates annotation `id`, or clears the activation with `null`. This is the context's
   * own: unlike core's `Viewer.setActivated`, it calls InkRoot's `onActivate` for an id, and
   * it does not check that the id is in the document.
   */
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
