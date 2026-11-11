import { createContext } from 'reka-ui'
import { getCurrentInstance } from 'vue'

import type {
  Annotation,
  ViewerAction,
  InkDocument,
  InkError,
  InkStatus,
  InkStorage,
  PdfAssets,
  PluginHistory,
  SignatureLibrary,
} from '@inkbar/core'
import type {
  DecorateAnnotation,
  Navigation,
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
import type { Ref, ShallowRef } from 'vue'

export type { InkStatus }

/**
 * Undo and redo for the current document, whichever mode its annotations are in. `track` and
 * `react` (from `PluginHistory`) reach the same history, so plugin stores undo with the edits.
 */
export interface InkHistory extends PluginHistory {
  canUndo: Readonly<Ref<boolean>>
  canRedo: Readonly<Ref<boolean>>
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
  assets: Readonly<Ref<PdfAssets>>
  document: Readonly<ShallowRef<InkDocument | null>>
  /** `loading` from the moment a document starts opening, then the document's own status. */
  status: Readonly<Ref<InkStatus>>
  annotations: Readonly<Ref<readonly Annotation[]>>
  selection: Readonly<Ref<readonly string[]>>
  /**
   * The plugins from InkRoot's `plugins` prop, set up once the root has mounted and kept for
   * its life; `null` before that (and on the server) and once it unmounts. InkViewport hands it
   * to the engine; InkCommand places its commands.
   */
  pluginHost: Readonly<ShallowRef<PluginHost | null>>
  /**
   * The search controller from the same set-up as `pluginHost`: shared by the find bar, the
   * search button, the engine's highlights and the plugins. `null` until the root has mounted
   * (and on the server) and once it unmounts.
   */
  search: Readonly<ShallowRef<SearchController | null>>
  /** InkViewport's scroll element while it is mounted: the plugins' `root`. */
  viewportEl: ShallowRef<HTMLElement | null>
  /** Set by InkViewport once it has mounted its viewport and tool controller. */
  viewport: ShallowRef<Viewport | null>
  tools: ShallowRef<ToolController | null>
  /**
   * The engine's navigation (jumps with Back and Forward), set by InkViewport when it builds
   * the engine and cleared when it is torn down.
   */
  navigation: ShallowRef<Navigation | null>
  /** Desired tool; InkViewport applies it to the controller. */
  tool: Readonly<Ref<ToolId>>
  setTool(id: ToolId): void
  /** Host tools from InkRoot's `tools` prop; InkViewport registers them. */
  hostTools: Readonly<Ref<Tool[] | undefined>>
  /**
   * The ids of the tools the current viewer was built with, set by InkViewport; `null` while
   * there is none. A tool added to `tools` later is registered from the next build.
   */
  openedToolIds: ShallowRef<readonly ToolId[] | null>
  /** InkRoot's `decorateAnnotation` prop. InkViewport re-applies decorations when it changes. */
  decorateAnnotation: Readonly<Ref<DecorateAnnotation | undefined>>
  /** The font families text boxes offer: InkRoot's `fonts`, else `FONT_FAMILIES`. */
  fonts: Readonly<Ref<readonly string[]>>
  /** The tools' options for InkRoot's life, so they persist across documents. */
  toolOptions: ToolOptions
  /**
   * InkRoot's `storage` (memory by default), fixed for the root's life. The signatures, the
   * plugins' settings and each `InkSidebar`'s width are kept in it.
   */
  storage: InkStorage
  /**
   * InkRoot's `minDocumentWidth` (`MIN_DOCUMENT_WIDTH` by default), fixed for the root's life.
   * Each `InkSidebar` without its own takes it, and the viewer is built with it.
   */
  minDocumentWidth: number
  /** The saved signatures: kept in InkRoot's `storage` under `signatures`. */
  signatures: Readonly<ShallowRef<SignatureLibrary>>
  /** The fonts a typed signature offers: InkRoot's `signatureFonts`, else `SIGNATURE_FONTS`. */
  signatureFonts: Readonly<Ref<readonly string[]>>
  /** The open document's tool style; `null` while no document is open. */
  toolStyle: Readonly<ShallowRef<ToolStyle | null>>
  /** Desired zoom and page from the host's v-models; InkViewport applies and reports back. */
  zoomModel: Readonly<Ref<ZoomValue | undefined>>
  pageModel: Readonly<Ref<number | undefined>>
  reportZoom(z: ZoomValue): void
  reportPage(p: number): void
  /** Last activated annotation (Enter, click with the note tool, etc.). Popovers key off this. */
  activated: Readonly<Ref<string | null>>
  /**
   * Activates annotation `id`, or clears the activation with `null`. This is the context's
   * own: unlike core's `Viewer.setActivated`, it emits InkRoot's `activate` for an id, and it
   * does not check that the id is in the document.
   */
  setActivated(id: string | null): void
  history: InkHistory
  rootEl: Readonly<Ref<HTMLElement | null>>
  /** InkRoot's `formHighlight`; InkViewport reads it when it builds the viewer. */
  formHighlight: Readonly<Ref<boolean | undefined>>
  /** Emits InkRoot's `action`. */
  reportAction(action: ViewerAction): void
  /** Emits InkRoot's `error`, for failures after the document opened (a refused signing). */
  reportError(error: InkError): void
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
