// Freehand ink. A press-drag-release is one stroke; strokes that start within JOIN_GAP_MS of
// the last one join its annotation, so a handwritten word stays one object. Each stroke is its
// own undo step: the first is an `add`, the rest are `update`s that append to `inklist`.
// Switching tools or pressing Escape ends the annotation. Pen and touch report pressure;
// a mouse, or a device that always reports 0 or 0.5, leaves it out.
import { deriveRect } from '../../model/annotations/store'
import { JOIN_GAP_MS } from '../ink-stroke'

import { freehandTool } from './freehand'

import type { Tool, ToolContext } from './controller'
import type { InkAnnotation } from '../../model/annotations/types'
import type { Point } from '../../model/geometry'

/** The annotation later strokes join, until the gap passes or something ends it. */
interface Session {
  id: string
  page: number
  endedAt: number
}

export function drawTool(): Tool {
  let session: Session | undefined

  const join = (
    c: ToolContext,
    ink: InkAnnotation,
    points: Point[],
    pressure: number[] | undefined
  ): void => {
    const inklist = [...ink.inklist, points]
    const next = ink.pressure
      ? [...ink.pressure, pressure ?? points.map(() => 0.5)]
      : undefined
    c.store.update(ink.id, {
      inklist,
      pressure: next,
      rect: deriveRect({ type: 'ink', page: ink.page, inklist, width: ink.width }),
    })
  }

  return freehandTool({
    id: 'draw',
    end() {
      session = undefined
    },
    /** Appends the stroke to the live session's annotation, else starts a new one. */
    commit(c, s) {
      // The gap runs from the last stroke's release to this one's press.
      const joined = session
      const current =
        joined && joined.page === s.page && s.startedAt - joined.endedAt <= JOIN_GAP_MS
          ? c.store.get(joined.id)
          : undefined
      if (current?.type === 'ink' && !current.locked) {
        join(c, current, s.points, s.pressure)
        session = { id: current.id, page: current.page, endedAt: Date.now() }
        return
      }
      const added = c.store.add(
        c.toolStyle.resolve('ink', {
          type: 'ink',
          page: s.page,
          inklist: [s.points],
          ...(s.pressure ? { pressure: [s.pressure] } : {}),
        })
      )
      session = { id: added.id, page: added.page, endedAt: Date.now() }
    },
  })
}
