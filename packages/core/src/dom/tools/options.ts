// Per-tool options (the shape kind, the highlight kind, the chosen signature…). They persist
// per tool for the viewer's life: the engine keeps one registry across rebuilds, so reopening a
// tool, or rebuilding the viewport, keeps its last options.
import { readonly, writable, type Readable, type Writable } from '../../model/readable'

import type { Tool, ToolId } from './controller'

export interface ToolOptions {
  /** The tool's current options. Throws a `RangeError` for an id no tool registered. */
  readable(id: ToolId): Readable<object>
  get(id: ToolId): object
  /** Merges `patch` into the tool's options. */
  merge(id: ToolId, patch: object): void
  /** Registers tools not seen yet, seeded from their `defaultOptions`; known ids keep theirs. */
  register(tools: readonly Tool[]): void
}

export function createToolOptions(tools: readonly Tool[] = []): ToolOptions {
  const byId = new Map<ToolId, Writable<object>>()
  const views = new Map<ToolId, Readable<object>>()

  const entry = (id: ToolId): Writable<object> => {
    const w = byId.get(id)
    if (!w) throw new RangeError(`Unknown tool ${id}`)
    return w
  }

  function register(list: readonly Tool[]): void {
    for (const t of list) {
      if (byId.has(t.id)) continue
      const w = writable<object>({ ...(t.defaultOptions ?? {}) })
      byId.set(t.id, w)
      views.set(t.id, readonly(w))
    }
  }
  register(tools)

  return {
    readable(id) {
      entry(id)
      return views.get(id) as Readable<object>
    },
    get: (id) => entry(id).get(),
    merge(id, patch) {
      const w = entry(id)
      w.set({ ...w.get(), ...patch })
    },
    register,
  }
}
