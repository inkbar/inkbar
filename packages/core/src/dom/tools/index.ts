import { createToolStyle, type ToolStyle } from '../../model/annotations/tool-style'
import { writable } from '../../model/readable'

import {
  createToolController as createWith,
  type Tool,
  type ToolControllerOptions,
  type ToolController,
  type ToolId,
} from './controller'
import { drawTool } from './draw'
import { DEFAULT_FREETEXT_WIDTH, freetextTool } from './freetext'
import { highlightTool } from './highlight'
import { noteTool } from './note'
import { redactAreaTool } from './redact-area'
import { selectTool } from './select'
import { selectTextTool } from './select-text'
import { shapeTool } from './shape'
import { signatureTool } from './signature'
import { sketchTool } from './sketch'

import type { AnnotationStore } from '../../model/annotations/store'

export type {
  BuiltinToolId,
  PageHit,
  Tool,
  ToolContext,
  ToolController,
  ToolControllerOptions,
  ToolId,
  ToolKind,
} from './controller'
export { hitFor } from './controller'
export { createToolOptions, type ToolOptions } from './options'
export {
  DEFAULT_FREETEXT_WIDTH,
  drawTool,
  freetextTool,
  highlightTool,
  noteTool,
  redactAreaTool,
  selectTextTool,
  selectTool,
  shapeTool,
  signatureTool,
  sketchTool,
}
export type { SignatureOptions } from './signature'
export {
  DEFAULT_HIGHLIGHT_OPTIONS,
  MARKUP_KINDS,
  type HighlightOptions,
  type MarkupKind,
} from './highlight'
export {
  DEFAULT_CORNER_RADIUS,
  DEFAULT_SHAPE_SIZE,
  SHAPE_KINDS,
  type ShapeKind,
  type ShapeOptions,
} from './shape'

/** Fresh instances of every built-in tool. */
export function builtinTools(): Tool[] {
  return [
    selectTextTool(),
    selectTool(),
    highlightTool(),
    redactAreaTool(),
    sketchTool(),
    drawTool(),
    noteTool(),
    shapeTool(),
    freetextTool(),
    signatureTool(),
  ]
}

/** The built-in tools with a host's tools added, a host tool replacing a built-in by id. */
export function withHostTools(host: readonly Tool[] = []): Tool[] {
  const byId = new Map(builtinTools().map((t) => [t.id, t]))
  for (const t of host) byId.set(t.id, t)
  return [...byId.values()]
}

/** Listens on `ctx.root` and routes pointer and key events to the active tool. */
export function createToolController(
  opts: Omit<ToolControllerOptions, 'tools'> & { tools?: Tool[] }
): ToolController {
  return createWith({ ...opts, tools: opts.tools ?? builtinTools() })
}

export interface ToolStyleTracker {
  readonly toolStyle: ToolStyle
  /** Call when the active tool changes: the style's active group follows it. */
  setTool(id: ToolId): void
}

/**
 * A `ToolStyle` whose active group is the style group of the active tool among `tools` (the
 * built-ins plus a host's). The engine makes one when it is not handed a style; a binding
 * makes its own per document, so its style controls work before the viewport mounts.
 */
export function trackToolStyle(opts: {
  store: AnnotationStore
  history: { batch(fn: () => void): void }
  /** Host tools, as passed to `mountViewer`. */
  tools?: readonly Tool[] | undefined
  tool?: ToolId | undefined
}): ToolStyleTracker {
  const groups = new Map(withHostTools(opts.tools).map((t) => [t.id, t.styleGroup]))
  const active = writable<ToolId>(opts.tool ?? 'select-text')
  const toolStyle = createToolStyle({
    store: opts.store,
    history: opts.history,
    activeGroup: () => groups.get(active.get()),
    active,
  })
  return { toolStyle, setTool: (id) => active.set(id) }
}
