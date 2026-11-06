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
  CoreToolId,
  PageHit,
  Tool,
  ToolContext,
  ToolController,
  ToolControllerOptions,
  ToolId,
  ToolKind,
} from './controller'
export { hitFor } from './controller'
export type { PagePress, PressKind } from './press'
export { unknownTool } from './unknown'
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

/** Fresh instances of every creation tool, in toolbar order. */
export function allTools(): Tool[] {
  return [
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

/**
 * `select-text` and `select` with a host's tools added by id, a later tool replacing an earlier
 * one with its id.
 */
export function withHostTools(host: readonly Tool[] = []): Tool[] {
  const byId = new Map<ToolId, Tool>([
    ['select-text', selectTextTool()],
    ['select', selectTool()],
  ])
  for (const t of host) byId.set(t.id, t)
  return [...byId.values()]
}

/**
 * Listens on `ctx.root` and routes pointer and key events to the active tool. Without `tools`
 * it has only `select-text` and `select`.
 */
export function createToolController(
  opts: Omit<ToolControllerOptions, 'tools'> & { tools?: Tool[] }
): ToolController {
  return createWith({ ...opts, tools: opts.tools ?? withHostTools() })
}

export interface ToolStyleTracker {
  readonly toolStyle: ToolStyle
  /** Call when the active tool changes: the style's active group follows it. */
  setTool(id: ToolId): void
}

/**
 * A `ToolStyle` whose active group is the style group of the active tool among `tools` (the
 * select tools plus a host's). The engine makes one when it is not handed a style; a binding
 * makes its own per document, so its style controls work before the viewport mounts.
 */
export function trackToolStyle(opts: {
  store: AnnotationStore
  history: { batch(fn: () => void): void }
  /** The creation tools, as passed to `mountViewer`. */
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
