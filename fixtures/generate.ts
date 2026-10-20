import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  degrees,
  rgb,
  type PDFContext,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib'

import { BODY, drawLines as text, newFixtureDoc as doc } from './generate-large'

import type { FixtureMeta } from './index'
import type { FixtureName } from './urls'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'pdf')

const manifest: Partial<Record<FixtureName, FixtureMeta>> = {}

function note(name: FixtureName, meta: Omit<FixtureMeta, 'file'>) {
  manifest[name] = { file: `${name}.pdf`, ...meta }
}

function annot(ctx: PDFContext, dict: Record<string, unknown>): PDFRef {
  return ctx.register(ctx.obj({ Type: 'Annot', F: 4, ...dict } as never))
}

function setAnnots(page: PDFPage, refs: PDFRef[]) {
  page.node.set(PDFName.of('Annots'), page.doc.context.obj(refs))
}

function write(name: FixtureName, bytes: Uint8Array) {
  writeFileSync(join(out, `${name}.pdf`), bytes)
}

async function save(
  name: FixtureName,
  d: PDFDocument,
  meta: Omit<FixtureMeta, 'file'>,
  opts?: { objectStreams?: boolean }
) {
  const bytes = await d.save({ useObjectStreams: opts?.objectStreams ?? false })
  write(name, bytes)
  note(name, meta)
  return bytes
}

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1')
const fromLatin1 = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'))

async function textSimple() {
  const { d, font } = await doc()
  for (let p = 0; p < 3; p++) {
    const page = d.addPage([612, 792])
    text(page, font, [`Page ${p + 1}`, ...BODY])
  }
  return save('text-simple', d, {
    pages: 3,
    opens: true,
    describes: 'Three Letter pages of Helvetica text, no annotations',
  })
}

async function userUnit2() {
  const { d, font } = await doc()
  for (let p = 0; p < 3; p++) {
    const page = d.addPage([612, 792])
    page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2))
    text(page, font, [`Page ${p + 1}`, ...BODY])
  }
  return save('userunit-2', d, {
    pages: 3,
    opens: true,
    describes:
      'Copy of text-simple with /UserUnit 2 on every page, so each page renders at twice its point size',
  })
}

async function textRotated(deg: 90 | 180 | 270) {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  page.setRotation(degrees(deg))
  text(page, font, [`Rotated ${deg}`, ...BODY])
  await save(`text-rotated-${deg}`, d, {
    pages: 1,
    opens: true,
    describes: `One Letter page with /Rotate ${deg}; text drawn unrotated in user space`,
  })
}

async function textCjk() {
  const { d, font } = await doc()
  const page = d.addPage([595, 842])
  page.drawText('CJK placeholder: Latin text only, no CJK glyphs in this file', {
    x: 40,
    y: 780,
    size: 10,
    font,
  })
  await save('text-cjk', d, {
    pages: 1,
    opens: true,
    describes:
      'Stand-in: an A4 page of Latin Helvetica text. pdf-lib standard fonts have no CJK glyphs, so this file contains no CJK text until a redistributable CJK font is embedded',
  })
}

async function cropboxOffset() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  page.setCropBox(50, 50, 500, 700)
  text(page, font, ['CropBox offset by 50pt', ...BODY], 650)
  const ctx = d.context
  setAnnots(page, [
    annot(ctx, {
      Subtype: 'Square',
      Rect: [100, 100, 200, 160],
      C: [1, 0, 0],
      BS: { W: 2 },
      NM: PDFString.of('sq-1'),
    }),
  ])
  await save('cropbox-offset', d, {
    pages: 1,
    opens: true,
    describes:
      'CropBox [50 50 550 750] inside a Letter MediaBox; one Square annotation at user-space (100,100)',
    annotations: { Square: 1 },
  })
}

async function mixedPageSizes() {
  const { d, font } = await doc()
  for (const size of [
    [612, 792],
    [595, 842],
    [842, 595],
    [300, 300],
  ] as const) {
    const page = d.addPage([size[0], size[1]])
    text(page, font, [`Size ${size[0]}x${size[1]}`], size[1] - 60)
  }
  await save('mixed-page-sizes', d, {
    pages: 4,
    opens: true,
    describes: 'Letter, A4 portrait, A4 landscape, square',
  })
}

async function annotatedMarkup() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, BODY)
  const ctx = d.context
  setAnnots(page, [
    annot(ctx, {
      Subtype: 'Highlight',
      Rect: [72, 695, 400, 715],
      QuadPoints: [72, 715, 400, 715, 72, 695, 400, 695],
      C: [1, 1, 0],
      CA: 0.5,
      T: PDFString.of('Ed'),
      Contents: PDFString.of('highlighted'),
      M: PDFString.of('D:20261012120000Z'),
      NM: PDFString.of('hl-1'),
    }),
    annot(ctx, {
      Subtype: 'Underline',
      Rect: [72, 671, 400, 691],
      QuadPoints: [72, 691, 400, 691, 72, 671, 400, 671],
      C: [0, 0, 1],
      NM: PDFString.of('ul-1'),
    }),
    annot(ctx, {
      Subtype: 'StrikeOut',
      Rect: [72, 647, 400, 667],
      QuadPoints: [72, 667, 400, 667, 72, 647, 400, 647],
      C: [1, 0, 0],
      NM: PDFString.of('so-1'),
    }),
    annot(ctx, {
      Subtype: 'Squiggly',
      Rect: [72, 623, 400, 643],
      QuadPoints: [72, 643, 400, 643, 72, 623, 400, 623],
      C: [0, 0.5, 0],
      NM: PDFString.of('sq-1'),
    }),
  ])
  await save('annotated-markup', d, {
    pages: 1,
    opens: true,
    describes: 'One of each text-markup subtype on page 1',
    annotations: { Highlight: 1, Underline: 1, StrikeOut: 1, Squiggly: 1 },
  })
}

async function annotatedNotesThreaded() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, BODY)
  const ctx = d.context
  const root = annot(ctx, {
    Subtype: 'Text',
    Rect: [400, 700, 420, 720],
    Name: 'Comment',
    Contents: PDFString.of('Root note'),
    T: PDFString.of('Ed'),
    NM: PDFString.of('note-root'),
    CreationDate: PDFString.of('D:20261012110000Z'),
    M: PDFString.of('D:20261012110500Z'),
  })
  const reply1 = annot(ctx, {
    Subtype: 'Text',
    Rect: [400, 700, 420, 720],
    IRT: root,
    RT: 'R',
    Contents: PDFString.of('First reply'),
    T: PDFString.of('Sam'),
    NM: PDFString.of('note-reply-1'),
    M: PDFString.of('D:20261012111000Z'),
  })
  const reply2 = annot(ctx, {
    Subtype: 'Text',
    Rect: [400, 700, 420, 720],
    IRT: root,
    RT: 'R',
    Contents: PDFString.of('Second reply'),
    T: PDFString.of('Ed'),
    NM: PDFString.of('note-reply-2'),
    M: PDFString.of('D:20261012112000Z'),
  })
  const lone = annot(ctx, {
    Subtype: 'Text',
    Rect: [72, 500, 92, 520],
    Name: 'Note',
    Contents: PDFString.of('Standalone'),
    T: PDFString.of('Ed'),
    NM: PDFString.of('note-lone'),
  })
  setAnnots(page, [root, reply1, reply2, lone])
  await save('annotated-notes-threaded', d, {
    pages: 1,
    opens: true,
    describes: 'A note with two replies (IRT) and one standalone note',
    annotations: { Text: 4 },
  })
}

async function annotatedRedact() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, BODY)
  const ctx = d.context
  setAnnots(page, [
    annot(ctx, {
      Subtype: 'Redact',
      Rect: [72, 671, 300, 691],
      QuadPoints: [72, 691, 300, 691, 72, 671, 300, 671],
      IC: [0, 0, 0],
      OverlayText: PDFString.of('REDACTED'),
      NM: PDFString.of('redact-1'),
    }),
    annot(ctx, {
      Subtype: 'Redact',
      Rect: [72, 600, 200, 640],
      IC: [0, 0, 0],
      NM: PDFString.of('redact-2'),
    }),
  ])
  await save('annotated-redact', d, {
    pages: 1,
    opens: true,
    describes:
      'Two unapplied Redact annotations, one text-based with QuadPoints and one area',
    annotations: { Redact: 2 },
  })
}

async function annotatedShapes() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, ['Shapes'])
  const ctx = d.context
  setAnnots(page, [
    annot(ctx, {
      Subtype: 'Square',
      Rect: [72, 500, 200, 600],
      C: [1, 0, 0],
      IC: [1, 1, 0.8],
      BS: { W: 3 },
      NM: PDFString.of('square-1'),
    }),
    annot(ctx, {
      Subtype: 'Circle',
      Rect: [250, 500, 350, 600],
      C: [0, 0, 1],
      BS: { W: 1 },
      NM: PDFString.of('circle-1'),
    }),
    annot(ctx, {
      Subtype: 'Line',
      Rect: [72, 400, 400, 450],
      L: [72, 400, 400, 450],
      C: [0, 0, 0],
      BS: { W: 2 },
      NM: PDFString.of('line-1'),
    }),
    annot(ctx, {
      Subtype: 'Polygon',
      Rect: [72, 250, 300, 380],
      Vertices: [72, 250, 300, 250, 186, 380],
      C: [0, 0.5, 0],
      BS: { W: 1 },
      NM: PDFString.of('poly-1'),
    }),
    annot(ctx, {
      Subtype: 'Ink',
      Rect: [350, 250, 550, 380],
      InkList: [[350, 250, 400, 380, 450, 250, 500, 380, 550, 250]],
      C: [0.5, 0, 0.5],
      BS: { W: 2 },
      NM: PDFString.of('ink-1'),
    }),
    annot(ctx, {
      Subtype: 'FreeText',
      Rect: [72, 100, 300, 160],
      DA: PDFString.of('/Helv 12 Tf 0 g'),
      Contents: PDFString.of('Free text box'),
      C: [1, 1, 1],
      NM: PDFString.of('ft-1'),
    }),
  ])
  await save('annotated-shapes', d, {
    pages: 1,
    opens: true,
    describes: 'Square, Circle, Line, Polygon, Ink and FreeText',
    annotations: { Square: 1, Circle: 1, Line: 1, Polygon: 1, Ink: 1, FreeText: 1 },
  })
}

/**
 * A FreeText callout stored the standard way, matching the JSON sample in
 * `packages/core/src/model/annotations/__fixtures__/standard-callout.json`: a 180 x 60 box at
 * (100, 600), a three-point leader from the tip (60, 520) and an open arrow at the tip, in red.
 */
async function standardCallout() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, ['Standard callout'])
  const ctx = d.context
  const rect = [56.5, 516.5, 283.5, 663.5]
  const tip = { x: 60, y: 520 }
  const bend = { x: 80, y: 560 }
  const edge = { x: 100, y: 620 }
  // An open arrow 3 pt long and 3 pt across, pointing from the bend to the tip.
  const len = Math.hypot(tip.x - bend.x, tip.y - bend.y)
  const dx = (tip.x - bend.x) / len
  const dy = (tip.y - bend.y) / len
  const wing = (side: 1 | -1) =>
    `${(tip.x - dx * 3 - dy * 1.5 * side).toFixed(3)} ${(tip.y - dy * 3 + dx * 1.5 * side).toFixed(3)}`
  const red = '0.816 0 0'
  const content = [
    `${red} RG ${red} rg 1 w 1 j 0 J`,
    // The box.
    '100 600 180 60 re S',
    // The leader, tip to box.
    `${tip.x} ${tip.y} m ${bend.x} ${bend.y} l ${edge.x} ${edge.y} l S`,
    // The arrow at the tip.
    `${wing(1)} m ${tip.x} ${tip.y} l ${wing(-1)} l S`,
    'BT /Helv 12 Tf 104 644 Td (Standard callout) Tj ET',
  ].join('\n')
  const appearance = ctx.register(
    ctx.stream(content, {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: rect,
      Resources: { Font: { Helv: font.ref } },
    })
  )
  setAnnots(page, [
    annot(ctx, {
      Subtype: 'FreeText',
      Rect: rect,
      IT: 'FreeTextCallout',
      CL: [tip.x, tip.y, bend.x, bend.y, edge.x, edge.y],
      RD: [43.5, 3.5, 3.5, 83.5],
      LE: 'OpenArrow',
      // PDF's default border width, written out: PDF.js reads a FreeText with no /BS as 0.
      BS: { W: 1 },
      DA: PDFString.of(`/Helv 12 Tf ${red} rg`),
      Contents: PDFString.of('Standard callout'),
      NM: PDFString.of('callout-1'),
      AP: { N: appearance },
    }),
  ])
  await save('standard-callout', d, {
    pages: 1,
    opens: true,
    describes:
      'One Letter page with a FreeText callout: /IT /FreeTextCallout, a three-point /CL, /RD, /LE /OpenArrow, red /DA and an /AP drawing box, leader and arrow',
    annotations: { FreeText: 1 },
  })
}

async function annotatedUnsupported() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, ['Unsupported subtypes'])
  const ctx = d.context
  setAnnots(page, [
    annot(ctx, {
      Subtype: 'Link',
      Rect: [72, 600, 200, 620],
      A: { S: 'URI', URI: PDFString.of('https://inkbar.dev') },
    }),
    annot(ctx, {
      Subtype: 'Stamp',
      Rect: [72, 400, 272, 500],
      Name: 'Approved',
      NM: PDFString.of('stamp-1'),
    }),
    annot(ctx, {
      Subtype: 'FileAttachment',
      Rect: [400, 600, 420, 620],
      Name: 'PushPin',
      NM: PDFString.of('fa-1'),
    }),
  ])
  await save('annotated-unsupported', d, {
    pages: 1,
    opens: true,
    describes: 'Link, Stamp and FileAttachment, which Inkbar counts but does not import',
    annotations: { Link: 1, Stamp: 1, FileAttachment: 1 },
  })
}

async function acroformBasic() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, ['Form'])
  const form = d.getForm()
  const tf = form.createTextField('name')
  tf.setText('Sam')
  tf.addToPage(page, { x: 72, y: 600, width: 200, height: 24 })
  const cb = form.createCheckBox('agree')
  cb.addToPage(page, { x: 72, y: 550, width: 18, height: 18 })
  await save('acroform-basic', d, {
    pages: 1,
    opens: true,
    describes: 'A text field and a checkbox (Widget annotations)',
    annotations: { Widget: 2 },
  })
}

/**
 * A real incremental update: the base revision is written by pdf-lib, then the changed page
 * object and the new Highlight are appended with their own xref section and a trailer whose
 * /Prev points at the base xref. pdf-lib cannot write incremental updates, so this is by hand.
 */
async function incrementalSaved() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, ['Base revision', ...BODY])
  const base = await d.save({ useObjectStreams: false })

  const d2 = await PDFDocument.load(base)
  const p2 = d2.getPage(0)
  const ctx = d2.context
  const hl = annot(ctx, {
    Subtype: 'Highlight',
    Rect: [72, 695, 300, 715],
    QuadPoints: [72, 715, 300, 715, 72, 695, 300, 695],
    C: [1, 1, 0],
    NM: PDFString.of('hl-inc'),
  })
  setAnnots(p2, [hl])

  const baseText = latin1(base)
  const prev = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(baseText)?.[1]
  if (!prev) throw new Error('incremental-saved: base file has no startxref')
  let tail = baseText.endsWith('\n') ? '' : '\n'
  const offsets: [number, number][] = []
  for (const ref of [p2.ref, hl].sort((a, b) => a.objectNumber - b.objectNumber)) {
    offsets.push([ref.objectNumber, baseText.length + tail.length])
    tail += `${ref.objectNumber} 0 obj\n${String(ctx.lookup(ref))}\nendobj\n`
  }
  const xrefAt = baseText.length + tail.length
  tail += 'xref\n'
  for (const [num, off] of offsets)
    tail += `${num} 1\n${String(off).padStart(10, '0')} 00000 n \n`
  const { Root, Info } = ctx.trailerInfo
  if (!Root || !Info) throw new Error('incremental-saved: trailer lacks Root or Info')
  tail += `trailer\n<< /Size ${ctx.largestObjectNumber + 1} /Root ${String(Root)} /Info ${String(Info)} /Prev ${prev} >>\n`
  tail += `startxref\n${xrefAt}\n%%EOF\n`
  write('incremental-saved', fromLatin1(baseText + tail))
  note('incremental-saved', {
    pages: 1,
    opens: true,
    describes:
      'Two revisions: a base file plus one hand-written incremental update (xref section with /Prev) that adds a Highlight',
    annotations: { Highlight: 1 },
  })
}

async function objectStreams() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, BODY)
  await save(
    'object-streams',
    d,
    { pages: 1, opens: true, describes: 'Saved with object streams and an xref stream' },
    { objectStreams: true }
  )
}

async function encrypted(name: 'encrypted-aes' | 'encrypted-rc4') {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, ['Encrypted'])
  const plain = join(out, `${name}.plain.pdf`)
  writeFileSync(plain, await d.save({ useObjectStreams: false }))
  const keyArgs = name === 'encrypted-aes' ? ['256'] : ['128', '--use-aes=n']
  execFileSync('qpdf', [
    '--allow-weak-crypto',
    '--encrypt',
    'inkbar',
    'owner-secret',
    ...keyArgs,
    '--',
    plain,
    join(out, `${name}.pdf`),
  ])
  rmSync(plain)
  note(name, {
    pages: 1,
    opens: true,
    password: 'inkbar',
    describes:
      name === 'encrypted-aes'
        ? 'AES-256 encrypted by qpdf, user password "inkbar"'
        : '128-bit RC4 encrypted by qpdf, user password "inkbar"',
  })
}

async function malformedTruncated() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, BODY)
  const bytes = await d.save({ useObjectStreams: false })
  write('malformed-truncated', bytes.slice(0, Math.floor(bytes.length * 0.4)))
  note('malformed-truncated', {
    pages: 0,
    opens: false,
    describes: 'First 40% of a valid file; no xref, no trailer',
  })
}

function malformedMissingXref(simple: Uint8Array) {
  const s = latin1(simple)
  const xref = s.lastIndexOf('\nxref\n')
  const trailer = s.indexOf('trailer', xref)
  const startxref = s.indexOf('startxref', trailer)
  if (xref < 0 || trailer < 0 || startxref < 0)
    throw new Error('text-simple has no classic xref')
  write(
    'malformed-missing-xref',
    fromLatin1(`${s.slice(0, xref + 1)}${s.slice(trailer, startxref)}%%EOF\n`)
  )
  note('malformed-missing-xref', {
    pages: 3,
    opens: true,
    describes:
      'Copy of text-simple with the xref table and startxref removed; readers must rebuild the cross-reference by scanning',
  })
}

async function scannedNoText() {
  const { d } = await doc()
  const page = d.addPage([612, 792])
  // A grey rectangle stands in for a scanned image: no text content, page still renders.
  page.drawRectangle({
    x: 72,
    y: 72,
    width: 468,
    height: 648,
    color: rgb(0.85, 0.85, 0.85),
  })
  await save('scanned-no-text', d, {
    pages: 1,
    opens: true,
    describes: 'Stand-in for a scan: a grey rectangle with no image and no text layer',
  })
}

async function main() {
  mkdirSync(out, { recursive: true })
  const simple = await textSimple()
  await textRotated(90)
  await textRotated(180)
  await textRotated(270)
  await textCjk()
  await cropboxOffset()
  await mixedPageSizes()
  await annotatedMarkup()
  await annotatedNotesThreaded()
  await annotatedRedact()
  await annotatedShapes()
  await standardCallout()
  await annotatedUnsupported()
  await acroformBasic()
  await incrementalSaved()
  await objectStreams()
  await encrypted('encrypted-aes')
  await encrypted('encrypted-rc4')
  await malformedTruncated()
  malformedMissingXref(simple)
  await scannedNoText()
  await userUnit2()
  writeFileSync(join(here, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`wrote ${Object.keys(manifest).length} fixtures`)
}

await main()
