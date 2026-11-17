import { unionRects } from '../../geometry'
import { calloutStroke, freeTextBox, isStandardCallout } from '../callout'
import { isBubble, WEDGE_HALF } from '../edit'
import { isKnown, LINE_ENDINGS } from '../pdf-names'

import { paintedRect, strokeInset } from './extent'
import { endingItem } from './lines'
import { layoutText } from './text/layout'
import { resolveFont } from './text/measure'

import type { Point, Rect } from '../../geometry'
import type { FreeTextAnnotation } from '../types'
import type {
  DrawContext,
  DrawItem,
  Drawing,
  Paint,
  PathCommand,
  TextLine,
} from './types'

type Angle = 0 | 90 | 180 | 270

/** Padding of a speech bubble's text, as a multiple of the font size: vertical and horizontal. */
const BUBBLE_PAD_Y = 0.4
const BUBBLE_PAD_X = 0.6
/** An underline's centre below the baseline, and its thickness, as a multiple of the font size. */
export const UNDERLINE_OFFSET = 0.1
export const UNDERLINE_THICKNESS = 0.05

/**
 * Where a text box's text goes, in user space. The text is upright for the page as the file
 * displays it, so the box is laid out as the page shows it: `width` is across the displayed
 * box and `height` down it, and `dir` and `down` are the text's own axes in user space.
 */
export interface TextFrame {
  angle: Angle
  /** The direction a line of text runs, a unit vector. */
  dir: Point
  /** The direction the next line is in, a unit vector. */
  down: Point
  /** The top-left corner of the displayed box. */
  topLeft: Point
  /** The displayed box's size, border included. */
  width: number
  height: number
  /** The border and padding between the box and its text area, across and down. */
  inset: { x: number; y: number }
  /** The text area: where lines wrap and clip, in the same terms. */
  area: { topLeft: Point; width: number; height: number }
}

export const AXES: Record<Angle, { dir: Point; down: Point }> = {
  0: { dir: { x: 1, y: 0 }, down: { x: 0, y: -1 } },
  90: { dir: { x: 0, y: 1 }, down: { x: 1, y: 0 } },
  180: { dir: { x: -1, y: 0 }, down: { x: 0, y: 1 } },
  270: { dir: { x: 0, y: -1 }, down: { x: -1, y: 0 } },
}

/** The border a box draws inside itself, in points: none for a speech bubble, whose outline is a path. */
const borderOf = (a: FreeTextAnnotation): number =>
  !isBubble(a) && a.width > 0 ? a.width : 0

/** `p` moved `by` along `v`. */
const along = (p: Point, v: Point, by: number): Point => ({
  x: p.x + v.x * by,
  y: p.y + v.y * by,
})

/**
 * The frame of `a`'s text box on a page turned by `rotate`: the box (`rect` inset by `fringe`)
 * and the area inside its border, or inside a bubble's padding, where text is laid out.
 */
export function freeTextFrame(
  a: FreeTextAnnotation,
  rotate: Angle,
  box: Rect = freeTextBox(a)
): TextFrame {
  const { dir, down } = AXES[rotate]
  const sideways = rotate === 90 || rotate === 270
  const width = sideways ? box.height : box.width
  const height = sideways ? box.width : box.height
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const topLeft = along(along(centre, dir, -width / 2), down, -height / 2)
  const border = borderOf(a)
  const size = a.defaultStyle.fontSize
  const inset = isBubble(a)
    ? { x: BUBBLE_PAD_X * size, y: BUBBLE_PAD_Y * size }
    : { x: border, y: border }
  return {
    angle: rotate,
    dir,
    down,
    topLeft,
    width,
    height,
    inset,
    area: {
      topLeft: along(along(topLeft, dir, inset.x), down, inset.y),
      width: Math.max(0, width - inset.x * 2),
      height: Math.max(0, height - inset.y * 2),
    },
  }
}

/** The text box of `a`: a box, and for a callout its leader line and ending, or a bubble. */
export function describeFreeText(a: FreeTextAnnotation, context: DrawContext): Drawing {
  const box = freeTextBox(a)
  const frame = freeTextFrame(a, context.page.rotate, box)
  const border = borderOf(a)
  const items: DrawItem[] = []

  if (isStandardCallout(a)) {
    const stroke = calloutStroke(a)
    items.push({
      kind: 'polyline',
      role: 'callout-line',
      points: a.callout,
      paint: {
        stroke: {
          color: stroke.color,
          width: stroke.width,
          ...(a.dashes?.length ? { dashes: a.dashes } : {}),
          join: 'round',
          cap: 'butt',
        },
      },
    })
    const head = a.head
    if (head !== undefined && isKnown(LINE_ENDINGS, head)) {
      const ending = endingItem(
        head,
        a.callout[0]!,
        a.callout[1]!,
        stroke.width,
        stroke.color,
        'ending-head'
      )
      if (ending) items.push(ending)
    }
  }

  const inner: DrawItem[] = []
  if (isBubble(a)) {
    inner.push({
      kind: 'path',
      role: 'bubble',
      commands: bubbleCommands(a, box),
      paint: outline(a, a.color),
    })
  } else {
    const radius = a.cornerRadius
    // The fill covers the whole box, under the border, as CSS paints a background; the border is
    // its own rule inset by half its width, so a dashed one leaves the fill showing in its gaps.
    const reach = Math.min(box.width, box.height) / 2
    const outer = radius ? Math.min(radius, reach) : 0
    inner.push({
      kind: 'rect',
      role: 'box',
      rect: box,
      ...(outer > 0 ? { radius: outer } : {}),
      paint: a.color ? { fill: { color: a.color } } : {},
    })
    if (border > 0) {
      const { inset: rect } = strokeInset(box, border)
      const r = radius
        ? Math.min(
            Math.max(0, radius - border / 2),
            Math.min(rect.width, rect.height) / 2
          )
        : 0
      inner.push({
        kind: 'rect',
        role: 'border',
        rect,
        ...(r > 0 ? { radius: r } : {}),
        paint: outline(a, undefined),
      })
    }
  }
  inner.push(textItem(a, context, frame, box, border))
  items.push(...inner)

  // The rect, and what reaches past it: a callout's line and ending, a bubble's wedge and its
  // outline, which is centred on the box edge.
  const painted = items.flatMap((i) => paintedRect(i) ?? [])
  return {
    layer: 'annotation',
    bounds: unionRects([a.rect, ...painted]),
    items: [{ kind: 'group', opacity: a.opacity, items }],
  }
}

/** Fill and border of the box or bubble: the border is drawn only at a width above 0. */
function outline(a: FreeTextAnnotation, fill: string | undefined): Paint {
  return {
    ...(fill ? { fill: { color: fill } } : {}),
    ...(a.width > 0
      ? {
          stroke: {
            color: a.borderColor ?? a.defaultStyle.color,
            width: a.width,
            ...(a.dashes?.length ? { dashes: a.dashes } : {}),
            ...(isBubble(a) ? { join: 'round' as const } : {}),
          },
        }
      : {}),
  }
}

/** `a`'s text laid out in an area `width` points across, with the font it is set in. */
function layoutOf(
  a: FreeTextAnnotation,
  context: DrawContext,
  width: number,
  contents: string
) {
  const s = a.defaultStyle
  const font = resolveFont(
    s.fontFamily,
    s.fontWeight === 'bold',
    s.fontStyle === 'italic'
  )
  const laid = layoutText(
    { text: contents, font, size: s.fontSize, width, align: s.textAlign },
    context.measure
  )
  return { font, laid }
}

/**
 * The height, in points, the text area of `a` needs for `contents` (default: its own): what the
 * drawing's line breaks stack to. A box whose text area is shorter clips its last line.
 */
export function freeTextTextHeight(
  a: FreeTextAnnotation,
  context: DrawContext,
  contents: string = a.contents
): number {
  const { area } = freeTextFrame(a, context.page.rotate)
  return layoutOf(a, context, area.width, contents).laid.height
}

function textItem(
  a: FreeTextAnnotation,
  context: DrawContext,
  frame: TextFrame,
  box: Rect,
  border: number
): DrawItem {
  const s = a.defaultStyle
  const { font, laid } = layoutOf(a, context, frame.area.width, a.contents)
  const at = (x: number, baseline: number): Point =>
    along(along(frame.area.topLeft, frame.dir, x), frame.down, baseline)
  const underline = s.textDecoration === 'underline'
  const lines: TextLine[] = laid.lines
    .filter((line) => line.text !== '')
    .map((line) => ({
      text: line.text,
      origin: at(line.x, line.baseline),
      width: line.width,
      outside: line.outside,
      ...(underline
        ? {
            underline: {
              from: at(line.x, line.baseline + UNDERLINE_OFFSET * s.fontSize),
              to: at(
                line.x +
                  line.width +
                  [...line.text].filter((c) => c === ' ' || c === '\t').length *
                    (line.wordSpacing ?? 0),
                line.baseline + UNDERLINE_OFFSET * s.fontSize
              ),
              thickness: UNDERLINE_THICKNESS * s.fontSize,
            },
          }
        : {}),
      ...(line.wordSpacing ? { wordSpacing: line.wordSpacing } : {}),
      ...(line.segments
        ? {
            segments: line.segments.map((seg) => ({
              text: seg.text,
              origin: at(seg.x, line.baseline),
              width: seg.width,
              outside: seg.outside,
            })),
          }
        : {}),
    }))
  const clipRect = {
    x: box.x + border,
    y: box.y + border,
    width: Math.max(0, box.width - border * 2),
    height: Math.max(0, box.height - border * 2),
  }
  const radius = !isBubble(a) && a.cornerRadius ? a.cornerRadius - border : 0
  const reach = Math.min(clipRect.width, clipRect.height) / 2
  return {
    kind: 'text',
    role: 'text',
    lines,
    font,
    size: s.fontSize,
    color: s.color,
    clip: {
      rect: clipRect,
      ...(radius > 0 ? { radius: Math.min(radius, reach) } : {}),
    },
    angle: frame.angle,
    outsideStandardFonts: laid.outside,
  }
}

/**
 * A speech bubble's outline: the rounded box with a wedge from the edge nearest the last
 * `callout` point to the tip, `callout[0]`. The wedge sits at that point's position along the
 * edge, kept clear of the corners. Ties between edges go left, right, bottom, top.
 */
function bubbleCommands(
  a: FreeTextAnnotation & { callout: readonly [Point, Point, ...Point[]] },
  box: Rect
): PathCommand[] {
  const tip = a.callout[0]
  const edge = a.callout[a.callout.length - 1]!
  const w = box.width
  const h = box.height
  const r = Math.min(a.cornerRadius ?? 0, w / 2, h / 2)
  const gaps = {
    left: Math.abs(edge.x - box.x),
    right: Math.abs(edge.x - (box.x + w)),
    bottom: Math.abs(edge.y - box.y),
    top: Math.abs(edge.y - (box.y + h)),
  }
  const side = (Object.keys(gaps) as (keyof typeof gaps)[]).reduce((best, s) =>
    gaps[s] < gaps[best] ? s : best
  )
  const horizontal = side === 'top' || side === 'bottom'
  const span = horizontal ? w : h
  const half = Math.min(WEDGE_HALF, span / 4)
  const lo = Math.min(r + half, span / 2)
  // Measured from the box's left edge, or from its top edge.
  const from = horizontal ? edge.x - box.x : box.y + h - edge.y
  const at = Math.min(Math.max(from, lo), span - lo)
  // Box-local, y down, as the outline is walked clockwise on an upright page.
  const P = (x: number, y: number): Point => ({ x: box.x + x, y: box.y + h - y })
  const arc = (x: number, y: number): PathCommand[] =>
    r > 0 ? [{ op: 'A', rx: r, ry: r, largeArc: false, sweep: false, to: P(x, y) }] : []
  const line = (to: Point): PathCommand => ({ op: 'L', to })
  const spike = (x: number, y: number): PathCommand[] => [line(P(x, y)), line(tip)]
  return [
    { op: 'M', to: P(r, 0) },
    ...(side === 'top' ? [...spike(at - half, 0), line(P(at + half, 0))] : []),
    line(P(w - r, 0)),
    ...arc(w, r),
    ...(side === 'right' ? [...spike(w, at - half), line(P(w, at + half))] : []),
    line(P(w, h - r)),
    ...arc(w - r, h),
    ...(side === 'bottom' ? [...spike(at + half, h), line(P(at - half, h))] : []),
    line(P(r, h)),
    ...arc(0, h - r),
    ...(side === 'left' ? [...spike(0, at + half), line(P(0, at - half))] : []),
    line(P(0, r)),
    ...arc(r, 0),
    { op: 'Z' },
  ]
}
