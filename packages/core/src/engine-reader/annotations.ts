// A page's annotations from the facts the engine reports, as the PDF.js reader lists them: the
// same annotations in the same order with the values PDF.js 6.4.299 gives, its quirks included.
import {
  annotationId,
  borderOf,
  defaultAppearanceText,
  F_INVISIBLE,
  F_NO_VIEW,
  parseDefaultAppearance,
  rectOf,
  refId,
  rgbOf,
  textOf,
  type Rgb,
} from './file-values'
import { listed } from './links'

import type { AnnotationFactsShape, FileTextShape, PageAnnotationsShape } from './types'
import type { FileAnnotation } from '../reader/file'

/** The kinds PDF.js reads as markup: they carry an author, a creation date and replies. */
const MARKUP = new Set([
  'Text',
  'FreeText',
  'Line',
  'Square',
  'Circle',
  'PolyLine',
  'Polygon',
  'Caret',
  'Ink',
  'Highlight',
  'Underline',
  'Squiggly',
  'StrikeOut',
  'Stamp',
  'FileAttachment',
])

/** The text markup kinds, whose /QuadPoints PDF.js keeps. */
const TEXT_MARKUP = new Set(['Highlight', 'Underline', 'Squiggly', 'StrikeOut'])

/** The line endings PDF.js knows; any other is `None`. */
const LINE_ENDINGS = new Set([
  'None',
  'Square',
  'Circle',
  'Diamond',
  'OpenArrow',
  'ClosedArrow',
  'Butt',
  'ROpenArrow',
  'RClosedArrow',
  'Slash',
])

/** The size PDF.js gives a note's icon when the note has no appearance of its own. */
const NOTE_ICON_SIZE = 22

/**
 * @internal What the form tells the page's widgets: what PDF.js reads along `/Parent` and from
 * `/AcroForm`.
 */
export interface WidgetContext {
  /** `/DA`, inherited, else `/AcroForm /DA`, as `defaultAppearanceText` picks it. */
  defaultAppearance: string
  /**
   * `/AcroForm /NeedAppearances` is true and the field has a value: PDF.js then counts an
   * appearance.
   */
  drawnFromValue: boolean
}

/** @internal What the form gives the page's annotations. */
export interface PageFormContext {
  /** `/AcroForm /DA`, for a FreeText without its own. */
  defaultAppearance?: FileTextShape
  /** The page's widgets by their place in `/Annots`. */
  widgets: ReadonlyMap<number, WidgetContext>
}

/** Whether `/QuadPoints` is a non-empty list of numbers in eights, as PDF.js takes them. */
const quadsOk = (quads: readonly (number | null)[] | undefined): quads is number[] =>
  !!quads && quads.length > 0 && quads.length % 8 === 0 && quads.every((n) => n !== null)

/** @internal Whether PDF.js lists the annotation, by the rule `listed` gives for links. */
export const listedAnnotation = (a: AnnotationFactsShape): boolean =>
  listed({
    subtype: a.subtype,
    flags: a.flags,
    hasQuads: a.quads !== undefined,
    quadsOk: quadsOk(a.quads),
  })

/** The page's annotations by object number, the first of each. */
function byObjectNumber(page: PageAnnotationsShape): Map<number, AnnotationFactsShape> {
  const byObject = new Map<number, AnnotationFactsShape>()
  for (const a of page.annotations)
    if (a.objectNumber !== undefined && !byObject.has(a.objectNumber))
      byObject.set(a.objectNumber, a)
  return byObject
}

/**
 * Whether PDF.js lists a popup its own flags keep off the screen: it takes its parent's flags
 * when those have neither Invisible nor NoView (no `/F` at all included). A parent that is not
 * on the page is taken to have such flags: the engine reports only the page's annotations.
 */
function shownByParent(
  a: AnnotationFactsShape,
  byObject: ReadonlyMap<number, AnnotationFactsShape>
): boolean {
  if (a.subtype !== 'Popup' || a.parent === undefined) return false
  const parent = byObject.get(a.parent.objectNumber)
  return !parent || (parent.flags & (F_INVISIBLE | F_NO_VIEW)) === 0
}

/**
 * @internal The page's annotations in the order PDF.js lists them: the listed ones other than
 * widgets and popups in `/Annots` order, then the widgets, then the popups. A popup is also
 * listed when its parent's flags show it (`shownByParent`).
 */
export function listedInOrder(page: PageAnnotationsShape): AnnotationFactsShape[] {
  const byObject = byObjectNumber(page)
  const shown = page.annotations.filter(
    (a) => listedAnnotation(a) || shownByParent(a, byObject)
  )
  return [
    ...shown.filter((a) => a.subtype !== 'Widget' && a.subtype !== 'Popup'),
    ...shown.filter((a) => a.subtype === 'Widget'),
    ...shown.filter((a) => a.subtype === 'Popup'),
  ]
}

/**
 * Quads as PDF.js keeps them: each replaced by its bounding box, top edge first, in 32-bit
 * floats. `undefined` when they are not well formed, or for a Link when any reaches outside its
 * rect.
 */
function boxedQuads(
  flat: readonly (number | null)[] | undefined,
  rect: readonly number[] | null
): number[] | undefined {
  if (!quadsOk(flat)) return undefined
  const out: number[] = []
  for (let i = 0; i < flat.length; i += 8) {
    const xs = [flat[i]!, flat[i + 2]!, flat[i + 4]!, flat[i + 6]!]
    const ys = [flat[i + 1]!, flat[i + 3]!, flat[i + 5]!, flat[i + 7]!]
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    if (
      rect &&
      (minX < rect[0]! || maxX > rect[2]! || minY < rect[1]! || maxY > rect[3]!)
    )
      return undefined
    out.push(minX, maxY, maxX, maxY, minX, minY, maxX, minY)
  }
  return out.map(Math.fround)
}

/** A list of numbers as PDF.js's `isNumberArray` takes one, in 32-bit floats; else undefined. */
const floats = (list: readonly (number | null)[] | undefined): number[] | undefined =>
  list?.every((n) => n !== null) ? list.map((n) => Math.fround(n ?? 0)) : undefined

/** An ink path as PDF.js reads it: pairs of numbers, a pair with anything else left at 0. */
function inkPath(path: readonly (number | null)[]): number[] {
  const out = new Array<number>(path.length).fill(0)
  for (let j = 0; j < path.length; j += 2) {
    const x = path[j]
    const y = path[j + 1]
    if (typeof x === 'number' && typeof y === 'number') {
      out[j] = Math.fround(x)
      out[j + 1] = Math.fround(y)
    }
  }
  return out
}

/** `/CA` as PDF.js reads it for ink and highlights: 1 when it is absent or 0. */
const opacityOf = (a: AnnotationFactsShape): number =>
  (typeof a.opacity === 'number' && a.opacity) || 1

const daOf = (text: string) => {
  const da = parseDefaultAppearance(text)
  return { fontSize: da.fontSize, fontName: da.fontName, color: da.color }
}

const stringOf = (text: FileTextShape | undefined): string | undefined =>
  text === undefined ? undefined : textOf(text)

/**
 * @internal The page's annotations as `FileAnnotation`s, in the order and with the values the
 * PDF.js reader gives (see `listedInOrder`). `page` is the page's index; `form` what the form
 * tells its widgets and FreeTexts. PDF.js's quirks are kept so the two readers agree:
 *
 * - every annotation has `contents` (empty when it has none) and a border width (`borderOf`);
 * - one that is not markup has black for a missing `/C`; markup has no colour then;
 * - a note without an appearance is given PDF.js's 22-point icon box, and a note with one the
 *   icon `NoIcon`; a file attachment without `/Name` the icon `PushPin`;
 * - a popup takes its title, contents, dates and colour from its parent;
 * - ink and highlights have opacity 1 when `/CA` is absent or 0; other kinds have none;
 * - `/IC` is not given: PDF.js gives no interior colour.
 */
export function fileAnnotationsFromEngine(
  page: number,
  facts: PageAnnotationsShape,
  form?: PageFormContext
): FileAnnotation[] {
  const byObject = byObjectNumber(facts)
  return listedInOrder(facts).map((a) => fileAnnotationOf(page, a, byObject, form))
}

function fileAnnotationOf(
  page: number,
  a: AnnotationFactsShape,
  byObject: ReadonlyMap<number, AnnotationFactsShape>,
  form: PageFormContext | undefined
): FileAnnotation {
  const kind = a.subtype
  const markup = MARKUP.has(kind)
  const rect = rectOf(a)
  const border = borderOf(a, rect)
  let hasAppearance = a.hasAppearance
  let color: Rgb | null = rgbOf(a.color, [0, 0, 0])
  let contents = stringOf(a.contents) ?? ''
  let author: string | undefined
  let created: string | undefined
  let modified = stringOf(a.modified)
  let icon: string | undefined
  let defaultAppearance: FileAnnotation['defaultAppearance']
  let opacity: number | undefined

  if (markup) {
    if (a.color === undefined) color = null
    author = stringOf(a.author) ?? ''
    created = stringOf(a.created)
  }
  if (kind === 'Popup') {
    // PDF.js reads a popup's text from the annotation it belongs to.
    const parent =
      a.parent === undefined ? undefined : byObject.get(a.parent.objectNumber)
    if (parent) {
      color = parent.color === undefined ? null : rgbOf(parent.color, [0, 0, 0])
      author = stringOf(parent.author) ?? ''
      contents = stringOf(parent.contents) ?? ''
      created = stringOf(parent.created) ?? ''
      modified = stringOf(parent.modified)
    }
  }
  if (kind === 'Text') {
    if (hasAppearance) icon = 'NoIcon'
    else {
      rect[1] = rect[3] - NOTE_ICON_SIZE
      rect[2] = rect[0] + NOTE_ICON_SIZE
      icon = a.icon ?? 'Note'
    }
  }
  if (kind === 'FileAttachment') icon = a.icon === undefined ? 'PushPin' : textOf(a.icon)
  if (kind === 'Ink' || kind === 'Highlight') opacity = opacityOf(a)
  if (kind === 'Widget') {
    const widget = form?.widgets.get(a.index)
    if (widget?.drawnFromValue) hasAppearance = true
    defaultAppearance = daOf(
      widget
        ? widget.defaultAppearance
        : defaultAppearanceText(a.defaultAppearance, form?.defaultAppearance)
    )
  }
  if (kind === 'FreeText') {
    const da = daOf(defaultAppearanceText(a.defaultAppearance, form?.defaultAppearance))
    // PDF.js sizes the text of a FreeText it draws itself at 10 when `/DA` sets no size.
    if (!hasAppearance) da.fontSize ||= 10
    defaultAppearance = da
  }

  const quads =
    kind === 'Link'
      ? boxedQuads(a.quads, rect)
      : TEXT_MARKUP.has(kind)
        ? boxedQuads(a.quads, null)
        : undefined
  const line =
    kind === 'Line'
      ? a.line?.length === 4 && a.line.every((n) => n !== null)
        ? rectOf({ rect: a.line, rectOk: true })
        : ([0, 0, 0, 0] as [number, number, number, number])
      : undefined
  const lineEndings =
    kind === 'Line' || kind === 'PolyLine' ? lineEndingsOf(a.lineEndings) : undefined
  const vertices =
    kind === 'PolyLine' || kind === 'Polygon' ? floats(a.vertices) : undefined
  const inkLists =
    kind === 'Ink'
      ? (a.inkLists ?? []).flatMap((path) => (path ? [inkPath(path)] : []))
      : undefined
  const drawn = hasAppearance
    ? undefined
    : drawnBox(kind, {
        rect,
        borderWidth: border.width,
        filled: rgbOf(a.interiorColor, null) !== null,
        quads,
        line,
        vertices,
        inkLists,
      })
  if (drawn) rect.splice(0, 4, ...drawn)

  return {
    id: annotationId(page, a),
    subtype: kind,
    rect,
    hasAppearance,
    ...(quads ? { quads } : {}),
    ...(color ? { color } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
    contents,
    ...(author !== undefined ? { author } : {}),
    ...(created !== undefined ? { created } : {}),
    ...(modified !== undefined ? { modified } : {}),
    ...(icon !== undefined ? { icon } : {}),
    ...(markup && a.inReplyTo ? { inReplyTo: refId(a.inReplyTo) } : {}),
    ...(a.intent !== undefined ? { intent: a.intent } : {}),
    ...(line ? { line } : {}),
    ...(lineEndings ? { lineEndings } : {}),
    ...(vertices ? { vertices } : {}),
    ...(inkLists ? { inkLists } : {}),
    border: { width: border.width },
    ...(defaultAppearance ? { defaultAppearance } : {}),
  }
}

/** `/LE` as PDF.js reads it: two names it knows, each else `None`; both `None` unless two. */
function lineEndingsOf(raw: readonly (string | null)[] | undefined): [string, string] {
  if (raw?.length !== 2) return ['None', 'None']
  const one = (e: string | null) => (e !== null && LINE_ENDINGS.has(e) ? e : 'None')
  return [one(raw[0]!), one(raw[1]!)]
}

type Box = [number, number, number, number]

/**
 * The rect PDF.js gives an annotation it draws itself, having no appearance: the box of what it
 * draws (its `_setDefaultAppearance`), from the rect (in 32-bit floats) or each text markup quad.
 * A line, polyline or ink drawing whose own box misses the rect is drawn in that box instead.
 * `undefined` for a kind PDF.js does not draw this way, or one it draws nothing of: a square or
 * circle with no border and no fill, a polyline or polygon without vertices, text markup
 * without quads.
 */
function drawnBox(
  kind: string,
  d: {
    rect: Box
    borderWidth: number
    filled: boolean
    quads: number[] | undefined
    line: Box | undefined
    vertices: number[] | undefined
    inkLists: number[][] | undefined
  }
): Box | undefined {
  let rect = d.rect
  const width = d.borderWidth || 1
  const reach = 2 * width
  /** The rect, else `box` when the rect misses it. */
  const within = (box: Box): Box => (intersects(rect, box) ? rect : box)
  let corners: (points: number[]) => number[]
  switch (kind) {
    case 'Line': {
      const l = d.line!
      rect = within([l[0] - reach, l[1] - reach, l[2] + reach, l[3] + reach])
      corners = (p) => [p[0]! - width, p[7]! - width, p[2]! + width, p[3]! + width]
      break
    }
    case 'Square':
    case 'Circle':
      if (d.borderWidth === 0 && !d.filled) return undefined
      corners = (p) => [p[0]!, p[7]!, p[2]!, p[3]!]
      break
    case 'PolyLine':
    case 'Polygon': {
      if (!d.vertices) return undefined
      const box = boxOf(d.vertices, reach)
      if (box) rect = within(box)
      corners = (p) => [p[0]!, p[7]!, p[2]!, p[3]!]
      break
    }
    case 'Ink': {
      const box = boxOf(d.inkLists!.flat(), reach)
      if (box) rect = within(box)
      corners = (p) => [p[0]!, p[7]!, p[2]!, p[3]!]
      break
    }
    case 'Highlight':
    case 'Underline':
    case 'StrikeOut':
      if (!d.quads) return undefined
      corners = (p) => [p[0]!, p[7]!, p[2]!, p[3]!]
      break
    case 'Squiggly':
      if (!d.quads) return undefined
      corners = (p) => {
        const dy = (p[1]! - p[5]!) / 6
        return [p[4]!, p[5]! - 2 * dy, p[6]!, p[5]! + 2 * dy]
      }
      break
    default:
      return undefined
  }
  const points =
    d.quads ??
    [rect[0], rect[3], rect[2], rect[3], rect[0], rect[1], rect[2], rect[1]].map(
      Math.fround
    )
  const out: Box = [Infinity, Infinity, -Infinity, -Infinity]
  for (let i = 0; i < points.length; i += 8) {
    const [x0, y0, x1, y1] = corners(points.slice(i, i + 8))
    out[0] = Math.min(out[0], x0!, x1!)
    out[1] = Math.min(out[1], y0!, y1!)
    out[2] = Math.max(out[2], x0!, x1!)
    out[3] = Math.max(out[3], y0!, y1!)
  }
  return out
}

/** The box round points `x y x y …`, each grown by `reach`; `undefined` for none. */
function boxOf(flat: readonly number[], reach: number): Box | undefined {
  if (flat.length < 2) return undefined
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 1 < flat.length; i += 2) {
    box[0] = Math.min(box[0], flat[i]! - reach)
    box[1] = Math.min(box[1], flat[i + 1]! - reach)
    box[2] = Math.max(box[2], flat[i]! + reach)
    box[3] = Math.max(box[3], flat[i + 1]! + reach)
  }
  return box
}

/** Whether two boxes meet, as PDF.js's `Util.intersect` tells it. */
function intersects(a: Box, b: Box): boolean {
  const xLow = Math.max(Math.min(a[0], a[2]), Math.min(b[0], b[2]))
  const xHigh = Math.min(Math.max(a[0], a[2]), Math.max(b[0], b[2]))
  if (xLow > xHigh) return false
  const yLow = Math.max(Math.min(a[1], a[3]), Math.min(b[1], b[3]))
  const yHigh = Math.min(Math.max(a[1], a[3]), Math.max(b[1], b[3]))
  return yLow <= yHigh
}
