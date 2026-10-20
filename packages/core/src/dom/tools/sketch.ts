// Freehand ink that tidies itself. It captures and previews strokes as `draw` does, but each
// stroke stands alone: sketch never joins strokes. On release the stroke is added as ink, then
// `recogniseStroke` scores it; a fit at `RECOGNISE_THRESHOLD` or better replaces the ink with
// the clean shape, styled from the `shape` group. Two undo steps: the ink, then the swap (one
// `history.batch`), so one undo brings the stroke back and a second removes it.
//
// A controlled host applies the ink later, or never. The swap waits until the ink is in the
// list, then a task more, so the host's own history records the ink as a step before the swap.
// Deactivating the tool cancels a swap still waiting.
import { DEFAULT_SHAPE_OPTIONS, shapeInput } from '../../model/annotations/shape-geometry'
import {
  recogniseStroke,
  RECOGNISE_THRESHOLD,
  type Recognised,
} from '../../model/recognise'

import { freehandTool } from './freehand'

import type { Tool, ToolContext } from './controller'
import type { AnnotationInput } from '../../model/annotations/types'

/** How long the swap waits for a controlled host to apply the ink before giving up. */
const APPLY_WAIT_MS = 2000

/**
 * The smallest stroke, in CSS px across its longer side, that can become a shape. A click or
 * its jitter stays a dot of ink, as with `draw`, rather than an invisible sliver of a line.
 */
const MIN_SHAPE_PX = 4

/** The longer side of the box `points` span, in the units they are in. */
function extent(points: readonly { x: number; y: number }[]): number {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
}

/** The annotation a recognised stroke becomes. */
function recognisedInput(shape: Recognised, page: number): AnnotationInput | undefined {
  switch (shape.kind) {
    case 'line':
    case 'arrow':
      return shapeInput(shape.kind, page, shape.start, shape.end, DEFAULT_SHAPE_OPTIONS)
    case 'rectangle':
    case 'ellipse': {
      const { x, y, width, height } = shape.rect
      return shapeInput(
        shape.kind,
        page,
        { x, y },
        { x: x + width, y: y + height },
        DEFAULT_SHAPE_OPTIONS
      )
    }
    // The recogniser already tidied the vertices: a polygon keeps the corners the stroke had,
    // a star is regular.
    case 'polygon':
    case 'star':
      return { type: 'polygon', page, vertices: shape.vertices }
  }
}

/**
 * Runs `fn` once the annotation `id` is in the list and the host has had a task to record it.
 * Gives up (calling `onGiveUp`) when the host has not applied it in `APPLY_WAIT_MS`. Returns a
 * cancel that drops whatever is still pending.
 */
function whenApplied(
  c: ToolContext,
  id: string,
  fn: () => void,
  onGiveUp: () => void
): () => void {
  if (c.store.get(id)) {
    fn()
    return () => undefined
  }
  let swap: ReturnType<typeof setTimeout> | undefined
  // Every timer and the subscription exist before anything can call `cancel`.
  const giveUp = setTimeout(() => {
    cancel()
    onGiveUp()
  }, APPLY_WAIT_MS)
  let stop: (() => void) | undefined = c.store.list.subscribe(() => {
    if (!c.store.get(id)) return
    cancel()
    swap = setTimeout(fn, 0)
  })
  function cancel(): void {
    stop?.()
    stop = undefined
    clearTimeout(giveUp)
    clearTimeout(swap)
  }
  return cancel
}

export function sketchTool(): Tool {
  /** Cancels for swaps still waiting on a controlled host. */
  const pending = new Set<() => void>()
  return freehandTool({
    id: 'sketch',
    // Switching tools or tearing the viewer down drops any swap still waiting: the stroke
    // stays ink, and nothing fires against a store that may be gone.
    deactivate() {
      for (const cancel of pending) cancel()
      pending.clear()
    },
    commit(c, s) {
      const ink = c.store.add(
        c.toolStyle.resolve('ink', {
          type: 'ink',
          page: s.page,
          inklist: [s.points],
          ...(s.pressure ? { pressure: [s.pressure] } : {}),
        })
      )
      if (c.viewport.transformFor(s.page).toCssLength(extent(s.points)) < MIN_SHAPE_PX)
        return
      const fit = recogniseStroke(s.points)
      if (!fit || fit.score < RECOGNISE_THRESHOLD) return
      const input = recognisedInput(fit.shape, s.page)
      if (!input) return
      const shape = c.toolStyle.resolve('shape', input)
      const batch = (fn: () => void): void => (c.history ? c.history.batch(fn) : fn())
      // Uncontrolled, the swap runs straight away, before `whenApplied` returns.
      let ran = false
      let cancel = (): void => undefined
      cancel = whenApplied(
        c,
        ink.id,
        () => {
          ran = true
          pending.delete(cancel)
          // Undone, or changed, before the swap: leave the stroke as it is. A host may hand back
          // copies, so the check is by modification time, not identity.
          if (c.store.get(ink.id)?.modifiedAt !== ink.modifiedAt) return
          batch(() => {
            c.store.remove(ink.id)
            c.store.add(shape)
          })
        },
        () => pending.delete(cancel)
      )
      if (!ran) pending.add(cancel)
    },
  })
}
