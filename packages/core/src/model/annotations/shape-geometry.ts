// Pure geometry for the shape tool: vertices for stars and polygons, Shift constraints and the
// annotation each kind creates. Everything is PDF user space, points, origin bottom-left.
import type { Point, Rect } from '../geometry'
import type { AnnotationInput } from './types'

/** Every kind the shape menu can offer. Kinds without a creator yet are not in `SHAPE_KINDS`. */
export type ShapeKind =
  | 'line'
  | 'arrow'
  | 'rectangle'
  | 'roundedRectangle'
  | 'ellipse'
  | 'bubble'
  | 'star'
  | 'polygon'
  | 'loupe'
  | 'mask'

export interface ShapeOptions {
  kind: ShapeKind
  /** Points of a star. */
  points: number
  /** Sides of a polygon. */
  sides: number
}

/** The kinds the shape menu offers today, in menu order. Later kinds extend this. */
export const SHAPE_KINDS: readonly ShapeKind[] = [
  'line',
  'arrow',
  'rectangle',
  'roundedRectangle',
  'ellipse',
  'bubble',
  'star',
  'polygon',
  'loupe',
]

export const DEFAULT_SHAPE_OPTIONS: Readonly<ShapeOptions> = {
  kind: 'rectangle',
  points: 5,
  sides: 6,
}

const POINTER_ONLY: ReadonlySet<ShapeKind> = new Set(['loupe', 'mask'])

/**
 * True for kinds only a pointer creates: the loupe and the mask. `Enter` with the shape tool
 * does not place them.
 */
export function isPointerOnlyKind(kind: ShapeKind): boolean {
  return POINTER_ONLY.has(kind)
}

/** Magnification of a new loupe. */
export const DEFAULT_LOUPE_MAGNIFICATION = 2

/** Side of the shape a click or Enter places, in points. */
export const DEFAULT_SHAPE_SIZE = 72
/** Corner radius of a new rounded rectangle, in points. */
export const DEFAULT_CORNER_RADIUS = 8

/** How far below and left of its anchor a new speech bubble's tail tip sits, in points. */
const BUBBLE_TAIL = 24

const clean = (n: number): number => n + 0

/** The box between two corners. */
function rectOf(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

/** Vertices round the ellipse inscribed in `rect`, the first at the top centre, clockwise on the page. */
function ring(rect: Rect, count: number, radius: (index: number) => number): Point[] {
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  return Array.from({ length: count }, (_, i) => {
    const angle = (i * 2 * Math.PI) / count
    const r = radius(i)
    return {
      x: clean(cx + (rect.width / 2) * r * Math.sin(angle)),
      y: clean(cy + (rect.height / 2) * r * Math.cos(angle)),
    }
  })
}

/** A star's `2 * points` vertices, outer and inner alternating, the first at the top centre. */
export function starVertices(rect: Rect, points: number, innerRatio = 0.5): Point[] {
  const n = Math.max(2, Math.round(points))
  return ring(rect, n * 2, (i) => (i % 2 === 0 ? 1 : innerRatio))
}

/** A regular polygon's vertices on the inscribed ellipse, the first at the top centre. */
export function polygonVertices(rect: Rect, sides: number): Point[] {
  return ring(rect, Math.max(3, Math.round(sides)), () => 1)
}

const LINE_KINDS: ReadonlySet<ShapeKind> = new Set(['line', 'arrow'])

/** True for kinds drawn between two endpoints rather than inside a box. */
export function isLineKind(kind: ShapeKind): boolean {
  return LINE_KINDS.has(kind)
}

const H = Math.SQRT1_2
/** Unit steps every 45 degrees, counter-clockwise from +x (y up). */
const EIGHT_WAYS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: H, y: H },
  { x: 0, y: 1 },
  { x: -H, y: H },
  { x: -1, y: 0 },
  { x: -H, y: -H },
  { x: 0, y: -1 },
  { x: H, y: -H },
]

/**
 * Where the drag ends with Shift held: a square or circle for box kinds, the nearest 45 degree
 * angle for lines.
 */
export function constrain(kind: ShapeKind, start: Point, end: Point): Point {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (isLineKind(kind)) {
    const step = Math.round(Math.atan2(dy, dx) / (Math.PI / 4))
    const u = EIGHT_WAYS[((step % 8) + 8) % 8]!
    const length = dx * u.x + dy * u.y
    return { x: clean(start.x + length * u.x), y: clean(start.y + length * u.y) }
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy))
  return {
    x: clean(start.x + (dx < 0 ? -size : size)),
    y: clean(start.y + (dy < 0 ? -size : size)),
  }
}

/** The two drag corners of the default-size shape centred on `at`. */
export function defaultEnds(kind: ShapeKind, at: Point): [Point, Point] {
  const half = DEFAULT_SHAPE_SIZE / 2
  return isLineKind(kind)
    ? [
        { x: at.x - half, y: at.y },
        { x: at.x + half, y: at.y },
      ]
    : [
        { x: at.x - half, y: at.y - half },
        { x: at.x + half, y: at.y + half },
      ]
}

/** The annotation a shape kind creates between two points, or `undefined` for a kind without a creator yet. */
export function shapeInput(
  kind: ShapeKind,
  page: number,
  start: Point,
  end: Point,
  opts: ShapeOptions
): AnnotationInput | undefined {
  const rect = rectOf(start, end)
  switch (kind) {
    case 'line':
      return { type: 'line', page, start, end }
    case 'arrow':
      return { type: 'line', page, start, end, tail: 'openArrow', intent: 'lineArrow' }
    case 'rectangle':
      return { type: 'square', page, rect }
    case 'roundedRectangle':
      return { type: 'square', page, rect, cornerRadius: DEFAULT_CORNER_RADIUS }
    case 'ellipse':
      return { type: 'circle', page, rect }
    case 'bubble': {
      // The knee is the box's bottom-left quarter point, on its bottom edge; the tail runs from
      // the box edge there to the tip.
      const knee = { x: clean(rect.x + rect.width / 4), y: clean(rect.y) }
      const tip = { x: clean(knee.x - BUBBLE_TAIL), y: clean(knee.y - BUBBLE_TAIL) }
      return {
        type: 'freetext',
        page,
        contents: '',
        intent: 'freeTextCallout',
        cornerRadius: DEFAULT_CORNER_RADIUS,
        width: 1,
        rect,
        callout: [tip, knee],
      }
    }
    case 'star':
      return { type: 'polygon', page, vertices: starVertices(rect, opts.points) }
    case 'polygon':
      return { type: 'polygon', page, vertices: polygonVertices(rect, opts.sides) }
    case 'loupe':
      // Always a circle: the square on the drag's longer side, as Shift would make it.
      return {
        type: 'loupe',
        page,
        rect: rectOf(start, constrain(kind, start, end)),
        magnification: DEFAULT_LOUPE_MAGNIFICATION,
      }
    default:
      return undefined
  }
}
