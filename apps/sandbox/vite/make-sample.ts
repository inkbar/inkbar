/*
 * The sandbox's sample document: a six-page tour of the annotations and forms Inkbar supports.
 * A cover with a contents list, then five pages of three rows each: the feature on the left and
 * a box of real page content to try it on, on the right. Pages 5 and 6 are a form to fill in.
 * Page 1 carries two annotations already in the file, so the viewer shows the
 * embedded-annotation path. The customer record on page 4
 * holds what the sandbox's Suggest redactions plugin finds (one National Insurance number,
 * two email addresses and one UK phone number). Every name, number and address is made up:
 * `QQ` National Insurance prefixes are never issued, the phone number is in Ofcom's drama
 * range and the domain is `example.com`.
 */
import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  StandardFonts,
  degrees,
  rgb,
  type Color,
  type PDFContext,
  type PDFField,
  type PDFFont,
  type PDFForm,
  type PDFPage,
  type PDFRadioGroup,
} from 'pdf-lib'

const W = 595.28
const H = 841.89
const SIDE = 48
const TOP = 42
const PAGES = 6

const hex = (h: string): Color =>
  rgb(
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255
  )

const INK = hex('#0D1026')
const PAPER = hex('#F3F4F8')
const RULE = hex('#C9CDDA')
const MUTED = hex('#4A4F66')
const HIGHLIGHTER = hex('#E4FF4A')
const BAR = hex('#6B7190')
const DOT = hex('#A3A8BD')
const WHITE = rgb(1, 1, 1)

interface Fonts {
  regular: PDFFont
  bold: PDFFont
  italic: PDFFont
  mono: PDFFont
}

type FontName = keyof Fonts

interface TextStyle {
  size: number
  font?: FontName
  color?: Color
  /** Where `x` sits on the run. Defaults to the left edge. */
  align?: 'left' | 'right' | 'center'
}

interface Box {
  x: number
  /** Distance of the box's top edge from the top of the page, pt. */
  top: number
  w: number
  h: number
}

/** A page drawn top-down: every `top` is a distance from the top edge, in points. */
class Sheet {
  readonly page: PDFPage
  readonly fonts: Fonts

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

function header(s: Sheet, large: boolean): void {
  const size = large ? 22.5 : 16.5
  mark(s, SIDE, TOP, size)
  s.text('inkbar', SIDE + size + (large ? 7.5 : 6), TOP + size * 0.74, {
    size: large ? 16.5 : 12.75,
    font: 'bold',
  })
  s.text('Annotation tour', W - SIDE, TOP + size * 0.7, {
    size: 9.75,
    color: MUTED,
    align: 'right',
  })
}

function footer(s: Sheet, n: number, left: string): void {
  const baseline = H - TOP
  s.text(left, SIDE, baseline, { size: 9.75, color: MUTED })
  s.text(`${n} / ${PAGES}`, W - SIDE, baseline, {
    size: 9.75,
    font: 'mono',
    color: MUTED,
    align: 'right',
  })
}

const CONTENTS: [string, number][] = [
  ['Highlight, underline and strike', 2],
  ['Notes and replies', 2],
  ['Text boxes and callouts', 2],
  ['Shapes and lines', 3],
  ['Freehand ink', 3],
  ['Images and signatures', 3],
  ['Loupe', 4],
  ['Mask', 4],
  ['Redaction', 4],
  ['Form fields', 5],
  ['Scripted forms', 6],
]

const HEADING_LINE_2 = 'document'

/** Draws the cover and returns the box of the highlighted heading word, for the annotation. */
function cover(s: Sheet): Box {
  header(s, true)
  const size = 57
  const line1 = 212
  const line2 = line1 + 58
  s.text('Mark up this', SIDE, line1, { size, font: 'bold' })
  s.text(`${HEADING_LINE_2}.`, SIDE, line2, { size, font: 'bold' })
  const word = s.width(HEADING_LINE_2, size, 'bold')
  const highlight = { x: SIDE - 4, top: line2 - 44, w: word + 8, h: 56 }

  const body = { size: 13.5, leading: 21.6 }
  let y = s.para(
    'This PDF is a tour of every annotation Inkbar supports. Each page pairs a short note on the left with a box on the right that is yours to mark up.',
    SIDE,
    line2 + 44,
    405,
    body
  )
  y = s.para(
    'The boxes hold real page content. Select the text, draw over the figures, sign the lines and redact the values.',
    SIDE,
    y + 10,
    405,
    body
  )

  y += 44
  s.text('Contents', SIDE, y, { size: 16.5, font: 'bold' })
  y += 14
  const right = SIDE + 420
  s.line(SIDE, y, right, y)
  for (const [title, page] of CONTENTS) {
    s.text(title, SIDE, y + 16, { size: 11.25 })
    s.text(String(page), right, y + 16, {
      size: 11.25,
      font: 'mono',
      color: MUTED,
      align: 'right',
    })
    y += 24
    s.line(SIDE, y, right, y)
  }

  footer(
    s,
    1,
    'Open-source PDF viewing, markup and forms for Vue, React and Svelte · inkbar.dev'
  )
  return highlight
}

interface Row {
  weight?: number
  title: string
  body: string
  tryIt: string
  demo(s: Sheet, box: Box): void
}

const COLUMN = 188
const DEMO_X = SIDE + COLUMN + 24
const RULE_TOP = 72
const RULE_BOTTOM = 782
const PAD = 18

function featurePage(s: Sheet, n: number, rows: Row[], pad = 21): void {
  header(s, false)
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
  footer(s, n, 'inkbar.dev')
}

/** A demo box's title on the left and an optional aside on the right. */
function boxTitle(
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

const markup: Row = {
  title: 'Highlight, underline and strike',
  body: 'Select text and mark it four ways: highlight, underline, strikethrough or a squiggly underline. Each mark follows the text it covers, across line breaks.',
  tryIt:
    'Try it: highlight “good and substantial repair”, then strike out “fair wear and tear excepted”.',
  demo(s, b) {
    s.text('Clause 4.2 · Repairs', b.x, b.top + 8, {
      size: 9.4,
      font: 'mono',
      color: MUTED,
    })
    const style = { size: 10.5, leading: 16 }
    const y = s.para(
      'The Tenant shall keep the interior of the Premises in good and substantial repair and condition, and shall yield them up at the end of the Term in the state shown in the Schedule of Condition, fair wear and tear excepted.',
      b.x,
      b.top + 30,
      b.w,
      style
    )
    s.para(
      'Damage caused by the Tenant’s contractors must be made good within 28 days.',
      b.x,
      y + 6,
      b.w,
      style
    )
  },
}

const notes: Row = {
  title: 'Notes and replies',
  body: 'Pin a note anywhere on the page. Each note opens into a thread, so reviewers can reply to each other without leaving the document.',
  tryIt: 'Try it: pin a note to the total and ask where the travel cost came from.',
  demo(s, b) {
    boxTitle(s, b, 'Invoice 2041', 'Due 14 November 2026')
    const qty = b.x + b.w - 84
    const amount = b.x + b.w
    const rows: [string, string, string][] = [
      ['Site survey', '1', '£450.00'],
      ['Structural report', '1', '£1,200.00'],
      ['Travel', '3', '£96.00'],
    ]
    let y = b.top + 26
    const row = (cells: [string, string, string], font: FontName, rule?: Color): void => {
      const style = { size: 10.75, font }
      s.text(cells[0], b.x, y + 15, style)
      s.text(cells[1], qty, y + 15, { ...style, align: 'right' })
      s.text(cells[2], amount, y + 15, { ...style, align: 'right' })
      y += 22
      if (rule) s.line(b.x, y, b.x + b.w, y, { color: rule })
    }
    row(['Item', 'Qty', 'Amount'], 'bold', INK)
    for (const r of rows) row(r, 'regular', RULE)
    row(['Total', '', '£1,746.00'], 'bold')
  },
}

const textBoxes: Row = {
  title: 'Text boxes and callouts',
  body: 'Type straight onto the page, in any font, size, colour or alignment. A callout adds a leader line so the text points at what it’s about.',
  tryIt:
    'Try it: fill in the form with text boxes, then point a callout at the postcode.',
  demo(s, b) {
    boxTitle(s, b, 'Delivery details')
    const fields: [string, number][] = [
      ['Full name', 0],
      ['Address', 0],
      ['', 0],
      ['Postcode', 90],
      ['Delivery date', 120],
    ]
    const start = b.x + 84
    let y = b.top + 26
    for (const [label, width] of fields) {
      y += 25
      if (label) s.text(label, b.x, y, { size: 10.5 })
      s.line(start, y + 2, width ? start + width : b.x + b.w, y + 2, { color: INK })
    }
  },
}

const MONTHS: [string, number][] = [
  ['Jan', 44],
  ['Feb', 47],
  ['Mar', 52],
  ['Apr', 23],
  ['May', 46],
  ['Jun', 56],
]

const shapes: Row = {
  title: 'Shapes and lines',
  body: 'Rectangles, ellipses, lines, arrows, open polylines and closed polygons. Set the stroke colour, width and fill on each one.',
  tryIt: 'Try it: circle the month that missed target and box the best one.',
  demo(s, b) {
    boxTitle(s, b, 'Signed contracts per month', 'Target 40')
    const axis = b.top + b.h - 20
    const scale = 1.6
    const gap = 13.5
    const inset = 4.5
    const bar = (b.w - inset * 2 - gap * (MONTHS.length - 1)) / MONTHS.length
    MONTHS.forEach(([month, value], i) => {
      const x = b.x + inset + i * (bar + gap)
      const h = value * scale
      s.rect({ x, top: axis - h, w: bar, h }, { fill: BAR })
      s.text(`${month} ${value}`, x + bar / 2, axis + 15, { size: 9.75, align: 'center' })
    })
    s.line(b.x, axis, b.x + b.w, axis, { color: INK })
    const target = axis - 40 * scale
    s.line(b.x, target, b.x + b.w, target, { color: INK, width: 1.1, dash: [4, 3] })
  },
}

const ink: Row = {
  title: 'Freehand ink',
  body: 'Draw with a mouse, pen or finger. Sketch a rough line, arrow, rectangle, ellipse, polygon or star and Inkbar can turn it into a clean shape.',
  tryIt: 'Try it: draw a wobbly star in the grid and watch it straighten out.',
  demo(s, b) {
    // The dots run out to the box's own edge, inside its padding.
    const step = 15
    for (let y = b.top - PAD + 7.5; y < b.top + b.h + PAD - 3; y += step)
      for (let x = b.x - PAD + 7.5; x < b.x + b.w + PAD - 3; x += step)
        s.dot(x, y, 0.9, DOT)
    const label = 'Sketch area'
    const w = s.width(label, 9.75)
    s.rect(
      { x: b.x + b.w - w - 9, top: b.top + b.h - 14, w: w + 9, h: 18 },
      { fill: PAPER }
    )
    s.text(label, b.x + b.w - 4.5, b.top + b.h, {
      size: 9.75,
      color: MUTED,
      align: 'right',
    })
  },
}

const signatures: Row = {
  title: 'Images and signatures',
  body: 'Place a PNG or JPEG anywhere on the page. Draw, type or upload a signature once, then drop it onto any line that needs it.',
  tryIt: 'Try it: sign for the tenant and add today’s date.',
  demo(s, b) {
    s.text('Signed by both parties on the date written below.', b.x, b.top + 10, {
      size: 10.5,
    })
    const date = b.x + b.w - 72
    const block = (top: number, who: string): void => {
      s.line(b.x, top, date - 15, top, { color: INK })
      s.line(date, top, b.x + b.w, top, { color: INK })
      s.text(who, b.x, top + 13, { size: 9.75 })
      s.text('Date', date, top + 13, { size: 9.75 })
    }
    block(b.top + 62, 'The Landlord, Harbour Lane Ltd')
    block(b.top + 118, 'The Tenant, Joseph Mensah')
  },
}

const loupe: Row = {
  weight: 0.85,
  title: 'Loupe',
  body: 'A magnifier you leave on the page. It shows what sits under its centre at twice the size or more.',
  tryIt: 'Try it: put a loupe over the serial number.',
  demo(s, b) {
    boxTitle(s, b, 'Rating plate')
    const cells = [
      ['MODEL HX-220', 'SN 0047-2219-B', '230 V ~ 50 Hz', '1.8 kW'],
      ['IPX4', 'CLASS I', 'MFD 06/2026', 'LOT 7731'],
    ]
    const col = b.w / 4
    cells.forEach((row, r) =>
      row.forEach((cell, c) =>
        s.text(cell, b.x + c * col, b.top + 30 + r * 11, { size: 6, font: 'mono' })
      )
    )
    s.para(
      'Disconnect from the supply before removing the cover. Service by a qualified person only. Replace the fuse with one of the same type and rating (T 10 A H 250 V). Do not cover the vents. Keep the unit upright during transport and allow two hours at room temperature before switching on.',
      b.x,
      b.top + 60,
      b.w,
      { size: 6, leading: 8.7 }
    )
  },
}

const mask: Row = {
  weight: 0.95,
  title: 'Mask',
  body: 'Dim the whole page except one rectangle or ellipse, to point a reader at a single row or figure.',
  tryIt: 'Try it: mask everything but the delayed train.',
  demo(s, b) {
    const dest = b.x + 48
    const platform = b.x + b.w - 70
    const rows: [string, string, string, string][] = [
      ['07:42', 'York', '4', 'On time'],
      ['07:58', 'Manchester Piccadilly', '1', 'On time'],
      ['08:15', 'London Kings Cross', '8', 'Exp 08:41'],
      ['08:22', 'Hull', '12', 'On time'],
    ]
    let y = b.top - 4
    const row = (
      cells: [string, string, string, string],
      bold: boolean,
      rule?: Color
    ) => {
      const style = { size: 10.5, font: (bold ? 'bold' : 'regular') as FontName }
      s.text(cells[0], b.x, y + 15, style)
      s.text(cells[1], dest, y + 15, style)
      s.text(cells[2], platform, y + 15, { ...style, align: 'right' })
      s.text(cells[3], b.x + b.w, y + 15, {
        ...style,
        font: bold || cells[3].startsWith('Exp') ? 'bold' : 'regular',
        align: 'right',
      })
      y += 23
      if (rule) s.line(b.x, y, b.x + b.w, y, { color: rule })
    }
    row(['Time', 'Destination', 'Platform', 'Status'], true, INK)
    rows.forEach((r, i) => row(r, false, i < rows.length - 1 ? RULE : undefined))
  },
}

const redaction: Row = {
  weight: 1.35,
  title: 'Redaction',
  body: "Mark text or an area for removal. This sandbox adds suggested redactions as a plugin on Inkbar's public API, each with a reason and a confidence level. Accept or dismiss each one.",
  tryIt:
    'Try it: press Suggest redactions at the top. It finds the NI number, the emails and the phone number. Redact the name by hand.',
  demo(s, b) {
    boxTitle(s, b, 'Customer record', 'Ref C-30918', true)
    const fields: [string, string][] = [
      ['Name', 'Margaret Okafor'],
      ['Customer since', 'March 2019'],
      ['NI number', 'QQ123456C'],
      ['Email', 'm.okafor@example.com'],
      ['Phone', '07700 900123'],
      ['Plan', 'Household, billed monthly'],
    ]
    let y = b.top + 20
    fields.forEach(([label, value], i) => {
      s.text(label, b.x, y + 15, { size: 10.75, color: MUTED })
      s.text(value, b.x + 105, y + 15, { size: 10.75 })
      y += 22
      if (i < fields.length - 1) s.line(b.x, y, b.x + b.w, y)
    })
    s.para(
      'Called on 2 October about a duplicate charge. Refund agreed; confirmation sent to m.okafor@example.com.',
      b.x,
      y + 22,
      b.w,
      { size: 10.5, leading: 16 }
    )
  },
}

/*
 * Pages 5 and 6 are a form: every field and script of the form fixtures in
 * fixtures/generate.ts (`form-fields` and `form-scripted`), under the same names, so a test or a
 * tester can reach for the same field in either. The rows draw the fields; `finishForm` then
 * writes what pdf-lib has no helper for.
 */

const FIELD_H = 17
const FIELD_PITCH = 34
const FIELD_BORDER = hex('#8A8FA8')
const HELV = '/Helv 10 Tf 0 g'

/** A field's rectangle as pdf-lib takes it, from a top-down box. */
function at(x: number, top: number, w: number, h = FIELD_H) {
  return { x, y: H - top - h, width: w, height: h }
}

/** A PDF literal string with `\`, `(` and `)` escaped; UTF-16 hex when the text is not ASCII. */
function pdfText(value: string): PDFString | PDFHexString {
  return /^[\x20-\x7e]*$/.test(value)
    ? PDFString.of(value.replace(/[\\()]/g, (c) => `\\${c}`))
    : PDFHexString.fromText(value)
}

function js(ctx: PDFContext, code: string): PDFDict {
  return ctx.obj({ S: 'JavaScript', JS: pdfText(code) })
}

function widgetDict(field: PDFField, i = 0): PDFDict {
  const w = field.acroField.getWidgets()[i]
  if (!w) throw new Error(`${field.getName()} has no widget ${i}`)
  return w.dict
}

/** Sets /DA on the field and drops any copy pdf-lib wrote on its widgets. */
function setDA(field: PDFField, da: string): void {
  field.acroField.dict.set(PDFName.of('DA'), PDFString.of(da))
  for (const w of field.acroField.getWidgets()) w.dict.delete(PDFName.of('DA'))
}

/** pdf-lib names radio on-states 0, 1, …; this renames them and drops the /Opt it wrote. */
function nameRadioStates(radio: PDFRadioGroup, states: string[], value: string): void {
  radio.acroField.getWidgets().forEach((w, i) => {
    const ap = w.dict.lookup(PDFName.of('AP'), PDFDict)
    for (const key of ['N', 'D']) {
      const sub = ap.lookupMaybe(PDFName.of(key), PDFDict)
      const stream = sub?.get(PDFName.of(String(i)))
      if (!sub || !stream) continue
      sub.delete(PDFName.of(String(i)))
      sub.set(PDFName.of(states[i]!), stream)
    }
    w.dict.set(PDFName.of('AS'), PDFName.of(states[i] === value ? value : 'Off'))
  })
  radio.acroField.dict.delete(PDFName.of('Opt'))
  radio.acroField.dict.set(PDFName.of('V'), PDFName.of(value))
}

/**
 * pdf-lib registers each new non-terminal twice and keeps one, leaving an unreferenced copy
 * in the file. This deletes the copy so the file holds one `header` dictionary.
 */
function dropDuplicateParent(d: PDFDocument, field: PDFField): void {
  const parent = field.acroField.dict.get(PDFName.of('Parent'))
  const t = field.acroField.dict
    .lookup(PDFName.of('Parent'), PDFDict)
    .get(PDFName.of('T'))
  for (const [r, o] of d.context.enumerateIndirectObjects()) {
    if (r !== parent && o instanceof PDFDict && o.get(PDFName.of('T')) === t)
      d.context.delete(r)
  }
}

/** An empty signature field: pdf-lib has no helper for one. */
function signatureField(form: PDFForm, page: PDFPage, name: string, box: Box): void {
  const ctx = page.doc.context
  const ref = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      F: 4,
      FT: 'Sig',
      T: PDFString.of(name),
      P: page.ref,
      Rect: [box.x, H - box.top - box.h, box.x + box.w, H - box.top],
      MK: { BC: [0.541, 0.561, 0.659] },
    })
  )
  form.acroForm.addField(ref)
  page.node.addAnnot(ref)
}

/** The form's rows: one page of every field type and flag, one of scripts and actions. */
function formRows(d: PDFDocument, fonts: Fonts): { fields: Row[]; scripted: Row[] } {
  const form = d.getForm()
  const look = {
    font: fonts.regular,
    borderColor: FIELD_BORDER,
    borderWidth: 0.75,
    backgroundColor: WHITE,
    textColor: INK,
  }
  const label = (s: Sheet, text: string, x: number, top: number): void =>
    s.text(text, x, top - 4, { size: 9, color: MUTED })
  /** Fields go in two columns, one row every FIELD_PITCH below the box title. */
  const grid = (b: Box) => {
    const w = (b.w - 14) / 2
    return {
      w,
      left: b.x,
      right: b.x + w + 14,
      top: (i: number) => b.top + FIELD_PITCH + i * FIELD_PITCH,
    }
  }
  const text = (
    s: Sheet,
    name: string,
    caption: string,
    box: { x: number; top: number; w: number; h?: number }
  ) => {
    const f = form.createTextField(name)
    f.addToPage(s.page, { ...at(box.x, box.top, box.w, box.h), ...look })
    f.setFontSize(10)
    label(s, caption, box.x, box.top)
    return f
  }
  /** A checkbox or radio button with its text to the right. */
  const beside = (s: Sheet, text: string, x: number, top: number): void =>
    s.text(text, x + 18, top + 9.5, { size: 10.5 })

  const textFields: Row = {
    weight: 1.05,
    title: 'Text fields',
    body: 'Single-line, multiline, password and comb fields, with a maximum length, auto-size text, and read-only, required and no-export flags.',
    tryIt: 'Try it: type your name, then press Tab to move through the form.',
    demo(s, b) {
      boxTitle(s, b, 'Club membership')
      const g = grid(b)
      const name = text(s, 'name', 'Full name', { x: g.left, top: g.top(0), w: g.w })
      name.setText('Sam Carter')
      name.setAlignment(0)
      text(s, 'email', 'Email (required)', {
        x: g.right,
        top: g.top(0),
        w: g.w,
      }).enableRequired()
      const pin = text(s, 'pin', 'PIN', { x: g.left, top: g.top(1), w: 44 })
      pin.enablePassword()
      pin.setMaxLength(4)
      const code = text(s, 'code', 'Code (comb)', {
        x: g.left + 56,
        top: g.top(1),
        w: g.w - 56,
      })
      code.setMaxLength(6)
      code.enableCombing()
      const locked = text(s, 'locked', 'Member no. (read-only)', {
        x: g.right,
        top: g.top(1),
        w: g.w,
      })
      locked.setText('M-0042')
      locked.enableReadOnly()
      text(s, 'auto', 'Nickname (auto size)', { x: g.left, top: g.top(2), w: g.w })
      const internal = text(s, 'internal', 'Office use (no export)', {
        x: g.right,
        top: g.top(2),
        w: g.w,
      })
      internal.setText('Batch 7')
      internal.disableExporting()
      text(s, 'styled', 'Boat name (Times bold)', { x: g.left, top: g.top(3), w: g.w })
      const notes = text(s, 'notes', 'Notes (multiline)', {
        x: g.right,
        top: g.top(3),
        w: g.w,
        h: 30,
      })
      notes.enableMultiline()
      notes.setAlignment(1)
    },
  }

  const choices: Row = {
    weight: 1,
    title: 'Choices',
    body: 'Checkboxes, radio buttons, drop-downs and lists. A drop-down can take typed text, and a list can hold several picks.',
    tryIt: 'Try it: pick yearly, then choose two interests.',
    demo(s, b) {
      boxTitle(s, b, 'Preferences')
      const g = grid(b)
      const tick = { ...look, width: 12, height: 12 }
      const box = (x: number, top: number) => ({ ...tick, ...at(x, top + 2, 12, 12) })

      label(s, 'Rules', g.left, g.top(0))
      form.createCheckBox('agree').addToPage(s.page, box(g.left, g.top(0)))
      beside(s, 'I agree', g.left, g.top(0))

      label(s, 'Plan', g.right, g.top(0))
      const plan = form.createRadioGroup('plan')
      plan.addOptionToPage('monthly', s.page, box(g.right, g.top(0)))
      plan.addOptionToPage('yearly', s.page, box(g.right + 66, g.top(0)))
      plan.select('monthly')
      beside(s, 'Monthly', g.right, g.top(0))
      beside(s, 'Yearly', g.right + 66, g.top(0))

      // Two widgets share the export value "A" but have their own on-states, so they toggle apart.
      label(s, 'Shared value', g.left, g.top(1))
      const shared = form.createRadioGroup('shared')
      shared.addOptionToPage('A', s.page, box(g.left, g.top(1)))
      shared.addOptionToPage('A', s.page, box(g.left + 50, g.top(1)))
      beside(s, 'A', g.left, g.top(1))
      beside(s, 'A', g.left + 50, g.top(1))

      const country = form.createDropdown('country')
      country.setOptions(['United Kingdom', 'France'])
      country.select('United Kingdom')
      country.addToPage(s.page, { ...at(g.right, g.top(1), g.w), ...look })
      country.setFontSize(10)
      label(s, 'Country', g.right, g.top(1))

      const city = form.createDropdown('city')
      city.setOptions(['Leeds', 'Lyon', 'Lisbon'])
      city.enableEditing()
      city.addToPage(s.page, { ...at(g.left, g.top(2), g.w), ...look })
      city.setFontSize(10)
      label(s, 'City (pick or type)', g.left, g.top(2))

      const interests = form.createOptionList('interests')
      interests.setOptions(['maths', 'engines', 'poetry'])
      interests.enableMultiselect()
      interests.addToPage(s.page, { ...at(g.right, g.top(2), g.w, 44), ...look })
      interests.setFontSize(10)
      label(s, 'Interests (pick several)', g.right, g.top(2))
    },
  }

  const signing: Row = {
    weight: 0.95,
    title: 'Signatures and layout',
    body: 'Sign a signature field with a saved signature. One field can show in two places, and a field can turn on the page.',
    tryIt: 'Try it: sign as the member, then press Reset.',
    demo(s, b) {
      boxTitle(s, b, 'Sign and reset')
      const g = grid(b)
      const sigTop = g.top(0)
      signatureField(form, s.page, 'sig', { x: g.left, top: sigTop, w: g.w, h: 32 })
      label(s, 'Member', g.left, sigTop)
      signatureField(form, s.page, 'sig2', { x: g.right, top: sigTop, w: g.w, h: 32 })
      label(s, 'Witness', g.right, sigTop)

      const lower = sigTop + 32 + 22
      const ref = text(s, 'header.ref', 'Reference (in two places)', {
        x: g.left,
        top: lower,
        w: g.w,
      })
      dropDuplicateParent(d, ref)
      ref.setText('REF-0042')
      const reset = form.createButton('reset')
      reset.addToPage('Reset', s.page, { ...at(g.left, lower + 30, 64, 20), ...look })
      reset.setFontSize(10)

      // /MK /R 90 turns the field's content; the rectangle stays as the page has it.
      label(s, 'Turned', g.right, lower)
      const turned = { ...look, rotate: degrees(90) }
      const tall = (x: number) => ({ x, y: H - lower - 52, width: FIELD_H, height: 52 })
      ref.addToPage(s.page, { ...turned, ...tall(g.right) })
      ref.acroField.getWidgets()[1]!.setRectangle(tall(g.right))
      const rotated = form.createTextField('rotated')
      rotated.addToPage(s.page, { ...turned, ...tall(g.right + 30) })
      rotated.acroField.getWidgets()[0]!.setRectangle(tall(g.right + 30))
      rotated.setFontSize(10)
    },
  }

  const calculations: Row = {
    weight: 0.85,
    title: 'Calculations and formats',
    body: 'Scripts in the PDF format numbers, money and dates, check what you type and work out totals as you go.',
    tryIt: 'Try it: order 3 at 12.50 and watch the total.',
    demo(s, b) {
      boxTitle(s, b, 'Order', 'Prices in pounds')
      const g = grid(b)
      const third = (b.w - 20) / 3
      text(s, 'qty', 'Quantity', { x: b.x, top: g.top(0), w: third })
      text(s, 'price', 'Unit price', { x: b.x + third + 10, top: g.top(0), w: third })
      text(s, 'total', 'Total', {
        x: b.x + (third + 10) * 2,
        top: g.top(0),
        w: third,
      }).enableReadOnly()
      text(s, 'when', 'Delivery date (dd/mm/yyyy)', { x: g.left, top: g.top(1), w: g.w })
      text(s, 'age', 'Age (18 to 120)', { x: g.right, top: g.top(1), w: 56 })
      s.para(
        'The total is quantity × unit price, worked out by a script in the PDF. An age outside 18 to 120 is refused.',
        b.x,
        g.top(2) + 4,
        b.w,
        { size: 9.75, leading: 14, color: MUTED }
      )
    },
  }

  const showHide: Row = {
    weight: 0.7,
    title: 'Show and hide',
    body: 'A script can show or hide other fields.',
    tryIt: 'Try it: tick the box to show one more field.',
    demo(s, b) {
      boxTitle(s, b, 'Delivery')
      const g = grid(b)
      form
        .createCheckBox('more')
        .addToPage(s.page, { ...look, ...at(g.left, g.top(0) - 12, 12, 12) })
      beside(s, 'Send to a second address', g.left, g.top(0) - 14)
      form
        .createTextField('extra')
        .addToPage(s.page, { ...look, ...at(g.left, g.top(1) - 14, b.w), hidden: true })
    },
  }

  const buttons: Row = {
    weight: 1.45,
    title: 'Buttons and actions',
    body: 'Buttons can submit the form, send mail, open a link, print or show a message. Inkbar never sends or opens anything itself: it hands each request to the page.',
    tryIt: 'Try it: press Submit, then look at the Form panel beside the viewer.',
    demo(s, b) {
      boxTitle(s, b, 'Actions')
      const captions: [string, string][] = [
        ['hello', 'Hello'],
        ['ask', 'Ask'],
        ['submit', 'Submit'],
        ['mail', 'Mail'],
        ['link', 'Link'],
        ['print', 'Print'],
        ['send', 'Send'],
        ['site', 'Site'],
        ['clear', 'Clear'],
      ]
      const w = (b.w - 20) / 3
      captions.forEach(([name, caption], i) => {
        const x = b.x + (i % 3) * (w + 10)
        const top = b.top + 26 + Math.floor(i / 3) * 30
        const button = form.createButton(name)
        button.addToPage(caption, s.page, { ...at(x, top, w, 22), ...look })
        button.setFontSize(10)
      })
      s.para(
        'Hello shows a message and Ask asks a question. Submit and Send post the form, Mail starts an email, Link and Site open a page, Print prints. Clear empties the form.',
        b.x,
        b.top + 136,
        b.w,
        { size: 9.75, leading: 14, color: MUTED }
      )
    },
  }

  return {
    fields: [textFields, choices, signing],
    scripted: [calculations, showHide, buttons],
  }
}

/** Writes what pdf-lib has no helper for: fonts, flags, option lists and every script. */
function finishForm(d: PDFDocument, fonts: Fonts): void {
  const ctx = d.context
  const form = d.getForm()
  form.updateFieldAppearances(fonts.regular)

  // Every hand-written /DA names /Helv, a plain Helvetica in the AcroForm /DR.
  const acro = form.acroForm.dict
  const dr = acro.lookupMaybe(PDFName.of('DR'), PDFDict) ?? ctx.obj({})
  const dict = dr.lookupMaybe(PDFName.of('Font'), PDFDict) ?? ctx.obj({})
  const type1 = (base: string) =>
    ctx.register(
      ctx.obj({
        Type: 'Font',
        Subtype: 'Type1',
        BaseFont: base,
        Encoding: 'WinAnsiEncoding',
      })
    )
  dict.set(PDFName.of('Helv'), type1('Helvetica'))
  // /F1 is a resource name, not a family: only the /DR says it is Times-Bold.
  dict.set(PDFName.of('F1'), type1('Times-Bold'))
  dr.set(PDFName.of('Font'), dict)
  acro.set(PDFName.of('DR'), dr)
  acro.set(PDFName.of('DA'), PDFString.of(HELV))
  for (const f of form.getFields())
    if (f.acroField.dict.has(PDFName.of('DA'))) setDA(f, HELV)
  setDA(form.getTextField('auto'), '/Helv 0 Tf 0 g')
  setDA(form.getTextField('styled'), '/F1 10 Tf 0.153 0.251 0.961 rg')

  form.getTextField('email').acroField.dict.set(PDFName.of('TU'), PDFString.of('Email'))
  // /TU names one field and is not inherited: header.ref has none of its own.
  form
    .getTextField('header.ref')
    .acroField.dict.lookup(PDFName.of('Parent'), PDFDict)
    .set(PDFName.of('TU'), PDFString.of('Header'))
  form.getCheckBox('agree').acroField.dict.set(PDFName.of('V'), PDFName.of('Off'))
  const plan = form.getRadioGroup('plan')
  nameRadioStates(plan, ['monthly', 'yearly'], 'monthly')
  plan.acroField.dict.set(PDFName.of('DV'), PDFName.of('yearly'))
  const shared = form.getRadioGroup('shared').acroField.dict
  shared.set(PDFName.of('V'), PDFName.of('Off'))
  // Both states map to the shared export "A"; /DV names the second widget's state.
  shared.set(PDFName.of('DV'), PDFName.of('1'))
  const country = form.getDropdown('country').acroField.dict
  country.set(
    PDFName.of('Opt'),
    ctx.obj([
      [PDFString.of('gb'), PDFString.of('United Kingdom')],
      [PDFString.of('fr'), PDFString.of('France')],
    ])
  )
  country.set(PDFName.of('V'), PDFString.of('gb'))
  widgetDict(form.getButton('reset')).set(PDFName.of('A'), ctx.obj({ S: 'ResetForm' }))

  const scripts = (name: string, actions: Record<string, string>): void => {
    const aa: Record<string, PDFDict> = {}
    for (const [k, code] of Object.entries(actions)) aa[k] = js(ctx, code)
    form.getField(name).acroField.dict.set(PDFName.of('AA'), ctx.obj(aa))
  }
  const pounds = '2, 0, 0, 0, "£", true'
  scripts('qty', {
    K: 'AFNumber_Keystroke(0, 0, 0, 0, "", true)',
    F: 'AFNumber_Format(0, 0, 0, 0, "", true)',
  })
  scripts('price', {
    K: `AFNumber_Keystroke(${pounds})`,
    F: `AFNumber_Format(${pounds})`,
  })
  scripts('total', {
    C: 'AFSimple_Calculate("PRD", new Array("qty", "price"))',
    F: `AFNumber_Format(${pounds})`,
  })
  scripts('when', {
    K: 'AFDate_KeystrokeEx("dd/mm/yyyy")',
    F: 'AFDate_FormatEx("dd/mm/yyyy")',
  })
  scripts('age', { V: 'event.rc = event.value >= 18 && event.value <= 120' })
  acro.set(PDFName.of('CO'), ctx.obj([form.getTextField('total').ref]))
  widgetDict(form.getCheckBox('more')).set(
    PDFName.of('AA'),
    ctx.obj({
      U: js(
        ctx,
        'this.getField("extra").display = event.target.value == "Off" ? display.hidden : display.visible'
      ),
    })
  )

  const action = (name: string, a: PDFDict): void =>
    widgetDict(form.getButton(name)).set(PDFName.of('A'), a)
  action('hello', js(ctx, 'app.alert("Hello")'))
  action('ask', js(ctx, 'app.response("Name?")'))
  action('submit', js(ctx, 'this.submitForm("https://example.com/submit")'))
  action('mail', js(ctx, 'this.mailDoc(false, "forms@example.com")'))
  action('link', js(ctx, 'app.launchURL("https://example.com", true)'))
  action('print', js(ctx, 'this.print()'))
  action(
    'send',
    ctx.obj({ S: 'SubmitForm', F: PDFString.of('https://example.com/xfdf'), Flags: 32 })
  )
  action('site', ctx.obj({ S: 'URI', URI: PDFString.of('https://example.com') }))
  action('clear', ctx.obj({ S: 'ResetForm' }))
  d.addJavaScript('init', 'var formReady = true;')
}

export async function makeSample(): Promise<Uint8Array> {
  const d = await PDFDocument.create()
  d.setTitle('Inkbar annotation tour (sample)')
  d.setAuthor('Inkbar sandbox')
  // Fixed dates keep the bytes the same from build to build.
  d.setCreationDate(new Date('2026-10-20T09:00:00Z'))
  d.setModificationDate(new Date('2026-10-20T09:00:00Z'))
  const fonts: Fonts = {
    regular: await d.embedFont(StandardFonts.Helvetica),
    bold: await d.embedFont(StandardFonts.HelveticaBold),
    italic: await d.embedFont(StandardFonts.HelveticaOblique),
    mono: await d.embedFont(StandardFonts.Courier),
  }
  const sheet = () => new Sheet(d.addPage([W, H]), fonts)

  const first = sheet()
  const word = cover(first)
  featurePage(sheet(), 2, [markup, notes, textBoxes])
  featurePage(sheet(), 3, [shapes, ink, signatures])
  featurePage(sheet(), 4, [loupe, mask, redaction], 18)
  const form = formRows(d, fonts)
  featurePage(sheet(), 5, form.fields)
  featurePage(sheet(), 6, form.scripted)
  finishForm(d, fonts)

  // The heading's highlight and a note beside it come in the file, as if a reviewer left them.
  const top = H - word.top
  const bottom = top - word.h
  const right = word.x + word.w
  const ctx = d.context
  const highlight = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Highlight',
      F: 4,
      Rect: [word.x, bottom, right, top],
      QuadPoints: [word.x, top, right, top, word.x, bottom, right, bottom],
      C: [0.894, 1, 0.29],
      CA: 0.6,
      T: PDFString.of('Inkbar'),
      NM: PDFString.of('sample-highlight'),
      M: PDFString.of('D:20261020090000Z'),
    })
  )
  const note = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Text',
      F: 4,
      Rect: [right + 70, top - 20, right + 90, top],
      Name: 'Comment',
      Contents: PDFString.of(
        'This note and the highlight came in the file. Inkbar opens annotations a PDF already has.'
      ),
      T: PDFString.of('Inkbar'),
      NM: PDFString.of('sample-note'),
      M: PDFString.of('D:20261020091500Z'),
    })
  )
  first.page.node.set(PDFName.of('Annots'), ctx.obj([highlight, note]))
  // pdf-lib would redraw the field appearances on save and undo `finishForm`'s fonts.
  return d.save({ useObjectStreams: false, updateFieldAppearances: false })
}
