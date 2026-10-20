// Freehand stroke capture, shared by `draw` and `sketch`. A press-drag-release is one stroke:
// samples come from coalesced pointer events where the browser has them, with pen and touch
// pressure, and a live preview paints the stroke as the ink it will become. The tool decides
// what a finished stroke writes.
import { outlinePath, strokeOutline } from '../ink-stroke'

import {
  clampedCssIn,
  type PageHit,
  type Tool,
  type ToolContext,
  type ToolId,
} from './controller'

import type { AnnotationInput } from '../../model/annotations/types'
import type { Point } from '../../model/geometry'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** A finished stroke, in user space. */
export interface FreehandStroke {
  page: number
  points: Point[]
  /**
   * One value per point, 0 to 1, from a pen or touch that reports real pressure; undefined for
   * a mouse, or a device that only ever reports 0 or 0.5.
   */
  pressure: number[] | undefined
  /** When the press happened (`Date.now()`). */
  startedAt: number
}

export interface FreehandOptions {
  id: ToolId
  /** Writes a finished stroke. */
  commit(ctx: ToolContext, stroke: FreehandStroke): void
  /** Escape, or the tool deactivating. */
  end?(): void
  /** The tool deactivating (a tool switch, or the controller's destroy). */
  deactivate?(): void
}

/** A stroke being drawn: its page, and each sample in CSS px (host-relative) and user space. */
interface Stroke {
  from: PageHit
  css: Point[]
  user: Point[]
  /** One value per sample for pen and touch, else undefined. */
  pressure: number[] | undefined
  startedAt: number
}

/** Pressure from a device that reports it, else undefined. */
function pressureOf(e: PointerEvent): number | undefined {
  if (e.pointerType !== 'pen' && e.pointerType !== 'touch') return undefined
  // Two decimals: the device's float32 noise has no place in the saved file.
  return Math.round(Math.min(Math.max(e.pressure, 0), 1) * 100) / 100
}

/** True when the samples carry real pressure: not all 0 or 0.5, the values of a device with none. */
function reportsPressure(samples: readonly number[]): boolean {
  return samples.some((p) => p !== 0 && p !== 0.5)
}

/**
 * A tool in the `ink` style group that captures freehand strokes and previews them in
 * `.ink-draft[data-ink-draft=<id>]`.
 */
export function freehandTool(opts: FreehandOptions): Tool {
  let ctx: ToolContext | undefined
  let stroke: Stroke | undefined
  let draft: HTMLElement | undefined

  const clear = (): void => {
    draft?.remove()
    draft = undefined
    stroke = undefined
  }

  /** Adds a sample. A release reports 0 pressure, so it repeats the last sample's instead. */
  const sample = (s: Stroke, e: PointerEvent, release = false): void => {
    const css = clampedCssIn(s.from.host, e)
    s.css.push(css)
    s.user.push(s.from.transform.fromCss(css))
    const p = release ? s.pressure?.[s.pressure.length - 1] : pressureOf(e)
    if (p !== undefined) (s.pressure ??= []).push(p)
  }

  const paint = (c: ToolContext, s: Stroke): void => {
    const host = s.from.host
    const doc = host.ownerDocument
    if (!draft) {
      draft = doc.createElement('div')
      draft.className = 'ink-draft'
      draft.dataset.inkDraft = opts.id
      draft.style.position = 'absolute'
      draft.style.pointerEvents = 'none'
      draft.style.left = '0'
      draft.style.top = '0'
      host.append(draft)
    }
    draft.style.width = `${host.clientWidth}px`
    draft.style.height = `${host.clientHeight}px`
    const blank: AnnotationInput & { type: 'ink' } = {
      type: 'ink',
      page: s.from.page,
      inklist: [[]],
    }
    const style = c.toolStyle.resolve('ink', blank)
    const path = doc.createElementNS(SVG_NS, 'path')
    path.setAttribute(
      'd',
      outlinePath(
        strokeOutline(s.css, s.pressure, s.from.transform.toCssLength(style.width ?? 2))
      )
    )
    path.setAttribute('fill', style.color ?? '#000000')
    if (style.opacity !== undefined) path.setAttribute('opacity', String(style.opacity))
    const svg = doc.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('width', String(host.clientWidth))
    svg.setAttribute('height', String(host.clientHeight))
    svg.style.overflow = 'visible'
    svg.append(path)
    draft.replaceChildren(svg)
  }

  return {
    id: opts.id,
    cursor: 'crosshair',
    styleGroup: 'ink',
    activate(c) {
      ctx = c
    },
    deactivate() {
      clear()
      opts.end?.()
      opts.deactivate?.()
      ctx = undefined
    },
    onPointerDown(e, hit) {
      if (!hit) return
      stroke = {
        from: hit,
        css: [],
        user: [],
        pressure: undefined,
        startedAt: Date.now(),
      }
      sample(stroke, e)
      // Drawing over an annotation draws; it neither selects it nor starts a text selection.
      e.stopPropagation()
      e.preventDefault()
      return true
    },
    onPointerMove(e) {
      if (!ctx || !stroke) return
      // No button down: the release was missed, so drop the stroke. A host scrolled out of the
      // mounted range is gone with it.
      if (e.buttons === 0 || !stroke.from.host.isConnected) {
        clear()
        return
      }
      const coalesced = e.getCoalescedEvents?.() ?? []
      for (const ev of coalesced.length > 0 ? coalesced : [e]) sample(stroke, ev)
      paint(ctx, stroke)
    },
    onPointerCancel() {
      clear()
    },
    onPointerUp(e) {
      if (!ctx || !stroke) return
      const s = stroke
      if (!s.from.host.isConnected) {
        clear()
        return
      }
      const last = s.css[s.css.length - 1]!
      const end = clampedCssIn(s.from.host, e)
      if (end.x !== last.x || end.y !== last.y) sample(s, e, true)
      clear()
      opts.commit(ctx, {
        page: s.from.page,
        points: s.user,
        pressure: s.pressure && reportsPressure(s.pressure) ? s.pressure : undefined,
        startedAt: s.startedAt,
      })
    },
    onKeyDown(e) {
      if (e.key === 'Escape') opts.end?.()
    },
  }
}
