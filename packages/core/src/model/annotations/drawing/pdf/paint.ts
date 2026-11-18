import { arcToCubics } from '../arc'
import { paintedRect } from '../extent'

import { num, rgbOf } from './operators'

import type { DrawItem, Drawing, Paint, PathCommand } from '../types'
import type { Appearance } from '@inkbar/engine'

type Rect = Drawing['bounds']
type Point = Extract<PathCommand, { op: 'A' }>['to']

export interface PaintHelpers {
  /** Index of the page the drawing is on, for `page` items. */
  page: number
}

type Opacity = { fill?: number; stroke?: number }
type Form = Appearance & { group?: boolean }

/** What one appearance has collected while its items were written. */
interface Scope {
  lines: string[]
  opacities: Record<string, Opacity>
  forms: Record<string, Form>
}

/**
 * `drawing` as PDF operators with the resources they name, in the drawing's own user space.
 * Each item is wrapped in `q` and `Q`; equal resources share one name.
 */
export function paintDrawing(
  drawing: Drawing,
  _helpers: PaintHelpers
): Promise<Appearance> {
  try {
    return Promise.resolve(appearance(drawing.bounds, drawing.items))
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)))
  }
}

function appearance(bounds: Rect, items: readonly DrawItem[]): Appearance {
  const scope: Scope = { lines: [], opacities: {}, forms: {} }
  for (const item of items) paintItem(scope, item)
  const out: Appearance = { bounds, content: ascii(scope.lines.join('\n')) }
  if (Object.keys(scope.opacities).length > 0) out.opacities = scope.opacities
  if (Object.keys(scope.forms).length > 0) out.forms = scope.forms
  return out
}

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0x7f
  return out
}

/** The name of the opacity state with these values, adding it on first use. */
function opacityName(scope: Scope, value: Opacity): string {
  for (const [name, have] of Object.entries(scope.opacities))
    if (have.fill === value.fill && have.stroke === value.stroke) return name
  const name = `GS${Object.keys(scope.opacities).length}`
  scope.opacities[name] = value
  return name
}

function paintItem(scope: Scope, item: DrawItem): void {
  switch (item.kind) {
    case 'text':
    case 'image':
    case 'page':
      throw new Error('not painted yet')
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

function paintGroup(scope: Scope, item: Extract<DrawItem, { kind: 'group' }>): void {
  const bounds = paintedRect(item)
  if (!bounds) return
  const inner = appearance(bounds, item.items)
  if (inner.content.length === 0) return
  const name = `Fm${Object.keys(scope.forms).length}`
  scope.forms[name] = { ...inner, group: true }
  scope.lines.push('q')
  if (item.opacity < 1)
    scope.lines.push(
      `/${opacityName(scope, { fill: item.opacity, stroke: item.opacity })} gs`
    )
  scope.lines.push(`/${name} Do`, 'Q')
}

function paintPath(
  scope: Scope,
  commands: readonly PathCommand[],
  paint: Paint,
  fillRule: 'nonzero' | 'evenodd' = 'nonzero'
): void {
  const fill = paint.fill
  const stroke = paint.stroke && paint.stroke.width > 0 ? paint.stroke : undefined
  if (!fill && !stroke) return
  const out: string[] = ['q']
  if (fill && fill.opacity !== undefined && fill.opacity < 1)
    out.push(`/${opacityName(scope, { fill: fill.opacity })} gs`)
  if (fill) out.push(`${rgb(fill.color)} rg`)
  if (stroke) {
    out.push(`${rgb(stroke.color)} RG`, `${num(stroke.width)} w`)
    if (stroke.join) out.push(`${stroke.join === 'round' ? 1 : 0} j`)
    if (stroke.cap) out.push(`${stroke.cap === 'round' ? 1 : 0} J`)
    if (stroke.dashes && stroke.dashes.length > 0)
      out.push(`[${stroke.dashes.map(num).join(' ')}] 0 d`)
  }
  out.push(...pathOperators(commands))
  const star = fillRule === 'evenodd' ? '*' : ''
  if (fill && stroke) out.push(`B${star}`)
  else if (fill) out.push(`f${star}`)
  else out.push('S')
  out.push('Q')
  scope.lines.push(...out)
}

const rgb = (color: string): string => rgbOf(color).map(num).join(' ')

const pt = (p: Point): string => `${num(p.x)} ${num(p.y)}`

/** Path construction operators: arcs become curves, `Z` becomes `h`. */
function pathOperators(commands: readonly PathCommand[]): string[] {
  const out: string[] = []
  let at: Point | undefined
  let start: Point | undefined
  for (const c of commands) {
    switch (c.op) {
      case 'M':
        out.push(`${pt(c.to)} m`)
        at = start = c.to
        break
      case 'L':
        out.push(`${pt(c.to)} l`)
        at = c.to
        break
      case 'C':
        out.push(`${pt(c.c1)} ${pt(c.c2)} ${pt(c.to)} c`)
        at = c.to
        break
      case 'A': {
        if (at)
          for (const piece of arcToCubics(at, c))
            out.push(`${pt(piece.c1)} ${pt(piece.c2)} ${pt(piece.to)} c`)
        else out.push(`${pt(c.to)} m`)
        at = c.to
        break
      }
      case 'Z':
        out.push('h')
        at = start
        break
    }
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
