// Browser-safe: pdf-lib only, no Node imports.
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'

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

export async function newFixtureDoc(): Promise<{ d: PDFDocument; font: PDFFont }> {
  const d = await PDFDocument.create()
  d.setTitle('Inkbar fixture')
  d.setAuthor('Inkbar')
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
