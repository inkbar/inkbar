/*
 * The sandbox's sample document: a fictional, three-page housing case file with text the
 * suggester can find (three National Insurance numbers, three email addresses and three UK
 * phone numbers) and two annotations already in the file, so the viewer shows the
 * embedded-annotation path. Every name, number and address is made up: `QQ` National
 * Insurance prefixes are never issued, the phone numbers are in Ofcom's drama ranges and the
 * domains end in `.example`.
 */
import {
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib'

const A4: [number, number] = [595.28, 841.89]
const LEFT = 64
const RE_LINE = 'Re: Review of your tenancy, case FH-2026-0418'

interface Line {
  text: string
  bold?: boolean
  size?: number
  /** Distance from the previous baseline, pt. Defaults to 1.6 × size. */
  gap?: number
}

interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

/** Draws `lines` top-down from `top` and returns each line's baseline y. */
function drawLines(page: PDFPage, fonts: Fonts, lines: Line[], top = 790): number[] {
  let y = top
  return lines.map((line) => {
    const size = line.size ?? 11
    y -= line.gap ?? size * 1.6
    if (line.text)
      page.drawText(line.text, {
        x: LEFT,
        y,
        size,
        font: line.bold ? fonts.bold : fonts.regular,
      })
    return y
  })
}

const LETTER: Line[] = [
  { text: 'Fernhill Housing Trust', bold: true, size: 18 },
  { text: '14 Orchard Row, Leeds LS2 7QQ', size: 10 },
  { text: 'casework@fernhill.example  |  0113 496 0000', size: 10 },
  { text: '14 October 2026', gap: 40 },
  { text: 'Ms Alex Rowan', gap: 28 },
  { text: 'Flat 3, 22 Weaver Street, Leeds LS6 1AB' },
  { text: RE_LINE, bold: true, size: 12, gap: 36 },
  { text: 'Dear Ms Rowan,', gap: 28 },
  {
    text: 'Thank you for meeting us on 2 October. This letter confirms what we agreed and',
    gap: 24,
  },
  { text: 'sets out the next steps in the review of your tenancy.' },
  {
    text: 'We hold your National Insurance number as QQ123456C. Please tell us if it is wrong.',
    gap: 24,
  },
  {
    text: 'If anything here is unclear, call your case officer, Jordan Pike, on 07700 900123,',
    gap: 24,
  },
  { text: 'or email jordan.pike@fernhill.example.' },
  { text: 'Yours sincerely,', gap: 36 },
  { text: 'Jordan Pike', gap: 40 },
  { text: 'Case officer' },
]

const DETAILS: Line[] = [
  { text: 'Claimant details', bold: true, size: 16 },
  { text: 'Name: Alex Rowan', gap: 32 },
  { text: 'Date of birth: 9 March 1988' },
  { text: 'National Insurance number: QQ654321A' },
  { text: 'Email: alex.rowan@example.com' },
  { text: 'Phone: 020 7946 0991' },
  { text: 'Address: Flat 3, 22 Weaver Street, Leeds LS6 1AB' },
  { text: 'Tenancy start: 1 June 2021' },
  { text: 'Household: 2 adults, 1 child' },
  { text: 'Partner: Sam Rowan, National Insurance number QQ246813B' },
]

const NOTES: Line[] = [
  { text: 'Meeting notes, 2 October 2026', bold: true, size: 16 },
  { text: 'Present: Alex Rowan, Jordan Pike.', gap: 32 },
  { text: 'Rent account is up to date since the payment plan began in July.' },
  { text: 'Repairs: damp in the back bedroom reported twice; surveyor visit booked.' },
  {
    text: 'Agreed: the Trust will confirm the outcome of the review in writing within 28 days.',
  },
  { text: "Action: Jordan to send the surveyor's report once it arrives." },
]

export async function makeSample(): Promise<Uint8Array> {
  const d = await PDFDocument.create()
  d.setTitle('Fernhill Housing Trust: tenancy review (sample)')
  d.setAuthor('Inkbar sandbox')
  // Fixed dates keep the bytes the same from build to build.
  d.setCreationDate(new Date('2026-10-14T09:00:00Z'))
  d.setModificationDate(new Date('2026-10-14T09:00:00Z'))
  const fonts: Fonts = {
    regular: await d.embedFont(StandardFonts.Helvetica),
    bold: await d.embedFont(StandardFonts.HelveticaBold),
  }

  const letter = d.addPage(A4)
  const ys = drawLines(letter, fonts, LETTER)
  drawLines(d.addPage(A4), fonts, DETAILS)
  drawLines(d.addPage(A4), fonts, NOTES)

  // One highlight over the subject line and one note beside it, as a case officer left them.
  const reY = ys[LETTER.findIndex((l) => l.text === RE_LINE)] ?? 600
  const reW = fonts.bold.widthOfTextAtSize(RE_LINE, 12)
  const top = reY + 12
  const bottom = reY - 3
  const ctx = d.context
  const highlight = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Highlight',
      F: 4,
      Rect: [LEFT, bottom, LEFT + reW, top],
      QuadPoints: [LEFT, top, LEFT + reW, top, LEFT, bottom, LEFT + reW, bottom],
      C: [0.894, 1, 0.29],
      CA: 0.6,
      T: PDFString.of('Case officer'),
      NM: PDFString.of('sample-highlight'),
      M: PDFString.of('D:20261014090000Z'),
    })
  )
  const note = ctx.register(
    ctx.obj({
      Type: 'Annot',
      Subtype: 'Text',
      F: 4,
      Rect: [510, reY - 4, 530, reY + 16],
      Name: 'Comment',
      Contents: PDFString.of('Check the tenancy start date before this goes out.'),
      T: PDFString.of('Case officer'),
      NM: PDFString.of('sample-note'),
      M: PDFString.of('D:20261014091500Z'),
    })
  )
  letter.node.set(PDFName.of('Annots'), ctx.obj([highlight, note]))
  return d.save({ useObjectStreams: false })
}
