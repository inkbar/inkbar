import {
  createToolController as createWith,
  type Tool,
  type ToolControllerOptions,
  type ToolController,
} from './controller'
import { highlightTool } from './highlight'
import { noteTool } from './note'
import { redactAreaTool } from './redact-area'
import { selectTool } from './select'
import { viewTool } from './view'

export type {
  PageHit,
  Tool,
  ToolContext,
  ToolController,
  ToolControllerOptions,
  ToolId,
} from './controller'
export { hitFor } from './controller'
export { highlightTool, noteTool, redactAreaTool, selectTool, viewTool }

/** Fresh instances of every built-in tool. */
export function builtinTools(): Tool[] {
  return [viewTool(), selectTool(), highlightTool(), redactAreaTool(), noteTool()]
}

/** Listens on `ctx.root` and routes pointer and key events to the active tool. */
export function createToolController(
  opts: Omit<ToolControllerOptions, 'tools'> & { tools?: Tool[] }
): ToolController {
  return createWith({ ...opts, tools: opts.tools ?? builtinTools() })
}
