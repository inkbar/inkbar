/*
 * What every generated sandbox document shares: an A4 sheet drawn top-down, the house colours
 * and standard fonts, the Inkbar header and footer, and the feature page of the annotation tour
 * and the form. Every name, number and address in the documents is made up: `QQ` National
 * Insurance prefixes are never issued, phone numbers are in Ofcom's drama range and every domain
 * is `example.com`.
 */
import {
  LineCapStyle,
  PDFDocument,
  PDFString,
  StandardFonts,
  rgb,
  type Color,
  type PDFContext,
  type PDFFont,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib'

import type { IconNode } from '@inkbar/icons'

export const W = 595.28
export const H = 841.89
export const SIDE = 48
export const TOP = 42

export const hex = (h: string): Color =>
  rgb(
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255
  )

export const INK = hex('#0D1026')
export const PAPER = hex('#F3F4F8')
export const RULE = hex('#C9CDDA')
export const MUTED = hex('#4A4F66')
export const HIGHLIGHTER = hex('#E4FF4A')
export const BAR = hex('#6B7190')
export const DOT = hex('#A3A8BD')
/** Ballpoint, for the step numbers of a guide. */
export const ACCENT = hex('#2740F5')
export const WHITE = rgb(1, 1, 1)

export interface Fonts {
  regular: PDFFont
  bold: PDFFont
  italic: PDFFont
  mono: PDFFont
}

export type FontName = keyof Fonts

export interface TextStyle {
  size: number
  font?: FontName
  color?: Color
  /** Where `x` sits on the run. Defaults to the left edge. */
  align?: 'left' | 'right' | 'center'
}

export interface Box {
  x: number
  /** Distance of the box's top edge from the top of the page, pt. */
  top: number
  w: number
  h: number
}

/** One run of text as drawn: its left edge, baseline (from the top) and style. */
interface Run {
  text: string
  x: number
  baseline: number
  size: number
  font: FontName
}

/** A page drawn top-down: every `top` is a distance from the top edge, in points. */
export class Sheet {
  readonly page: PDFPage
  readonly fonts: Fonts
  readonly #runs: Run[] = []

  constructor(page: PDFPage, fonts: Fonts) {
    this.page = page
    this.fonts = fonts
  }

  width(text: string, size: number, font: FontName = 'regular'): number {
    return this.fonts[font].widthOfTextAtSize(text, size)
  }

  /** Draws one run with its baseline `baseline` below the top of the page. */
  text(text: string, x: number, baseline: number, style: TextStyle): void {
    const font = style.font ?? 'regular'
    const w = this.width(text, style.size, font)
    const left =
      style.align === 'right' ? x - w : style.align === 'center' ? x - w / 2 : x
    this.page.drawText(text, {
      x: left,
      y: H - baseline,
      size: style.size,
      font: this.fonts[font],
      color: style.color ?? INK,
    })
    this.#runs.push({ text, x: left, baseline, size: style.size, font })
  }

  /** Word-wraps `text` to `width` and returns the baseline after the last line. */
  para(
    text: string,
    x: number,
    baseline: number,
    width: number,
    style: TextStyle & { leading: number }
  ): number {
    const font = style.font ?? 'regular'
    const lines: string[] = []
    let line = ''
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word
      if (line && this.width(next, style.size, font) > width) {
        lines.push(line)
        line = word
      } else line = next
    }
    if (line) lines.push(line)
    lines.forEach((l, i) => this.text(l, x, baseline + i * style.leading, style))
    return baseline + lines.length * style.leading
  }

  /**
   * The box around the `nth` run of `phrase` drawn on this sheet so far, from just below the
   * baseline to the top of the capitals. The phrase must sit on one line.
   */
  find(phrase: string, nth = 0): Box & { baseline: number } {
    let seen = 0
    for (const run of this.#runs) {
      let at = run.text.indexOf(phrase)
      while (at >= 0) {
        if (seen++ === nth) {
          const x = run.x + this.width(run.text.slice(0, at), run.size, run.font)
          return {
            x,
            baseline: run.baseline,
            top: run.baseline - run.size * 0.9,
            w: this.width(phrase, run.size, run.font),
            h: run.size * 1.15,
          }
        }
        at = run.text.indexOf(phrase, at + 1)
      }
    }
    throw new Error(`“${phrase}” is not on one line of this page`)
  }

  rect(
    box: Box,
    opts: { fill?: Color; stroke?: Color; strokeWidth?: number; radius?: number }
  ): void {
    const { x, top, w, h } = box
    const r = opts.radius ?? 0
    const style = {
      x,
      y: H - top,
      ...(opts.fill && { color: opts.fill }),
      ...(opts.stroke && {
        borderColor: opts.stroke,
        borderWidth: opts.strokeWidth ?? 0.75,
      }),
    }
    if (!r) {
      this.page.drawRectangle({ ...style, y: H - top - h, width: w, height: h })
      return
    }
    const path =
      `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} ` +
      `A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} ` +
      `V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`
    this.page.drawSvgPath(path, style)
  }

  line(
    x1: number,
    top1: number,
    x2: number,
    top2: number,
    opts: { color?: Color; width?: number; dash?: number[] } = {}
  ): void {
    this.page.drawLine({
      start: { x: x1, y: H - top1 },
      end: { x: x2, y: H - top2 },
      thickness: opts.width ?? 0.75,
      color: opts.color ?? RULE,
      ...(opts.dash && { dashArray: opts.dash }),
    })
  }

  dot(x: number, top: number, r: number, color: Color): void {
    this.page.drawCircle({ x, y: H - top, size: r, color })
  }

  /** Strokes a 24-unit Lucide icon at `size` points, its top left corner at `x`, `top`. */
  icon(icon: IconNode, x: number, top: number, size: number, color: Color = INK): void {
    const scale = size / 24
    for (const [tag, a] of icon) {
      const d = iconPath(tag, a)
      if (!d) continue
      this.page.drawSvgPath(d, {
        x,
        y: H - top,
        scale,
        borderColor: color,
        borderWidth: 2,
        borderLineCap: LineCapStyle.Round,
      })
    }
  }
}

/**
 * Path data with every token apart. An arc's two flags may be written run together, as in
 * `a4 4 0 00-2.756-3.266`, and pdf-lib's parser reads `00` as one number.
 */
function spaceArcFlags(d: string): string {
  const out: string[] = []
  const number = /^[+-]?(?:\d+\.?\d*|\.\d+)/
  let command = ''
  let arg = 0
  let i = 0
  while (i < d.length) {
    const c = d[i]!
    if (/[a-z]/i.test(c)) {
      command = c
      arg = 0
      out.push(c)
      i++
    } else if (/[\s,]/.test(c)) i++
    else if (/a/i.test(command) && (arg % 7 === 3 || arg % 7 === 4)) {
      out.push(c)
      arg++
      i++
    } else {
      const m = number.exec(d.slice(i))
      if (!m) throw new Error(`Unreadable path data at ${i}: ${d}`)
      out.push(m[0])
      arg++
      i += m[0].length
    }
  }
  return out.join(' ')
}

/** One element of a Lucide icon as SVG path data; @inkbar/icons uses only these four. */
function iconPath(tag: string, a: Readonly<Record<string, string>>): string | null {
  const n = (k: string): number => Number(a[k] ?? 0)
  switch (tag) {
    case 'path':
      return a.d ? spaceArcFlags(a.d) : null
    case 'line':
      return `M ${n('x1')} ${n('y1')} L ${n('x2')} ${n('y2')}`
    case 'circle': {
      const [cx, cy, r] = [n('cx'), n('cy'), n('r')]
      return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`
    }
    case 'rect': {
      const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')]
      const r = Math.min(n('rx'), w / 2, h / 2)
      return r
        ? `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} ` +
            `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} ` +
            `V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`
        : `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`
    }
    default:
      return null
  }
}

/** The mark: a lowercase "i" standing on a highlighter bar in a dark rounded tile. */
function mark(s: Sheet, x: number, top: number, size: number): void {
  s.rect({ x, top, w: size, h: size }, { fill: INK, radius: size * 0.27 })
  const glyph = size * 0.58
  s.text('i', x + size / 2, top + size * 0.66, {
    size: glyph,
    font: 'bold',
    color: WHITE,
    align: 'center',
  })
  const bar = size * 0.55
  s.rect(
    { x: x + (size - bar) / 2, top: top + size * 0.72, w: bar, h: size * 0.13 },
    { fill: HIGHLIGHTER }
  )
}

/** The mark and wordmark on the left, the document's name on the right. */
export function header(s: Sheet, large: boolean, label: string): void {
  const size = large ? 22.5 : 16.5
  mark(s, SIDE, TOP, size)
  s.text('inkbar', SIDE + size + (large ? 7.5 : 6), TOP + size * 0.74, {
    size: large ? 16.5 : 12.75,
    font: 'bold',
  })
  s.text(label, W - SIDE, TOP + size * 0.7, {
    size: 9.75,
    color: MUTED,
    align: 'right',
  })
}

/** `left` on the left, `n / total` on the right. */
export function footer(s: Sheet, n: number, total: number, left: string): void {
  const baseline = H - TOP
  s.text(left, SIDE, baseline, { size: 9.75, color: MUTED })
  s.text(`${n} / ${total}`, W - SIDE, baseline, {
    size: 9.75,
    font: 'mono',
    color: MUTED,
    align: 'right',
  })
}

/** One row of a feature page: the feature on the left, a box of content to try it on. */
/** A toolbar button as a guide draws it: its icon on a key, then its name. */
export interface GuideButton {
  icon: IconNode
  label: string
}

/** How to try a feature: the toolbar buttons it takes, then the steps in order. */
export interface Guide {
  buttons: GuideButton[]
  steps: string[]
}

export interface Row {
  weight?: number
  title: string
  body: string
  /** One line in italics: for features that need no toolbar button. */
  tryIt?: string
  guide?: Guide
  demo(s: Sheet, box: Box): void
}

const KEY = 17
const STEP = { size: 9.75, leading: 13 }

/** Draws `guide` in the feature column from `top` down. */
function drawGuide(s: Sheet, guide: Guide, top: number): void {
  // The buttons, as keys that wrap across the column.
  let x = SIDE
  let y = top
  for (const b of guide.buttons) {
    const w = KEY + 5 + s.width(b.label, 9.75, 'bold')
    if (x > SIDE && x + w > SIDE + COLUMN) {
      x = SIDE
      y += KEY + 5
    }
    s.rect({ x, top: y, w: KEY, h: KEY }, { fill: WHITE, stroke: RULE, radius: 3.5 })
    s.icon(b.icon, x + 3, y + 3, KEY - 6)
    s.text(b.label, x + KEY + 5, y + 12, { size: 9.75, font: 'bold' })
    x += w + 10
  }
  y += KEY + 6
  guide.steps.forEach((step, i) => {
    s.text(String(i + 1), SIDE, y + 9.5, { size: 9.75, font: 'bold', color: ACCENT })
    y = s.para(step, SIDE + 12, y + 9.5, COLUMN - 12, { ...STEP, color: MUTED }) - 9.5 + 4
  })
}

export const PAD = 18
const COLUMN = 188
const DEMO_X = SIDE + COLUMN + 24
const RULE_TOP = 72
const RULE_BOTTOM = 782

/** A page of rows, sharing the height between them by weight. */
export function featurePage(
  s: Sheet,
  page: { n: number; total: number; label: string },
  rows: Row[],
  pad = 21
): void {
  header(s, false, page.label)
  const total = rows.reduce((sum, r) => sum + (r.weight ?? 1), 0)
  let top = RULE_TOP
  for (const row of rows) {
    const height = ((RULE_BOTTOM - RULE_TOP) * (row.weight ?? 1)) / total
    s.line(SIDE, top, W - SIDE, top)

    let y = s.para(row.title, SIDE, top + pad + 15.5, COLUMN, {
      size: 19.5,
      leading: 22,
      font: 'bold',
    })
    y = s.para(row.body, SIDE, y + 9, COLUMN, { size: 10.75, leading: 16 })
    if (row.guide) drawGuide(s, row.guide, y + 3)
    else if (row.tryIt)
      s.para(row.tryIt, SIDE, y + 7, COLUMN, {
        size: 9.75,
        leading: 14,
        font: 'italic',
        color: MUTED,
      })

    const box = { x: DEMO_X, top: top + pad, w: W - SIDE - DEMO_X, h: height - pad * 2 }
    s.rect(box, { fill: PAPER, stroke: RULE, radius: 7.5 })
    row.demo(s, {
      x: box.x + PAD,
      top: box.top + PAD,
      w: box.w - PAD * 2,
      h: box.h - PAD * 2,
    })
    top += height
  }
  s.line(SIDE, RULE_BOTTOM, W - SIDE, RULE_BOTTOM)
  footer(s, page.n, page.total, 'inkbar.dev')
}

/** A demo box's title on the left and an optional aside on the right. */
export function boxTitle(
  s: Sheet,
  b: Box,
  title: string,
  aside?: string,
  asideMono = false
): void {
  s.text(title, b.x, b.top + 10, { size: 13.5, font: 'bold' })
  if (aside)
    s.text(aside, b.x + b.w, b.top + 10, {
      size: asideMono ? 9.4 : 9.75,
      font: asideMono ? 'mono' : 'regular',
      color: MUTED,
      align: 'right',
    })
}

/** Fixed dates keep the bytes the same from build to build. */
export const BUILT = new Date('2026-10-20T09:00:00Z')

/** A new document with its title, a fixed date and the four standard fonts embedded. */
export async function newDocument(
  title: string
): Promise<{ d: PDFDocument; fonts: Fonts; sheet: () => Sheet }> {
  const d = await PDFDocument.create()
  d.setTitle(title)
  d.setAuthor('Inkbar sandbox')
  d.setCreationDate(BUILT)
  d.setModificationDate(BUILT)
  const fonts: Fonts = {
    regular: await d.embedFont(StandardFonts.Helvetica),
    bold: await d.embedFont(StandardFonts.HelveticaBold),
    italic: await d.embedFont(StandardFonts.HelveticaOblique),
    mono: await d.embedFont(StandardFonts.Courier),
  }
  return { d, fonts, sheet: () => new Sheet(d.addPage([W, H]), fonts) }
}

/** pdf-lib would redraw the field appearances on save and undo any hand-set fonts. */
export const save = (d: PDFDocument): Promise<Uint8Array> =>
  d.save({ useObjectStreams: false, updateFieldAppearances: false })

/** A box in PDF user space, `[x1, y1, x2, y2]`, from a top-down box. */
export function pdfRect(b: Box): [number, number, number, number] {
  return [b.x, H - b.top - b.h, b.x + b.w, H - b.top]
}

/** The QuadPoints of a top-down box, in PDF order: top left, top right, bottom left, bottom right. */
export function quad(b: Box): number[] {
  const [x1, y1, x2, y2] = pdfRect(b)
  return [x1, y2, x2, y2, x1, y1, x2, y1]
}

/** What `PDFContext.obj` takes: pdf-lib does not export the type. */
export type Literal = NonNullable<Parameters<PDFContext['stream']>[1]>

/** Registers an annotation dictionary with the fields every embedded one carries. */
export function annotation(ctx: PDFContext, id: string, fields: Literal): PDFRef {
  return ctx.register(
    ctx.obj({
      Type: 'Annot',
      F: 4,
      T: PDFString.of('Inkbar'),
      NM: PDFString.of(id),
      M: PDFString.of('D:20261020090000Z'),
      ...fields,
    })
  )
}
