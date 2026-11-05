/*
 * The annotation tour: a cover with a contents list, then three pages of three rows each, the
 * feature on the left and a box of real page content to try it on, on the right. The file
 * already holds one annotation of each type Inkbar reads, plus a signature stamp, as if a
 * reviewer had left them.
 */
import { PDFName, PDFString, type Color, type PDFDocument, type PDFRef } from 'pdf-lib'

import {
  BAR,
  DOT,
  H,
  INK,
  MUTED,
  PAD,
  PAPER,
  RULE,
  SIDE,
  annotation,
  boxTitle,
  featurePage,
  footer,
  header,
  newDocument,
  pdfRect,
  quad,
  save,
  type Box,
  type FontName,
  type Row,
  type Sheet,
} from './layout.ts'

const HEADING_LINE_2 = 'document'

/** What the cover says: its paragraphs and its contents list. */
export interface CoverCopy {
  label: string
  total: number
  paras: string[]
  contents: [string, number][]
}

/** Draws the cover and returns the box of the highlighted heading word, for the annotation. */
export function cover(s: Sheet, copy: CoverCopy): Box {
  header(s, true, copy.label)
  const size = 57
  const line1 = 212
  const line2 = line1 + 58
  s.text('Mark up this', SIDE, line1, { size, font: 'bold' })
  s.text(`${HEADING_LINE_2}.`, SIDE, line2, { size, font: 'bold' })
  const word = s.width(HEADING_LINE_2, size, 'bold')
  const highlight = { x: SIDE - 4, top: line2 - 44, w: word + 8, h: 56 }

  const body = { size: 13.5, leading: 21.6 }
  let y = line2 + 44 - 10
  for (const para of copy.paras) y = s.para(para, SIDE, y + 10, 405, body)

  y += 44
  s.text('Contents', SIDE, y, { size: 16.5, font: 'bold' })
  y += 14
  const right = SIDE + 420
  s.line(SIDE, y, right, y)
  for (const [title, page] of copy.contents) {
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
    copy.total,
    'Open-source PDF viewing, markup and forms for Vue, React and Svelte · inkbar.dev'
  )
  return highlight
}

export const markup: Row = {
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

export const notes: Row = {
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

export const textBoxes: Row = {
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

export const shapes: Row = {
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

export const ink: Row = {
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

export const signatures: Row = {
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

export const loupe: Row = {
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

export const mask: Row = {
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

export const redaction: Row = {
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

const TOUR_PAGES = 4
const LABEL = 'Annotation tour'

const TOUR_COVER: CoverCopy = {
  label: LABEL,
  total: TOUR_PAGES,
  paras: [
    'This PDF is a tour of the annotations Inkbar supports. Each page pairs a short note on the left with a box on the right that is yours to mark up.',
    'It already holds one annotation of each type, as a reviewer might leave them. Inkbar opens what a PDF already has.',
  ],
  contents: [
    ['Highlight, underline and strike', 2],
    ['Notes and replies', 2],
    ['Text boxes and callouts', 2],
    ['Shapes and lines', 3],
    ['Freehand ink', 3],
    ['Images and signatures', 3],
    ['Loupe', 4],
    ['Mask', 4],
    ['Redaction', 4],
  ],
}

/** The tour has no Suggest redactions plugin, so its redaction row asks for one by hand. */
const tourRedaction: Row = {
  ...redaction,
  body: 'Mark text or an area for removal. A redaction covers what is under it on the page.',
  tryIt: 'Try it: redact the NI number and the phone number.',
}

/** Ballpoint blue and the highlighter, as PDF colours from 0 to 1. */
const BALLPOINT = [0.153, 0.251, 0.961]
const YELLOW = [0.894, 1, 0.29]
const INK_PDF = [0.051, 0.063, 0.149]

/** The bounds of a run of points, `[x1, y1, x2, y2]`, grown by `pad`. */
function bounds(points: number[], pad: number): number[] {
  const xs = points.filter((_, i) => i % 2 === 0)
  const ys = points.filter((_, i) => i % 2 === 1)
  return [
    Math.min(...xs) - pad,
    Math.min(...ys) - pad,
    Math.max(...xs) + pad,
    Math.max(...ys) + pad,
  ]
}

/** A box grown by `by` on every side. */
const grow = (b: Box, by: number): Box => ({
  x: b.x - by,
  top: b.top - by,
  w: b.w + by * 2,
  h: b.h + by * 2,
})

const round = (n: number): number => Math.round(n * 100) / 100

/** Page 1: the heading's highlight, and a note with a reply beside it. */
function coverMarks(d: PDFDocument, word: Box): PDFRef[] {
  const ctx = d.context
  const [x1, y1, x2, y2] = pdfRect(word)
  const highlight = annotation(ctx, 'tour-highlight', {
    Subtype: 'Highlight',
    Rect: [x1, y1, x2, y2],
    QuadPoints: quad(word),
    C: YELLOW,
    CA: 0.6,
  })
  const at = [x2 + 70, y2 - 20, x2 + 90, y2]
  const note = annotation(ctx, 'tour-note', {
    Subtype: 'Text',
    Rect: at,
    Name: 'Comment',
    Contents: PDFString.of('Every annotation in this tour came in the file.'),
  })
  const reply = annotation(ctx, 'tour-reply', {
    Subtype: 'Text',
    Rect: at,
    IRT: note,
    RT: 'R',
    Contents: PDFString.of('Replies come in the file too.'),
    T: PDFString.of('Sam Carter'),
    M: PDFString.of('D:20261020093000Z'),
  })
  return [highlight, note, reply]
}

/** Page 2: underline, squiggly and strikeout on the text, and a typed name on the form. */
function markupMarks(d: PDFDocument, s: Sheet): PDFRef[] {
  const ctx = d.context
  const textMark = (id: string, subtype: string, box: Box, color: number[]) =>
    annotation(ctx, id, {
      Subtype: subtype,
      Rect: pdfRect(box),
      QuadPoints: quad(box),
      C: color,
    })
  const name = s.find('Full name')
  const typed = { x: name.x + 88, top: name.top - 3, w: 150, h: name.h + 4 }
  return [
    textMark('tour-underline', 'Underline', s.find('Schedule of Condition'), BALLPOINT),
    textMark('tour-squiggly', 'Squiggly', s.find('within 28 days'), [0.86, 0.16, 0.2]),
    textMark('tour-strikeout', 'StrikeOut', s.find('£96.00'), [0.86, 0.16, 0.2]),
    annotation(ctx, 'tour-freetext', {
      Subtype: 'FreeText',
      Rect: pdfRect(typed),
      Contents: PDFString.of('Joseph Mensah'),
      DA: PDFString.of(`/Helv 10.5 Tf ${BALLPOINT.join(' ')} rg`),
      BS: { W: 0 },
    }),
  ]
}

/** A signature drawn once, in the stamp's own space: a loop, a run of waves and a tail. */
const SIGNATURE_PATH =
  '4 10 m 10 30 20 30 18 14 c 16 2 8 6 14 16 c 22 28 30 4 38 14 c 44 22 50 8 56 14 c ' +
  '62 20 68 6 76 14 c 84 22 92 10 104 16 c'

/** Page 3: a circle and an arrow on the chart, a polygon and ink in the grid, a signature. */
function shapeMarks(d: PDFDocument, s: Sheet): PDFRef[] {
  const ctx = d.context
  const marks: PDFRef[] = []

  const target = grow(s.find('Target 40'), 5)
  marks.push(
    annotation(ctx, 'tour-circle', {
      Subtype: 'Circle',
      Rect: pdfRect(target),
      C: BALLPOINT,
      BS: { W: 1.5 },
    })
  )
  // The arrow runs from the circle down to the dashed target line, between May and June.
  const may = s.find('May 46')
  const jun = s.find('Jun 56')
  const axis = jun.baseline - 15
  const gap = (may.x + may.w / 2 + jun.x + jun.w / 2) / 2
  const from = { x: target.x + target.w / 2, y: H - target.top - target.h }
  const to = { x: gap, y: H - (axis - 40 * 1.6) + 2 }
  const line = [from.x, from.y, to.x, to.y].map(round)
  marks.push(
    annotation(ctx, 'tour-line', {
      Subtype: 'Line',
      Rect: bounds(line, 6),
      L: line,
      LE: ['None', 'OpenArrow'],
      C: BALLPOINT,
      BS: { W: 1.5 },
    })
  )

  // The grid fills the ink row's box; its label sits in the bottom right corner.
  const label = s.find('Sketch area')
  const right = label.x + label.w + 4.5
  const bottom = label.baseline
  const grid = { x: right - 251, top: bottom - 150, w: 251, h: 150 }
  const triangle = [
    grid.x + 20,
    H - grid.top - 120,
    grid.x + 100,
    H - grid.top - 120,
    grid.x + 60,
    H - grid.top - 40,
  ].map(round)
  marks.push(
    annotation(ctx, 'tour-polygon', {
      Subtype: 'Polygon',
      Rect: bounds(triangle, 2),
      Vertices: triangle,
      C: BALLPOINT,
      BS: { W: 1.5 },
    })
  )
  const wave = Array.from({ length: 25 }, (_, i) => [
    grid.x + 130 + i * 4,
    H - grid.top - 80 + Math.sin(i / 2) * 22,
  ])
    .flat()
    .map(round)
  marks.push(
    annotation(ctx, 'tour-ink', {
      Subtype: 'Ink',
      Rect: bounds(wave, 2),
      InkList: [wave],
      C: INK_PDF,
      BS: { W: 2 },
    })
  )

  // The landlord has signed; the tenant's line is left for the reader.
  const landlord = s.find('The Landlord, Harbour Lane Ltd')
  const sig = { x: landlord.x + 6, top: landlord.baseline - 13 - 34, w: 108, h: 32 }
  const appearance = ctx.register(
    ctx.stream(`0.051 0.063 0.149 RG 1.4 w 1 J 1 j ${SIGNATURE_PATH} S`, {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, sig.w, sig.h],
    })
  )
  marks.push(
    annotation(ctx, 'tour-signature', {
      Subtype: 'Stamp',
      Rect: pdfRect(sig),
      Name: 'Signature',
      Subj: PDFString.of('Signature'),
      Contents: PDFString.of('Signed for Harbour Lane Ltd'),
      AP: { N: appearance },
    })
  )
  return marks
}

/** Page 4: a box around the serial number. */
function plateMarks(d: PDFDocument, s: Sheet): PDFRef[] {
  return [
    annotation(d.context, 'tour-square', {
      Subtype: 'Square',
      Rect: pdfRect(grow(s.find('SN 0047-2219-B'), 3)),
      C: BALLPOINT,
      BS: { W: 1.5 },
    }),
  ]
}

export async function makeTour(): Promise<Uint8Array> {
  const { d, sheet } = await newDocument('Inkbar annotation tour')
  const page = (n: number) => ({ n, total: TOUR_PAGES, label: LABEL })
  const first = sheet()
  const word = cover(first, TOUR_COVER)
  const second = sheet()
  featurePage(second, page(2), [markup, notes, textBoxes])
  const third = sheet()
  featurePage(third, page(3), [shapes, ink, signatures])
  const fourth = sheet()
  featurePage(fourth, page(4), [loupe, mask, tourRedaction], 18)

  const marks: [Sheet, PDFRef[]][] = [
    [first, coverMarks(d, word)],
    [second, markupMarks(d, second)],
    [third, shapeMarks(d, third)],
    [fourth, plateMarks(d, fourth)],
  ]
  for (const [s, refs] of marks)
    s.page.node.set(PDFName.of('Annots'), d.context.obj(refs))
  return save(d)
}
