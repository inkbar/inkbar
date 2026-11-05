/*
 * The sandbox's sample document: a six-page tour of the annotations and forms Inkbar supports,
 * built from the scenario documents in `documents/`. A cover with a contents list, then three
 * pages of the annotation tour's rows and the form document's two pages. Page 1 carries two
 * annotations already in the file, so the viewer shows the embedded-annotation path. The
 * customer record on page 4 holds what the sandbox's Suggest redactions plugin finds (one
 * National Insurance number, two email addresses and one UK phone number).
 */
import { PDFName, PDFString } from 'pdf-lib'

import { finishForm, formRows } from './documents/form.ts'
import { H, featurePage, newDocument, save } from './documents/layout.ts'
import {
  cover,
  ink,
  loupe,
  markup,
  mask,
  notes,
  redaction,
  shapes,
  signatures,
  textBoxes,
} from './documents/tour.ts'

const PAGES = 6
const LABEL = 'Annotation tour'

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

export async function makeSample(): Promise<Uint8Array> {
  const { d, fonts, sheet } = await newDocument('Inkbar annotation tour (sample)')
  const page = (n: number) => ({ n, total: PAGES, label: LABEL })

  const first = sheet()
  const word = cover(first, {
    label: LABEL,
    total: PAGES,
    paras: [
      'This PDF is a tour of every annotation Inkbar supports. Each page pairs a short note on the left with a box on the right that is yours to mark up.',
      'The boxes hold real page content. Select the text, draw over the figures, sign the lines and redact the values.',
    ],
    contents: CONTENTS,
  })
  featurePage(sheet(), page(2), [markup, notes, textBoxes])
  featurePage(sheet(), page(3), [shapes, ink, signatures])
  featurePage(sheet(), page(4), [loupe, mask, redaction], 18)
  const form = formRows(d, fonts)
  featurePage(sheet(), page(5), form.fields)
  featurePage(sheet(), page(6), form.scripted)
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
  return save(d)
}
