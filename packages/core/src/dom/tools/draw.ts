// Freehand ink. A press-drag-release is one stroke; strokes that start within JOIN_GAP_MS of
// the last one join its annotation, so a handwritten word stays one object. Each stroke is its
// own undo step: the first is an `add`, the rest are `update`s that append to `inklist`.
// Switching tools or pressing Escape ends the annotation. Pen and touch report pressure;
// a mouse, or a device that always reports 0 or 0.5, leaves it out.
import { deriveRect } from '../../model/annotations/store'
import { JOIN_GAP_MS, outlinePath, strokeOutline } from '../ink-stroke'

import { clampedCssIn, type PageHit, type Tool, type ToolContext } from './controller'

import type { AnnotationInput, InkAnnotation } from '../../model/annotations/types'
import type { Point } from '../../model/geometry'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** A stroke being drawn: its page, and each sample in CSS px (host-relative) and user space. */
interface Stroke {
  from: PageHit
  css: Point[]
  user: Point[]
  /** One value per sample for pen and touch, else undefined. */
  pressure: number[] | undefined
  /** When the press happened: the gap to the last stroke runs to here, not to the release. */
  startedAt: number
}

/** The annotation later strokes join, until the gap passes or something ends it. */
interface Session {
  id: string
  page: number
  endedAt: number
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

export function drawTool(): Tool {
  let ctx: ToolContext | undefined
  let stroke: Stroke | undefined
  let draft: HTMLElement | undefined
  let session: Session | undefined

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
      draft.dataset.inkDraft = 'draw'
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

  /** Writes a finished stroke: appended to the live session's annotation, else a new one. */
  const commit = (c: ToolContext, s: Stroke): void => {
    const pressure = s.pressure && reportsPressure(s.pressure) ? s.pressure : undefined
    const joined = session
    const current =
      joined && joined.page === s.from.page && s.startedAt - joined.endedAt <= JOIN_GAP_MS
        ? c.store.get(joined.id)
        : undefined
    if (current?.type === 'ink' && !current.locked) {
      join(c, current, s.user, pressure)
      session = { id: current.id, page: current.page, endedAt: Date.now() }
      return
    }
    const added = c.store.add(
      c.toolStyle.resolve('ink', {
        type: 'ink',
        page: s.from.page,
        inklist: [s.user],
        ...(pressure ? { pressure: [pressure] } : {}),
      })
    )
    session = { id: added.id, page: added.page, endedAt: Date.now() }
  }

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

  return {
    id: 'draw',
    cursor: 'crosshair',
    styleGroup: 'ink',
    activate(c) {
      ctx = c
    },
    deactivate() {
      clear()
      session = undefined
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
      commit(ctx, s)
      clear()
    },
    onKeyDown(e) {
      if (e.key === 'Escape') session = undefined
    },
  }
}
