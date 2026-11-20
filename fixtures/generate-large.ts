// Browser-safe: pdf-lib only, no Node imports.
import {
  drawEllipse,
  drawObject,
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib'

/** Body lines shared by the text fixtures. */
export const BODY = [
  'Hello Inkbar. This document exercises text selection.',
  'National Insurance number QQ123456C appears here.',
  'Email: sam.hargreaves@hargreaves-mott.example',
  'The quick brown fox jumps over the lazy dog.',
]

/** Draws line `i` at x=72, baseline `y - i*24`, Helvetica 14. */
export function drawLines(page: PDFPage, font: PDFFont, lines: string[], y = 700): void {
  lines.forEach((line, i) =>
    page.drawText(line, { x: 72, y: y - i * 24, size: 14, font })
  )
}

/** Every fixture carries this date, so regenerating an unchanged fixture rewrites no bytes. */
export const FIXTURE_DATE = new Date('2026-10-12T11:00:00Z')

export async function newFixtureDoc(): Promise<{ d: PDFDocument; font: PDFFont }> {
  const d = await PDFDocument.create()
  d.setTitle('Inkbar fixture')
  d.setAuthor('Inkbar')
  d.setCreationDate(FIXTURE_DATE)
  d.setModificationDate(FIXTURE_DATE)
  const font = await d.embedFont(StandardFonts.Helvetica)
  return { d, font }
}

/** A Letter-page document of `pages` pages for performance tests. Never committed. */
export async function generateLarge(pages = 1000): Promise<Uint8Array> {
  const { d, font } = await newFixtureDoc()
  for (let p = 0; p < pages; p++) {
    const page = d.addPage([612, 792])
    drawLines(page, font, [`Page ${p + 1} of ${pages}`, ...BODY])
  }
  return d.save({ useObjectStreams: true })
}

/**
 * One Letter page that is slow to draw at a large scale: `forms` form XObjects, each holding
 * four half-transparent circles. A render can stop after each form, so at scale 6 this page takes
 * many short slices, for tests that stop a render part way. Never committed.
 */
export async function generateSlowPage(forms = 400): Promise<Uint8Array> {
  const { d } = await newFixtureDoc()
  const page = d.addPage([612, 792])
  const alpha = d.context.obj({ Type: 'ExtGState', ca: 0.4, CA: 0.6 })
  for (let f = 0; f < forms; f++) {
    const circles = [0, 1, 2, 3].flatMap((c) => {
      // A fixed walk, so every run draws the same page.
      const i = f * 4 + c
      const size = 20 + (i % 60)
      return drawEllipse({
        x: 36 + ((i * 37) % 540),
        y: 36 + ((i * 53) % 720),
        xScale: size,
        yScale: size,
        color: rgb((i % 7) / 7, (i % 11) / 11, (i % 13) / 13),
        borderColor: rgb(0, 0, 0),
        borderWidth: 1.5,
        graphicsState: 'A',
      })
    })
    const form = d.context.formXObject(circles, {
      BBox: [0, 0, 612, 792],
      Resources: { ExtGState: { A: alpha } },
    })
    page.pushOperators(drawObject(page.node.newXObject('Form', d.context.register(form))))
  }
  return d.save()
}
