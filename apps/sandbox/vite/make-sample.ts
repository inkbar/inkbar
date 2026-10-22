/*
 * The sandbox's sample document: a four-page tour of the annotations Inkbar supports. A cover
 * with a contents list, then three pages of three rows each: the feature on the left and a box
 * of real page content to try it on, on the right. Page 1 carries two annotations already in
 * the file, so the viewer shows the embedded-annotation path. The customer record on page 4
 * holds what the sandbox's Suggest redactions plugin finds (one National Insurance number,
 * two email addresses and one UK phone number). Every name, number and address is made up:
 * `QQ` National Insurance prefixes are never issued, the phone number is in Ofcom's drama
 * range and the domain is `example.com`.
 */
import {
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
  rgb,
  type Color,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib'

const W = 595.28
const H = 841.89
const SIDE = 48
const TOP = 42
const PAGES = 4

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
    s.text(title, SIDE, y + 17, { size: 11.25 })
    s.text(String(page), right, y + 17, {
      size: 11.25,
      font: 'mono',
      color: MUTED,
      align: 'right',
    })
    y += 26
    s.line(SIDE, y, right, y)
  }

  footer(
    s,
    1,
    'Open-source PDF viewing and markup for Vue, React and Svelte · inkbar.dev'
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
  return d.save({ useObjectStreams: false })
}
