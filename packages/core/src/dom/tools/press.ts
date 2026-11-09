// Press and long-press detection for one pointer at a time. The tool controller decides which
// presses count (see the top of controller.ts) and feeds them in; this only times and measures.
//
// A press is a pointer that goes down and up without moving more than the slop. A touch or pen
// held still for `longPressMs` is a long press instead: it fires while the pointer is still
// down, and that pointer's release then reports nothing. Mouse never long-presses. Distances are
// client px, so page zoom does not change how far a finger may wander.

import type { Point } from '../../model/geometry'

export type PressKind = 'press' | 'long-press'

/** A press on a page that nothing in Inkbar acted on. */
export interface PagePress {
  /** Zero-based page index. */
  page: number
  /** PDF user space on that page, points, origin bottom-left, before /Rotate. */
  point: Point
  pointerType: 'mouse' | 'touch' | 'pen'
}

export interface PressTracker {
  /** Starts tracking `e`'s pointer, dropping any press already under way. */
  down(e: PointerEvent, press: PagePress): void
  move(e: PointerEvent): void
  up(e: PointerEvent): void
  /** Drops the press under way, if any, without reporting it. */
  cancel(): void
  destroy(): void
}

export interface PressTrackerOptions {
  onPress(press: PagePress): void
  onLongPress(press: PagePress): void
  /** Default 500. */
  longPressMs?: number
  /**
   * How far, in client px, a pointer may move and still press. Default 10 for touch and pen,
   * 4 for mouse.
   */
  slop?: (pointerType: string) => number
}

/** How far, in client px, a touch or pen may move and still count as a tap. */
export const TOUCH_SLOP = 10

const defaultSlop = (pointerType: string): number =>
  pointerType === 'mouse' ? 4 : TOUCH_SLOP

export function createPressTracker(opts: PressTrackerOptions): PressTracker {
  const longPressMs = opts.longPressMs ?? 500
  const slopFor = opts.slop ?? defaultSlop
  let live:
    | {
        pointerId: number
        x: number
        y: number
        slop: number
        press: PagePress
        timer: ReturnType<typeof setTimeout> | undefined
        /** The long press fired: the release reports nothing. */
        done: boolean
      }
    | undefined

  function cancel(): void {
    if (live?.timer !== undefined) clearTimeout(live.timer)
    live = undefined
  }

  return {
    down(e, press) {
      cancel()
      const l: NonNullable<typeof live> = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        slop: slopFor(press.pointerType),
        press,
        timer: undefined,
        done: false,
      }
      if (press.pointerType !== 'mouse')
        l.timer = setTimeout(() => {
          l.timer = undefined
          l.done = true
          opts.onLongPress(press)
        }, longPressMs)
      live = l
    },
    move(e) {
      if (live?.pointerId !== e.pointerId) return
      if (Math.hypot(e.clientX - live.x, e.clientY - live.y) > live.slop) cancel()
    },
    up(e) {
      if (live?.pointerId !== e.pointerId) return
      const { press, done } = live
      cancel()
      if (!done) opts.onPress(press)
    },
    cancel,
    destroy: cancel,
  }
}
