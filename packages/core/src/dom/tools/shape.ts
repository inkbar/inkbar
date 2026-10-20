// Drag draws a shape between the press and the release; a click, or Enter on the viewport,
// places a default-size one. Enter places no loupe or mask: they are pointer-only. The live
// draft is `position:absolute; pointer-events:none`, a box over the shape's bounds holding an
// SVG preview: geometry only, the look comes from the theme
// (`.ink-draft[data-ink-draft='shape']`).
import {
  calloutStroke,
  freeTextBox,
  withCalloutBounds,
} from '../../model/annotations/callout'
import { isBubble } from '../../model/annotations/edit'
import {
  constrain,
  DEFAULT_SHAPE_OPTIONS,
  defaultEnds,
  isPointerOnlyKind,
  shapeInput,
  type ShapeOptions,
} from '../../model/annotations/shape-geometry'
import { closedEditor, editFreeTextIn } from '../freetext-editor'

import {
  clampedCssIn,
  isViewportEnter,
  type PageHit,
  type Tool,
  type ToolContext,
} from './controller'

import type {
  Annotation,
  AnnotationInput,
  FreeTextAnnotation,
} from '../../model/annotations/types'
import type { Point } from '../../model/geometry'

export {
  DEFAULT_CORNER_RADIUS,
  DEFAULT_SHAPE_SIZE,
  SHAPE_KINDS,
  type ShapeKind,
  type ShapeOptions,
} from '../../model/annotations/shape-geometry'

/** Smallest drag, in CSS px on its longer axis, that draws a shape rather than counting as a click. */
const MIN_CSS = 3

const SVG_NS = 'http://www.w3.org/2000/svg'

export function shapeTool(): Tool<ShapeOptions> {
  let ctx: ToolContext | undefined
  let start: PageHit | undefined
  let draft: HTMLElement | undefined

  const clear = (): void => {
    draft?.remove()
    draft = undefined
    start = undefined
  }

  const options = (c: ToolContext): ShapeOptions => ({
    ...DEFAULT_SHAPE_OPTIONS,
    ...c.options<ShapeOptions>(),
  })

  /** The input for a drag from `a` to `b` (user space), with Shift's constraint applied. */
  const inputFor = (
    c: ToolContext,
    page: number,
    a: Point,
    b: Point,
    shift: boolean
  ): AnnotationInput | undefined => {
    const o = options(c)
    return shapeInput(o.kind, page, a, shift ? constrain(o.kind, a, b) : b, o)
  }

  /** The input with the shape group's style and, for a bubble, the text group's text style. */
  const styled = (c: ToolContext, input: AnnotationInput): AnnotationInput => {
    if (input.type === 'line') {
      // The line style menu's ends win; until it picks them an arrow has an open tail.
      const line = c.toolStyle.resolve('shape', input)
      const arrow = input.intent === 'LineArrow'
      return {
        ...line,
        head: line.head ?? 'None',
        tail: line.tail ?? (arrow ? 'OpenArrow' : 'None'),
      }
    }
    if (input.type !== 'freetext') return c.toolStyle.resolve('shape', input)
    // The group's width must not lose to the bubble's default one, so it is filled last.
    const shape = c.toolStyle.resolve('shape', { ...input, width: undefined })
    const blank: AnnotationInput & { type: 'freetext' } = {
      type: 'freetext',
      page: input.page,
      contents: '',
    }
    const text = c.toolStyle.resolve('text', blank)
    const out = {
      ...shape,
      width: shape.width ?? input.width,
      defaultStyle: { ...text.defaultStyle, ...input.defaultStyle },
    }
    if (!input.callout || !input.rect) return out
    // The bounds were fit to the bubble's default width: refit them to the group's.
    const box = freeTextBox({ rect: input.rect, fringe: input.fringe })
    const { width } = calloutStroke(out as FreeTextAnnotation)
    return { ...out, ...withCalloutBounds(box, input.callout, width, input.head) }
  }

  /** Stops waiting for a bubble the host has not applied yet. */
  let waiting: (() => void) | undefined

  const openEditor = (c: ToolContext, a: Annotation): boolean => {
    const el = c.root.querySelector<HTMLElement>(
      `[data-annotation="${CSS.escape(a.id)}"]`
    )
    return (
      el !== null &&
      editFreeTextIn(c.store, el, a.id, c.viewport.transformFor(a.page)) !== undefined
    )
  }

  /**
   * Opens the in-place editor on a new bubble. When a controlled host has not applied it yet,
   * the editor opens once it does.
   */
  const edit = (c: ToolContext, a: Annotation): void => {
    waiting?.()
    waiting = undefined
    if (openEditor(c, a)) return
    const stop = c.store.list.subscribe(() => {
      if (!c.store.get(a.id)) return
      stop()
      if (waiting === stop) waiting = undefined
      openEditor(c, a)
    })
    waiting = stop
  }

  const add = (c: ToolContext, input: AnnotationInput | undefined): void => {
    if (!input) return
    const created = c.store.add(styled(c, input))
    c.store.select([created.id])
    if (isBubble(created)) edit(c, created)
  }

  const paint = (c: ToolContext, from: PageHit, e: PointerEvent): void => {
    const css = clampedCssIn(from.host, e)
    const user = from.transform.fromCss(css)
    const input = inputFor(c, from.page, from.user, user, e.shiftKey)
    if (!input) return
    const t = from.transform
    let box: { left: number; top: number; width: number; height: number }
    let points: Point[] | undefined
    let kind: 'rect' | 'ellipse' | 'path' = 'path'
    if (
      input.type === 'square' ||
      input.type === 'circle' ||
      input.type === 'freetext' ||
      input.type === 'loupe' ||
      input.type === 'mask'
    ) {
      if (!input.rect) return
      // A bubble previews its text box; its tail comes with the bubble itself.
      box = t.toCssRect(
        input.type === 'freetext'
          ? freeTextBox({ rect: input.rect, fringe: input.fringe })
          : input.rect
      )
      kind =
        input.type === 'circle' ||
        input.type === 'loupe' ||
        (input.type === 'mask' && input.shape === 'ellipse')
          ? 'ellipse'
          : 'rect'
    } else {
      if (input.type === 'line') points = [t.toCss(input.start), t.toCss(input.end)]
      else if (input.type === 'polygon') points = input.vertices.map((v) => t.toCss(v))
      else return
      const xs = points.map((p) => p.x)
      const ys = points.map((p) => p.y)
      const left = Math.min(...xs)
      const top = Math.min(...ys)
      box = {
        left,
        top,
        width: Math.max(...xs) - left,
        height: Math.max(...ys) - top,
      }
    }
    if (!draft) {
      draft = from.host.ownerDocument.createElement('div')
      draft.className = 'ink-draft'
      draft.dataset.inkDraft = 'shape'
      draft.style.position = 'absolute'
      draft.style.pointerEvents = 'none'
      from.host.append(draft)
    }
    draft.dataset.inkShape = options(c).kind
    draft.style.left = `${box.left}px`
    draft.style.top = `${box.top}px`
    draft.style.width = `${box.width}px`
    draft.style.height = `${box.height}px`
    const doc = from.host.ownerDocument
    const svg = doc.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('width', String(box.width))
    svg.setAttribute('height', String(box.height))
    svg.style.overflow = 'visible'
    const node =
      kind === 'path'
        ? doc.createElementNS(SVG_NS, input.type === 'line' ? 'polyline' : 'polygon')
        : doc.createElementNS(SVG_NS, kind)
    if (kind === 'path') {
      node.setAttribute(
        'points',
        (points ?? []).map((p) => `${p.x - box.left},${p.y - box.top}`).join(' ')
      )
    } else if (kind === 'ellipse') {
      node.setAttribute('cx', String(box.width / 2))
      node.setAttribute('cy', String(box.height / 2))
      node.setAttribute('rx', String(box.width / 2))
      node.setAttribute('ry', String(box.height / 2))
    } else {
      node.setAttribute('width', String(box.width))
      node.setAttribute('height', String(box.height))
      if ((input.type === 'square' || input.type === 'freetext') && input.cornerRadius)
        node.setAttribute('rx', String(t.toCssLength(input.cornerRadius)))
    }
    svg.append(node)
    draft.replaceChildren(svg)
  }

  return {
    id: 'shape',
    cursor: 'crosshair',
    styleGroup: 'shape',
    defaultOptions: { ...DEFAULT_SHAPE_OPTIONS },
    activate(c) {
      ctx = c
    },
    deactivate() {
      clear()
      waiting?.()
      waiting = undefined
      ctx = undefined
    },
    onPointerDown(e, hit, annotationId) {
      // A press that ended a bubble's edit only ends it.
      if (!hit || annotationId !== undefined || closedEditor(e)) return
      start = hit
      // Keeps the press from starting a text selection.
      e.preventDefault()
      return true
    },
    onPointerMove(e) {
      if (!ctx || !start) return
      // No button down: the release was missed, so drop the draft. A host scrolled out of the
      // mounted range is gone with it.
      if (e.buttons === 0 || !start.host.isConnected) {
        clear()
        return
      }
      paint(ctx, start, e)
    },
    onPointerCancel() {
      clear()
    },
    onPointerUp(e) {
      if (!ctx || !start) return
      const from = start
      if (!from.host.isConnected) {
        clear()
        return
      }
      const css = clampedCssIn(from.host, e)
      const long = Math.max(Math.abs(css.x - from.css.x), Math.abs(css.y - from.css.y))
      if (long >= MIN_CSS) {
        add(
          ctx,
          inputFor(ctx, from.page, from.user, from.transform.fromCss(css), e.shiftKey)
        )
      } else {
        const [a, b] = defaultEnds(
          options(ctx).kind,
          from.user,
          from.transform.page.rotate
        )
        add(ctx, inputFor(ctx, from.page, a, b, false))
      }
      clear()
    },
    onKeyDown(e) {
      if (!ctx || !isViewportEnter(e, ctx.root)) return
      // The loupe and the mask are pointer-only, like area redaction.
      if (isPointerOnlyKind(options(ctx).kind)) return
      e.preventDefault()
      const page = ctx.viewport.currentPage.get()
      const { box, rotate } = ctx.viewport.transformFor(page).page
      const [a, b] = defaultEnds(
        options(ctx).kind,
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        rotate
      )
      add(ctx, inputFor(ctx, page, a, b, false))
    },
  }
}
