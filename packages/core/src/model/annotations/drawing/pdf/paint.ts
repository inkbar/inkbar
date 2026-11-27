import { arcToCubics } from '../arc'
import { paintedRect } from '../extent'
import { COURIER_ADVANCE } from '../text/measure'

import { decodeDataUrl } from './data-url'
import { num, rgbOf } from './operators'
import { pdfString, winAnsi } from './win-ansi'

import type { TextPicture, TextPictureRequest, ToPng } from './pictures'
import type { Point, Rect } from '../../../geometry'
import type { DrawItem, Drawing, Paint, PathCommand, TextFont } from '../types'
import type { Appearance, StandardFont } from '@inkbar/engine/bare'

export type { TextPicture, TextPictureRequest, ToPng } from './pictures'

export interface PaintHelpers {
  /** Index of the page the drawing is on, for `page` items. */
  page: number
  /** Pictures a run of text no standard font can set: one outside them, or one Windows ANSI cannot encode. */
  textPicture?: TextPicture
  /** Converts an image that is neither PNG nor JPEG. */
  toPng?: ToPng
}

/** A drawing holds something the painter cannot write without a helper it was not given. */
export class UnpaintableError extends Error {
  readonly reason: 'text' | 'image'

  constructor(reason: 'text' | 'image') {
    super(
      reason === 'text'
        ? 'Text outside the standard fonts needs a picture, and no textPicture was given'
        : 'An image that is not PNG or JPEG needs converting, and no toPng was given'
    )
    this.name = 'UnpaintableError'
    this.reason = reason
  }
}

type Opacity = { fill?: number; stroke?: number }
type Form = Appearance & { group?: boolean }
type Image = { format: 'png' | 'jpeg'; data: Uint8Array }
type Picture = { image: Image; width: number; ascent: number; descent: number }

/** What one call shares across its appearances, so each picture and image is made once. */
interface Shared {
  helpers: PaintHelpers
  pictures: Map<string, Promise<Picture>>
  images: Map<string, Promise<Image>>
}

/** What one appearance has collected while its items were written. */
interface Scope {
  shared: Shared
  lines: string[]
  opacities: Record<string, Opacity>
  forms: Record<string, Form>
  fonts: Record<string, StandardFont>
  images: Record<string, Image>
  pages: Record<string, number>
}

/**
 * `drawing` as PDF operators with the resources they name, in the drawing's own user space.
 * Each item is wrapped in `q` and `Q`; equal resources share one name. Rejects with an
 * `UnpaintableError` when the drawing needs a helper that `helpers` lacks.
 */
export async function paintDrawing(
  drawing: Drawing,
  helpers: PaintHelpers
): Promise<Appearance> {
  const shared: Shared = { helpers, pictures: new Map(), images: new Map() }
  return appearance(shared, drawing.bounds, drawing.items)
}

async function appearance(
  shared: Shared,
  bounds: Rect,
  items: readonly DrawItem[]
): Promise<Appearance> {
  const scope: Scope = {
    shared,
    lines: [],
    opacities: {},
    forms: {},
    fonts: {},
    images: {},
    pages: {},
  }
  for (const item of items) await paintItem(scope, item)
  const out: Appearance = { bounds, content: ascii(scope.lines.join('\n')) }
  if (Object.keys(scope.fonts).length > 0) out.fonts = scope.fonts
  if (Object.keys(scope.opacities).length > 0) out.opacities = scope.opacities
  if (Object.keys(scope.images).length > 0) out.images = scope.images
  if (Object.keys(scope.pages).length > 0) out.pages = scope.pages
  if (Object.keys(scope.forms).length > 0) out.forms = scope.forms
  return out
}

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0x7f
  return out
}

/** The name `value` has in `names`, adding it as `prefix` and the next number on first use. */
function nameOf<T>(
  names: Record<string, T>,
  prefix: string,
  value: T,
  equal: (a: T, b: T) => boolean = (a, b) => a === b
): string {
  for (const [name, have] of Object.entries(names)) if (equal(have, value)) return name
  const name = `${prefix}${Object.keys(names).length}`
  names[name] = value
  return name
}

/** The name of the opacity state with these values, adding it on first use. */
const opacityName = (scope: Scope, value: Opacity): string =>
  nameOf(
    scope.opacities,
    'GS',
    value,
    (a, b) => a.fill === b.fill && a.stroke === b.stroke
  )

async function paintItem(scope: Scope, item: DrawItem): Promise<void> {
  switch (item.kind) {
    case 'text':
      return paintText(scope, item)
    case 'image':
      return paintImage(scope, item)
    case 'page':
      return paintPage(scope, item)
    case 'group':
      return paintGroup(scope, item)
    case 'polygon':
    case 'polyline': {
      if (item.points.length === 0) return
      const [first, ...rest] = item.points
      const commands: PathCommand[] = [
        { op: 'M', to: first! },
        ...rest.map((to): PathCommand => ({ op: 'L', to })),
      ]
      if (item.kind === 'polygon') commands.push({ op: 'Z' })
      return paintPath(scope, commands, item.paint)
    }
    case 'rect':
      return paintPath(scope, rectOutline(item.rect, item.radius), item.paint)
    case 'ellipse':
      return paintPath(scope, ellipseOutline(item.rect), item.paint)
    case 'path':
      return paintPath(scope, item.commands, item.paint, item.fillRule)
  }
}

/**
 * A group below full opacity as a transparency group painted through its opacity, so where its
 * items overlap they are not darkened twice. At full opacity that is the same as painting the
 * items one by one, which is what it does: a reader may draw a group on a canvas of its own and
 * blur its edges putting it back (PDF.js does).
 */
async function paintGroup(
  scope: Scope,
  item: Extract<DrawItem, { kind: 'group' }>
): Promise<void> {
  if (item.opacity >= 1) {
    for (const child of item.items) await paintItem(scope, child)
    return
  }
  const bounds = paintedRect(item)
  if (!bounds) return
  const inner = await appearance(scope.shared, bounds, item.items)
  if (inner.content.length === 0) return
  const name = `Fm${Object.keys(scope.forms).length}`
  scope.forms[name] = { ...inner, group: true }
  scope.lines.push(
    'q',
    `/${opacityName(scope, { fill: item.opacity, stroke: item.opacity })} gs`,
    `/${name} Do`,
    'Q'
  )
}

/** A dash pattern PDF accepts: entries finite and not negative, not all zero. Anything else is solid. */
const validDashes = (
  dashes: readonly number[] | undefined
): dashes is readonly number[] =>
  !!dashes &&
  dashes.length > 0 &&
  dashes.every((d) => Number.isFinite(d) && d >= 0) &&
  dashes.some((d) => d > 0)

function paintPath(
  scope: Scope,
  commands: readonly PathCommand[],
  paint: Paint,
  fillRule: 'nonzero' | 'evenodd' = 'nonzero'
): void {
  const fill = paint.fill
  const stroke = paint.stroke && paint.stroke.width > 0 ? paint.stroke : undefined
  if (!fill && !stroke) return
  const path = pathOperators(commands)
  if (path.length === 0) return
  const out: string[] = ['q']
  if (fill && fill.opacity !== undefined && fill.opacity < 1)
    out.push(`/${opacityName(scope, { fill: fill.opacity })} gs`)
  if (fill) out.push(`${rgb(fill.color)} rg`)
  if (stroke) {
    out.push(`${rgb(stroke.color)} RG`, `${num(stroke.width)} w`)
    if (stroke.join) out.push(`${stroke.join === 'round' ? 1 : 0} j`)
    if (stroke.cap) out.push(`${stroke.cap === 'round' ? 1 : 0} J`)
    if (validDashes(stroke.dashes)) out.push(`[${stroke.dashes.map(num).join(' ')}] 0 d`)
  }
  out.push(...path)
  const star = fillRule === 'evenodd' ? '*' : ''
  if (fill && stroke) out.push(`B${star}`)
  else if (fill) out.push(`f${star}`)
  else out.push('S')
  out.push('Q')
  scope.lines.push(...out)
}

const rgb = (color: string): string => rgbOf(color).map(num).join(' ')

const pt = (p: Point): string => `${num(p.x)} ${num(p.y)}`

/** A transformation matrix as the six operands of `cm` or `Tm`. */
const matrix = (m: readonly number[]): string => m.map(num).join(' ')

/**
 * Path construction operators: arcs become curves, `Z` becomes `h`. A path that does not start
 * with `M` starts with an `m` at its first drawing command's end, which stands for that command;
 * a `Z` before anything is drawn is dropped.
 */
function pathOperators(commands: readonly PathCommand[]): string[] {
  const out: string[] = []
  let at: Point | undefined
  let start: Point | undefined
  for (const c of commands) {
    if (c.op === 'Z') {
      if (!at) continue
      out.push('h')
      at = start
      continue
    }
    if (c.op === 'M' || !at) {
      out.push(`${pt(c.to)} m`)
      at = start = c.to
      continue
    }
    switch (c.op) {
      case 'L':
        out.push(`${pt(c.to)} l`)
        break
      case 'C':
        out.push(`${pt(c.c1)} ${pt(c.c2)} ${pt(c.to)} c`)
        break
      case 'A':
        for (const piece of arcToCubics(at, c))
          out.push(`${pt(piece.c1)} ${pt(piece.c2)} ${pt(piece.to)} c`)
        break
    }
    at = c.to
  }
  return out
}

/** A rect from its top-left corner (after the corner's arc, with a radius), clockwise with y up. */
function rectOutline(rect: Rect, radius = 0): PathCommand[] {
  const { x, y, width, height } = rect
  const r = Math.min(Math.max(0, radius), width / 2, height / 2)
  const [left, right, bottom, top] = [x, x + width, y, y + height]
  const arc = (to: Point): PathCommand[] =>
    r > 0 ? [{ op: 'A', rx: r, ry: r, largeArc: false, sweep: false, to }] : []
  return [
    { op: 'M', to: { x: left + r, y: top } },
    { op: 'L', to: { x: right - r, y: top } },
    ...arc({ x: right, y: top - r }),
    { op: 'L', to: { x: right, y: bottom + r } },
    ...arc({ x: right - r, y: bottom }),
    { op: 'L', to: { x: left + r, y: bottom } },
    ...arc({ x: left, y: bottom + r }),
    ...(r > 0
      ? ([
          { op: 'L', to: { x: left, y: top - r } },
          ...arc({ x: left + r, y: top }),
        ] as PathCommand[])
      : []),
    { op: 'Z' },
  ]
}

/** An ellipse from its rightmost point towards -y. */
function ellipseOutline(rect: Rect): PathCommand[] {
  const { x, y, width, height } = rect
  const cy = y + height / 2
  const half = (to: number): PathCommand => ({
    op: 'A',
    rx: width / 2,
    ry: height / 2,
    largeArc: true,
    sweep: false,
    to: { x: to, y: cy },
  })
  return [{ op: 'M', to: { x: x + width, y: cy } }, half(x), half(x + width), { op: 'Z' }]
}

/** Cosine and sine of each turn, exactly: anticlockwise in user space, as the screen turns it. */
const TURNS: Record<0 | 90 | 180 | 270, readonly [number, number]> = {
  0: [1, 0],
  90: [0, 1],
  180: [-1, 0],
  270: [0, -1],
}

/**
 * The matrix that maps the unit square onto a `width` by `height` box whose bottom-left corner,
 * before turning, is `(left, bottom)` from `origin`, the box then turned by `turn` about `origin`.
 */
function placed(
  turn: readonly [number, number],
  origin: Point,
  left: number,
  bottom: number,
  width: number,
  height: number
): number[] {
  const [c, s] = turn
  return [
    width * c,
    width * s,
    -height * s,
    height * c,
    origin.x + left * c - bottom * s,
    origin.y + left * s + bottom * c,
  ]
}

const FACES: Record<TextFont['family'], readonly StandardFont[]> = {
  Helvetica: [
    'Helvetica',
    'Helvetica-Bold',
    'Helvetica-Oblique',
    'Helvetica-BoldOblique',
  ],
  Times: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
  Courier: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'],
}

const fontName = (scope: Scope, font: TextFont): string =>
  nameOf(
    scope.fonts,
    'F',
    FACES[font.family][(font.bold ? 1 : 0) + (font.italic ? 2 : 0)]!
  )

type TextItem = Extract<DrawItem, { kind: 'text' }>
type Run = { text: string; origin: Point; outside: boolean }

const SOFT_HYPHEN = String.fromCharCode(0xad)

/**
 * A run's characters as a standard font sets them: composed, and without soft hyphens. The layout
 * never breaks at a soft hyphen and gives it no width, and the screen draws none within a line,
 * while a PDF viewer would draw Windows ANSI's 0xAD as a hyphen.
 */
const drawn = (text: string): string => text.normalize('NFC').replaceAll(SOFT_HYPHEN, '')

/**
 * A text as the screen paints it: clipped to `clip`, each line (each segment, on a line with tabs)
 * set from its origin and turned by `angle` about it, each underline a filled rule. A run in the
 * standard fonts is set in one, at its own advance; any other run is a picture from
 * `textPicture`. Each run has its own `BT`…`ET`, and `Tw` is written with each run from the
 * first line that has word spacing on: once set it holds for the runs that follow, so a later
 * line without any writes `0 Tw`.
 */
async function paintText(scope: Scope, item: TextItem): Promise<void> {
  const turn = TURNS[item.angle]
  const body: string[] = []
  let wordSpacing = 0
  for (const line of item.lines) {
    const spacing = line.wordSpacing ?? 0
    const runs: readonly Run[] = line.segments ?? [line]
    for (const run of runs) {
      if (run.text === '') continue
      const bytes = run.outside ? undefined : winAnsi(drawn(run.text))
      if (bytes?.length === 0) continue
      if (!bytes) {
        // The screen spaces a pictured run, a tabbed line's segments included, like any other.
        body.push(...(await pictureRun(scope, item, run, spacing, turn)))
        continue
      }
      body.push(
        'BT',
        `/${fontName(scope, item.font)} ${num(item.size)} Tf`,
        `${rgb(item.color)} rg`,
        item.angle === 0
          ? `${pt(run.origin)} Td`
          : `${matrix([turn[0], turn[1], -turn[1], turn[0]])} ${pt(run.origin)} Tm`
      )
      if (spacing !== 0 || wordSpacing !== 0) {
        body.push(`${num(spacing)} Tw`)
        wordSpacing = spacing
      }
      if (item.font.family === 'Courier')
        body.push(`${num((COURIER_ADVANCE - 0.6) * item.size)} Tc`)
      body.push(`${pdfString(bytes)} Tj`, 'ET')
    }
    if (line.underline) body.push(...underline(item.color, line.underline))
  }
  if (body.length === 0) return
  scope.lines.push('q')
  if (item.clip)
    scope.lines.push(
      ...pathOperators(rectOutline(item.clip.rect, item.clip.radius)),
      'W n'
    )
  scope.lines.push(...body, 'Q')
}

/**
 * A run as a picture from `textPicture`, with the line's word spacing, from the run's origin and
 * turned with the item.
 */
async function pictureRun(
  scope: Scope,
  item: TextItem,
  run: Run,
  wordSpacing: number,
  turn: readonly [number, number]
): Promise<string[]> {
  const { helpers, pictures } = scope.shared
  const textPicture = helpers.textPicture
  if (!textPicture) throw new UnpaintableError('text')
  const request: TextPictureRequest = {
    text: run.text,
    font: item.font,
    size: item.size,
    color: item.color,
    ...(wordSpacing !== 0 ? { wordSpacing } : {}),
  }
  const { family, bold, italic } = item.font
  const key = JSON.stringify([
    run.text,
    family,
    bold,
    italic,
    item.size,
    item.color,
    wordSpacing,
  ])
  let picture = pictures.get(key)
  if (!picture) {
    picture = textPicture(request).then(({ png, width, ascent, descent }) => ({
      image: { format: 'png', data: png },
      width,
      ascent,
      descent,
    }))
    pictures.set(key, picture)
  }
  const { image, width, ascent, descent } = await picture
  const height = ascent + descent
  if (!(width > 0 && height > 0)) return []
  const m = placed(turn, run.origin, 0, -descent, width, height)
  return ['q', `${matrix(m)} cm`, `/${nameOf(scope.images, 'Im', image)} Do`, 'Q']
}

/** An underline as a filled rectangle, `thickness` across and centred on the rule. */
function underline(
  color: string,
  { from, to, thickness }: NonNullable<TextItem['lines'][number]['underline']>
): string[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (!(thickness > 0 && length > 0)) return []
  const half = thickness / 2
  let shape: string[]
  if (dy === 0)
    shape = [
      `${num(Math.min(from.x, to.x))} ${num(from.y - half)} ${num(Math.abs(dx))} ${num(thickness)} re`,
    ]
  else if (dx === 0)
    shape = [
      `${num(from.x - half)} ${num(Math.min(from.y, to.y))} ${num(thickness)} ${num(Math.abs(dy))} re`,
    ]
  else {
    const n = { x: (-dy / length) * half, y: (dx / length) * half }
    shape = [
      `${pt({ x: from.x + n.x, y: from.y + n.y })} m`,
      `${pt({ x: to.x + n.x, y: to.y + n.y })} l`,
      `${pt({ x: to.x - n.x, y: to.y - n.y })} l`,
      `${pt({ x: from.x - n.x, y: from.y - n.y })} l`,
      'h',
    ]
  }
  return [`${rgb(color)} rg`, ...shape, 'f']
}

/**
 * An image stretched over its rect and turned by `angle` about the rect's centre, as the screen
 * paints it: upright, its own width runs along the rect's height when the turn is a quarter.
 */
async function paintImage(
  scope: Scope,
  item: Extract<DrawItem, { kind: 'image' }>
): Promise<void> {
  const { rect, angle } = item
  const sideways = angle === 90 || angle === 270
  const width = sideways ? rect.height : rect.width
  const height = sideways ? rect.width : rect.height
  if (!(width > 0 && height > 0)) return
  const image = await imageOf(scope.shared, item.data, width, height)
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  const m = placed(TURNS[angle], center, -width / 2, -height / 2, width, height)
  scope.lines.push(
    'q',
    `${matrix(m)} cm`,
    `/${nameOf(scope.images, 'Im', image)} Do`,
    'Q'
  )
}

/**
 * PNG or JPEG, told by the bytes' signature: a browser draws an image by what its bytes hold,
 * whatever type its data URL names, and a stamp's data URL must name one of the two.
 */
function formatOf(data: Uint8Array): Image['format'] | undefined {
  const starts = (...bytes: number[]) => bytes.every((b, i) => data[i] === b)
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'png'
  if (starts(0xff, 0xd8, 0xff)) return 'jpeg'
  return undefined
}

/**
 * The image a data URL holds: PNG and JPEG as they are, anything else through `toPng` at four
 * pixels a point of the picture's own `width` and `height`. Each is made once per call.
 */
function imageOf(
  shared: Shared,
  url: string,
  width: number,
  height: number
): Promise<Image> {
  const decoded = decodeDataUrl(url)
  const format = decoded && formatOf(decoded.data)
  if (decoded && format) {
    let image = shared.images.get(url)
    if (!image) {
      image = Promise.resolve({ format, data: decoded.data })
      shared.images.set(url, image)
    }
    return image
  }
  const toPng = shared.helpers.toPng
  if (!toPng) throw new UnpaintableError('image')
  const pixels = [
    Math.max(1, Math.ceil(width * 4)),
    Math.max(1, Math.ceil(height * 4)),
  ] as const
  const key = `${pixels[0]}x${pixels[1]} ${url}`
  let image = shared.images.get(key)
  if (!image) {
    image = toPng(url, ...pixels).then((data) => ({ format: 'png' as const, data }))
    shared.images.set(key, image)
  }
  return image
}

/**
 * The page's own content as a loupe shows it: clipped to the lens circle, with `source` mapped
 * onto `target`. An empty source or lens shows nothing.
 */
function paintPage(scope: Scope, item: Extract<DrawItem, { kind: 'page' }>): void {
  const { source, target, clip } = item
  if (!(source.width > 0 && source.height > 0 && clip.radius > 0)) return
  const a = target.width / source.width
  const d = target.height / source.height
  const r = clip.radius
  const lens = { x: clip.center.x - r, y: clip.center.y - r, width: 2 * r, height: 2 * r }
  scope.pages.P0 = scope.shared.helpers.page
  scope.lines.push(
    'q',
    ...pathOperators(ellipseOutline(lens)),
    'W n',
    `${matrix([a, 0, 0, d, target.x - source.x * a, target.y - source.y * d])} cm`,
    '/P0 Do',
    'Q'
  )
}
