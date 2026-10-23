import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef as PDFRefClass,
  PDFString,
  StandardFonts,
  beginText,
  degrees,
  endText,
  moveText,
  PDFOperator,
  PDFOperatorNames,
  setCharacterSpacing,
  setFontAndSize,
  setWordSpacing,
  showText,
  rgb,
  type PDFContext,
  type PDFField,
  type PDFFont,
  type PDFForm,
  type PDFPage,
  type PDFRadioGroup,
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
  opts?: { objectStreams?: boolean; appearances?: boolean }
) {
  const bytes = await d.save({
    useObjectStreams: opts?.objectStreams ?? false,
    updateFieldAppearances: opts?.appearances ?? true,
  })
  write(name, bytes)
  note(name, meta)
  return bytes
}

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1')
const fromLatin1 = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'))

/**
 * qpdf's decrypted rewrite of `file` without the trailer /ID, whose first half qpdf keeps from
 * the random one it wrote when it encrypted. Equal content gives equal strings.
 */
function decrypted(file: string, password: string) {
  return latin1(
    execFileSync('qpdf', [`--password=${password}`, '--decrypt', file, '-'])
  ).replace(/\/ID \[<[0-9a-f]*><[0-9a-f]*>\]/, '')
}

/**
 * Encrypts `plain` into fixture `name` with qpdf, then deletes `plain`. qpdf writes a random /ID
 * (and random AES salts and IVs) on every run, so when the existing fixture decrypts to the same
 * content the existing file is kept and a regenerate leaves it untouched.
 */
function encrypt(name: FixtureName, plain: string, args: string[], password: string) {
  const target = join(out, `${name}.pdf`)
  const fresh = join(out, `${name}.new.pdf`)
  execFileSync('qpdf', [...args, '--', plain, fresh])
  rmSync(plain)
  if (existsSync(target) && decrypted(target, password) === decrypted(fresh, password)) {
    rmSync(fresh)
  } else {
    renameSync(fresh, target)
  }
}

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

async function textSearch() {
  const { d, font } = await doc()
  const bold = await d.embedFont(StandardFonts.HelveticaBold)
  const page = d.addPage([612, 792])
  const size = 14
  // "Invoice" in two fonts, the second run starting exactly where the first ends.
  page.drawText('Inv', { x: 72, y: 700, size, font })
  page.drawText('oice', {
    x: 72 + font.widthOfTextAtSize('Inv', size),
    y: 700,
    size,
    font: bold,
  })
  page.drawText('A long docu-', { x: 72, y: 676, size, font })
  page.drawText('ment ends here.', { x: 72, y: 660, size, font })
  page.drawText('caf\u00e9 cr\u00e8me', { x: 72, y: 636, size, font })
  page.drawText('\u201cquoted\u201d and \u2018single\u2019', {
    x: 72,
    y: 612,
    size,
    font,
  })
  page.drawText('left column', { x: 72, y: 560, size, font })
  page.drawText('right column', { x: 320, y: 560, size, font })
  page.drawText('left second line', { x: 72, y: 544, size, font })
  page.drawText('right second line', { x: 320, y: 544, size, font })
  // Character spacing 1 and word spacing 4, then a word kerned apart by a TJ adjustment of -20.
  const key = page.node.newFontDictionary(font.name, font.ref)
  const tucked = PDFArray.withContext(d.context)
  tucked.push(font.encodeText('T'))
  tucked.push(PDFNumber.of(120))
  tucked.push(font.encodeText('o'))
  const kerned = PDFArray.withContext(d.context)
  kerned.push(font.encodeText('ke'))
  kerned.push(PDFNumber.of(-20))
  kerned.push(font.encodeText('rned word'))
  page.pushOperators(
    beginText(),
    setFontAndSize(key, size),
    setCharacterSpacing(1),
    setWordSpacing(4),
    moveText(72, 500),
    showText(font.encodeText('widely spaced words')),
    endText(),
    beginText(),
    setFontAndSize(key, size),
    moveText(72, 476),
    PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [kerned]),
    endText(),
    // "Hello", then a move 40 pt along for "World" in the same text object.
    beginText(),
    setFontAndSize(key, size),
    setCharacterSpacing(0),
    setWordSpacing(0),
    moveText(72, 440),
    showText(font.encodeText('Hello')),
    moveText(40, 0),
    showText(font.encodeText('World')),
    endText(),
    // "half " at 50% horizontal scaling, then "full" at 100%.
    beginText(),
    setFontAndSize(key, size),
    moveText(72, 416),
    PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, [PDFNumber.of(50)]),
    showText(font.encodeText('half ')),
    PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, [PDFNumber.of(100)]),
    showText(font.encodeText('full')),
    endText(),
    // "To" with the "o" kerned 120 back under the T's crossbar.
    beginText(),
    setFontAndSize(key, size),
    moveText(72, 392),
    PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [tucked]),
    endText()
  )
  return save('text-search', d, {
    pages: 1,
    opens: true,
    describes:
      'Search cases: split-font word, hyphenated line break, accents, curly quotes, two columns, character and word spacing, a kerned word, a move and a scaling change inside one line, a kerned pair',
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
async function buildStandardCallout() {
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
  return d
}

async function standardCallout() {
  await save('standard-callout', await buildStandardCallout(), {
    pages: 1,
    opens: true,
    describes:
      'One Letter page with a FreeText callout: /IT /FreeTextCallout, a three-point /CL, /RD, /LE /OpenArrow, red /DA and an /AP drawing box, leader and arrow',
    annotations: { FreeText: 1 },
  })
}

async function calloutXrefStream() {
  await save(
    'callout-xref-stream',
    await buildStandardCallout(),
    {
      pages: 1,
      opens: true,
      describes:
        'standard-callout saved with object streams and an xref stream, so the FreeText sits inside an object stream',
      annotations: { FreeText: 1 },
    },
    { objectStreams: true }
  )
}

/** Appends `refs` (current objects of `ctx`) to `base` as one incremental update. */
function appendRevision(base: Uint8Array, ctx: PDFContext, refs: PDFRef[], who: string) {
  const baseText = latin1(base)
  const prev = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(baseText)?.[1]
  if (!prev) throw new Error(`${who}: base file has no startxref`)
  let tail = baseText.endsWith('\n') ? '' : '\n'
  const offsets: [number, number][] = []
  for (const ref of [...refs].sort((a, b) => a.objectNumber - b.objectNumber)) {
    offsets.push([ref.objectNumber, baseText.length + tail.length])
    tail += `${ref.objectNumber} 0 obj\n${String(ctx.lookup(ref))}\nendobj\n`
  }
  const xrefAt = baseText.length + tail.length
  tail += 'xref\n'
  for (const [num, off] of offsets)
    tail += `${num} 1\n${String(off).padStart(10, '0')} 00000 n \n`
  const { Root, Info } = ctx.trailerInfo
  if (!Root || !Info) throw new Error(`${who}: trailer lacks Root or Info`)
  tail += `trailer\n<< /Size ${ctx.largestObjectNumber + 1} /Root ${String(Root)} /Info ${String(Info)} /Prev ${prev} >>\n`
  tail += `startxref\n${xrefAt}\n%%EOF\n`
  return fromLatin1(baseText + tail)
}

/** standard-callout plus an incremental update that moves the leader tip to (80, 560). */
async function calloutIncremental() {
  const base = await (await buildStandardCallout()).save({ useObjectStreams: false })
  const d2 = await PDFDocument.load(base, { updateMetadata: false })
  const ctx = d2.context
  const ref = d2.getPage(0).node.Annots()?.get(0)
  if (!(ref instanceof PDFRefClass)) throw new Error('callout-incremental: no annotation')
  ctx.lookup(ref, PDFDict).set(PDFName.of('CL'), ctx.obj([80, 560, 80, 560, 100, 620]))
  write('callout-incremental', appendRevision(base, ctx, [ref], 'callout-incremental'))
  note('callout-incremental', {
    pages: 1,
    opens: true,
    describes:
      'standard-callout plus a hand-written incremental update that rewrites the FreeText with /CL starting at (80, 560)',
    annotations: { FreeText: 1 },
  })
}

async function calloutEncrypted() {
  const plain = join(out, 'callout-encrypted.plain.pdf')
  writeFileSync(
    plain,
    await (await buildStandardCallout()).save({ useObjectStreams: false })
  )
  encrypt('callout-encrypted', plain, ['--encrypt', '', 'owner-secret', '256'], '')
  note('callout-encrypted', {
    pages: 1,
    opens: true,
    describes:
      'standard-callout AES-256 encrypted by qpdf with an empty user password, so PDF.js opens it but the object reader skips it',
    annotations: { FreeText: 1 },
  })
}

async function calloutBadXref() {
  const bytes = await (await buildStandardCallout()).save({ useObjectStreams: false })
  const s = latin1(bytes)
  const m = /startxref\s+(\d+)(\s+%%EOF\s*)$/.exec(s)
  if (!m) throw new Error('callout-bad-xref: no startxref')
  const offset = m[1]!
  const at = m.index + m[0].indexOf(offset, 'startxref'.length)
  write(
    'callout-bad-xref',
    fromLatin1(`${s.slice(0, at)}${Number(offset) + 7}${s.slice(at + offset.length)}`)
  )
  note('callout-bad-xref', {
    pages: 1,
    opens: true,
    describes:
      'standard-callout with startxref 7 bytes off the real xref table; PDF.js rebuilds the cross-reference',
    annotations: { FreeText: 1 },
  })
}

/** A Text annotation named /Key with its own /AP /N stream. */
async function noteIconAp() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, ['Note with an icon appearance'])
  const ctx = d.context
  const appearance = ctx.register(
    ctx.stream('0.8 0.1 0.1 rg 4 4 16 16 re f', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 24, 24],
    })
  )
  setAnnots(page, [
    annot(ctx, {
      Subtype: 'Text',
      Rect: [100, 600, 124, 624],
      Name: 'Key',
      Contents: PDFString.of('A note'),
      NM: PDFString.of('note-icon-1'),
      AP: { N: appearance },
    }),
  ])
  await save('note-icon-ap', d, {
    pages: 1,
    opens: true,
    describes: 'One Text annotation with /Name /Key and an /AP /N stream',
    annotations: { Text: 1 },
  })
}

/** Four FreeTexts whose fonts resolve four ways: annotation /DR, bare name, AcroForm /DR, subset name. */
async function freetextFonts() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, ['FreeText fonts'])
  const ctx = d.context
  const face = (BaseFont: string) => ({ Type: 'Font', Subtype: 'Type1', BaseFont })
  const free = (i: number, da: string, extra: Record<string, unknown> = {}) =>
    annot(ctx, {
      Subtype: 'FreeText',
      Rect: [72, 640 - i * 60, 300, 670 - i * 60],
      BS: { W: 1 },
      DA: PDFString.of(da),
      Contents: PDFString.of(`Font ${i + 1}`),
      NM: PDFString.of(`font-${i + 1}`),
      ...extra,
    })
  setAnnots(page, [
    free(0, '/F1 12 Tf 0 g', { DR: { Font: { F1: face('Times-BoldItalic') } } }),
    free(1, '/Helv 12 Tf 0 g'),
    free(2, '/F2 10 Tf 0 g'),
    free(3, '/F3 10 Tf 0 g', { DR: { Font: { F3: face('ABCDEF+Arial-BoldMT') } } }),
  ])
  d.catalog.set(
    PDFName.of('AcroForm'),
    ctx.obj({ Fields: [], DR: { Font: { F2: face('Courier-Oblique') } } })
  )
  await save('freetext-fonts', d, {
    pages: 1,
    opens: true,
    describes:
      'Four FreeTexts: /DA font through the annotation /DR (Times-BoldItalic), a bare /Helv, the AcroForm /DR (Courier-Oblique) and a subset Arial-BoldMT',
    annotations: { FreeText: 4 },
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

const HELV_12 = '/Helv 12 Tf 0 g'

/** A PDF literal string with `\`, `(` and `)` escaped; UTF-16 hex when the text is not ASCII. */
function pdfText(value: string) {
  return /^[\x20-\x7e]*$/.test(value)
    ? PDFString.of(value.replace(/[\\()]/g, (c) => `\\${c}`))
    : PDFHexString.fromText(value)
}

function js(ctx: PDFContext, code: string) {
  return ctx.obj({ S: 'JavaScript', JS: pdfText(code) })
}

/** Labels a field: 9pt text just above its rectangle. */
function label(page: PDFPage, font: PDFFont, s: string, x: number, y: number, h: number) {
  page.drawText(s, { x, y: y + h + 3, size: 9, font })
}

/** Puts a plain Helvetica under /Helv in the AcroForm /DR, which every hand-written /DA names. */
function addHelv(d: PDFDocument, form: PDFForm) {
  const ctx = d.context
  const helv = ctx.register(
    ctx.obj({
      Type: 'Font',
      Subtype: 'Type1',
      BaseFont: 'Helvetica',
      Encoding: 'WinAnsiEncoding',
    })
  )
  const acro = form.acroForm.dict
  const dr = acro.lookupMaybe(PDFName.of('DR'), PDFDict) ?? ctx.obj({})
  const fonts = dr.lookupMaybe(PDFName.of('Font'), PDFDict) ?? ctx.obj({})
  fonts.set(PDFName.of('Helv'), helv)
  dr.set(PDFName.of('Font'), fonts)
  acro.set(PDFName.of('DR'), dr)
  acro.set(PDFName.of('DA'), PDFString.of(HELV_12))
}

/** Sets /DA on the field and drops any copy pdf-lib wrote on its widgets. */
function setDA(field: PDFField, da: string) {
  field.acroField.dict.set(PDFName.of('DA'), PDFString.of(da))
  for (const w of field.acroField.getWidgets()) w.dict.delete(PDFName.of('DA'))
}

function widgetDict(field: PDFField, i = 0): PDFDict {
  const w = field.acroField.getWidgets()[i]
  if (!w) throw new Error(`${field.getName()} has no widget ${i}`)
  return w.dict
}

/** pdf-lib names radio on-states 0, 1, …; this renames them and drops the /Opt it wrote. */
function nameRadioStates(radio: PDFRadioGroup, states: string[], value: string) {
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
 * in the file. This deletes the copy so the fixture holds one `header` dictionary.
 */
function dropDuplicateParent(d: PDFDocument, field: PDFField) {
  const parent = field.acroField.dict.get(PDFName.of('Parent'))
  const t = field.acroField.dict
    .lookup(PDFName.of('Parent'), PDFDict)
    .get(PDFName.of('T'))
  for (const [r, o] of d.context.enumerateIndirectObjects()) {
    if (r !== parent && o instanceof PDFDict && o.get(PDFName.of('T')) === t)
      d.context.delete(r)
  }
}

function addRawField(
  form: PDFForm,
  page: PDFPage,
  dict: Record<string, unknown>
): PDFRef {
  const ctx = page.doc.context
  const ref = annot(ctx, { Subtype: 'Widget', P: page.ref, ...dict })
  form.acroForm.addField(ref)
  page.node.addAnnot(ref)
  return ref
}

/** A signature dictionary with a zero-filled /Contents. It looks signed; it verifies nothing. */
function dummySignature(ctx: PDFContext, reference: Record<string, unknown>): PDFRef {
  return ctx.register(
    ctx.obj({
      Type: 'Sig',
      Filter: 'Adobe.PPKLite',
      SubFilter: 'adbe.pkcs7.detached',
      ByteRange: [0, 1000, 9000, 1000],
      Contents: PDFHexString.of('00'.repeat(512)),
      M: PDFString.of('D:20261022120000Z'),
      Name: PDFString.of('Sam Carter'),
      Reference: [{ Type: 'SigRef', ...reference }],
    } as never)
  )
}

async function formFields() {
  const { d, font } = await doc()
  const ctx = d.context
  const p1 = d.addPage([612, 792])
  const p2 = d.addPage([612, 792])
  p2.setRotation(degrees(90))
  p1.node.set(PDFName.of('Tabs'), PDFName.of('R'))
  text(p1, font, ['Form fields'], 740)
  text(p2, font, ['Form fields, page 2'], 740)
  const form = d.getForm()

  const L = 72
  const R = 320
  const row = (i: number) => 680 - i * 56
  const box = (x: number, i: number, width = 200, height = 22) => ({
    x,
    y: row(i),
    width,
    height,
  })
  const put = (s: string, x: number, i: number, height = 22) =>
    label(p1, font, s, x, row(i), height)

  const name = form.createTextField('name')
  name.setText('Sam')
  name.setAlignment(0)
  name.addToPage(p1, box(L, 0))
  put('name', L, 0)

  const notes = form.createTextField('notes')
  notes.enableMultiline()
  notes.setAlignment(1)
  notes.addToPage(p1, box(R, 0, 200, 44))
  put('notes (multiline)', R, 0, 44)

  const pin = form.createTextField('pin')
  pin.enablePassword()
  pin.setMaxLength(4)
  pin.addToPage(p1, box(L, 1, 80))
  put('pin (password)', L, 1)

  const code = form.createTextField('code')
  code.setMaxLength(6)
  code.enableCombing()
  code.addToPage(p1, box(R, 1, 120))
  put('code (comb)', R, 1)

  const auto = form.createTextField('auto')
  auto.addToPage(p1, box(L, 2))
  put('auto (auto size)', L, 2)

  const locked = form.createTextField('locked')
  locked.setText('fixed')
  locked.enableReadOnly()
  locked.addToPage(p1, box(R, 2))
  put('locked (read-only)', R, 2)

  const email = form.createTextField('email')
  email.enableRequired()
  email.addToPage(p1, box(L, 3))
  put('email (required)', L, 3)

  const internal = form.createTextField('internal')
  internal.setText('x')
  internal.disableExporting()
  internal.addToPage(p1, box(R, 3))
  put('internal (no export)', R, 3)

  const agree = form.createCheckBox('agree')
  agree.addToPage(p1, box(L, 4, 18, 18))
  put('agree', L, 4, 18)

  const plan = form.createRadioGroup('plan')
  plan.addOptionToPage('monthly', p1, box(R, 4, 18, 18))
  plan.addOptionToPage('yearly', p1, box(R + 100, 4, 18, 18))
  plan.select('monthly')
  put('plan: monthly', R, 4, 18)
  put('yearly', R + 100, 4, 18)

  // Two widgets share the export value "A" but have their own on-states, so they toggle apart.
  const shared = form.createRadioGroup('shared')
  shared.addOptionToPage('A', p1, box(L, 5, 18, 18))
  shared.addOptionToPage('A', p1, box(L + 100, 5, 18, 18))
  shared.acroField.dict.set(PDFName.of('V'), PDFName.of('Off'))
  put('shared: first A', L, 5, 18)
  put('second A', L + 100, 5, 18)

  const country = form.createDropdown('country')
  country.setOptions(['United Kingdom', 'France'])
  country.select('United Kingdom')
  country.addToPage(p1, box(R, 5))
  put('country', R, 5)

  const city = form.createDropdown('city')
  city.setOptions(['Leeds', 'Lyon', 'Lisbon'])
  city.enableEditing()
  city.addToPage(p1, box(L, 6))
  put('city (editable)', L, 6)

  const interests = form.createOptionList('interests')
  interests.setOptions(['maths', 'engines', 'poetry'])
  interests.enableMultiselect()
  interests.addToPage(p1, box(R, 7, 200, 60))
  put('interests (multi-select)', R, 7, 60)

  const ref = form.createTextField('header.ref')
  dropDuplicateParent(d, ref)
  ref.setText('REF-0042')
  ref.addToPage(p1, box(L, 7))
  put('header.ref', L, 7)
  // Page 2 is rotated 90; /MK /R 90 keeps its widgets upright for the reader.
  ref.addToPage(p2, { x: 72, y: 600, width: 200, height: 22, rotate: degrees(90) })

  const rotated = form.createTextField('rotated')
  rotated.addToPage(p2, { x: 120, y: 600, width: 200, height: 22, rotate: degrees(90) })

  const styled = form.createTextField('styled')
  styled.addToPage(p1, box(L, 8))
  put('styled (Times bold via /F1)', L, 8)

  addRawField(form, p1, {
    FT: 'Sig',
    T: PDFString.of('sig'),
    Rect: [L, row(9), L + 200, row(9) + 40],
  })
  put('sig (empty signature)', L, 9, 40)
  // A signature box on the rotated page: wide as the reader sees it, so tall in user space.
  addRawField(form, p2, {
    FT: 'Sig',
    T: PDFString.of('sig2'),
    Rect: [300, 400, 340, 600],
  })

  const reset = form.createButton('reset')
  reset.addToPage('Reset', p1, box(R, 9, 100, 24))

  form.updateFieldAppearances(font)

  addHelv(d, form)
  for (const f of form.getFields()) {
    if (f.acroField.dict.has(PDFName.of('DA'))) setDA(f, HELV_12)
  }
  setDA(auto, '/Helv 0 Tf 0 g')
  // /F1 is a resource name, not a family: only the AcroForm /DR says it is Times-Bold.
  form.acroForm.dict
    .lookup(PDFName.of('DR'), PDFDict)
    .lookup(PDFName.of('Font'), PDFDict)
    .set(
      PDFName.of('F1'),
      ctx.register(
        ctx.obj({
          Type: 'Font',
          Subtype: 'Type1',
          BaseFont: 'Times-Bold',
          Encoding: 'WinAnsiEncoding',
        })
      )
    )
  setDA(styled, '/F1 10 Tf 0 0 1 rg')
  email.acroField.dict.set(PDFName.of('TU'), PDFString.of('Email address'))
  // /TU names one field and is not inherited: header.ref has none of its own.
  ref.acroField.dict
    .lookup(PDFName.of('Parent'), PDFDict)
    .set(PDFName.of('TU'), PDFString.of('Header'))
  agree.acroField.dict.set(PDFName.of('V'), PDFName.of('Off'))
  nameRadioStates(plan, ['monthly', 'yearly'], 'monthly')
  plan.acroField.dict.set(PDFName.of('DV'), PDFName.of('yearly'))
  // PDF.js maps both states to the shared export "A"; /DV names the second widget's state.
  shared.acroField.dict.set(PDFName.of('DV'), PDFName.of('1'))
  country.acroField.dict.set(
    PDFName.of('Opt'),
    ctx.obj([
      [PDFString.of('gb'), PDFString.of('United Kingdom')],
      [PDFString.of('fr'), PDFString.of('France')],
    ])
  )
  country.acroField.dict.set(PDFName.of('V'), PDFString.of('gb'))
  widgetDict(reset).set(PDFName.of('A'), ctx.obj({ S: 'ResetForm' }))
  // shared's second widget comes after country in /Annots, apart from its first, so /Annots
  // order differs from the order the fields list their widgets.
  const annots = p1.node.lookup(PDFName.of('Annots'), PDFArray)
  const second = ctx.getObjectRef(widgetDict(shared, 1))!
  const at = annots.asArray().findIndex((r) => r === second)
  annots.remove(at)
  const after = annots
    .asArray()
    .findIndex((r) => r === ctx.getObjectRef(widgetDict(country)))
  annots.insert(after + 1, second)

  await save(
    'form-fields',
    d,
    {
      pages: 2,
      opens: true,
      describes:
        'Every AcroForm field type and flag: text variants, checkbox, radios (named on-states, and two widgets sharing one export value), combo, list, a two-widget field across pages, a rotated page 2, a /DA font named only through /DR, empty signatures on both pages and a reset button',
      annotations: { Widget: 23 },
    },
    { appearances: false }
  )
}

async function formScripted() {
  const { d, font } = await doc()
  const ctx = d.context
  const page = d.addPage([612, 792])
  text(page, font, ['Scripted form'], 740)
  const form = d.getForm()

  const L = 72
  const R = 320
  const row = (i: number) => 680 - i * 56
  const box = (x: number, i: number, width = 200, height = 22) => ({
    x,
    y: row(i),
    width,
    height,
  })
  const put = (s: string, x: number, i: number, height = 22) =>
    label(page, font, s, x, row(i), height)
  const fieldAA = (f: PDFField, actions: Record<string, string>) => {
    const aa: Record<string, PDFDict> = {}
    for (const [k, code] of Object.entries(actions)) aa[k] = js(ctx, code)
    f.acroField.dict.set(PDFName.of('AA'), ctx.obj(aa))
  }

  const pounds = '2, 0, 0, 0, "£", true'
  const qty = form.createTextField('qty')
  qty.addToPage(page, box(L, 0, 120))
  put('qty', L, 0)
  const price = form.createTextField('price')
  price.addToPage(page, box(L + 160, 0, 120))
  put('price', L + 160, 0)
  const total = form.createTextField('total')
  total.enableReadOnly()
  total.addToPage(page, box(L + 320, 0, 120))
  put('total (qty x price)', L + 320, 0)

  const when = form.createTextField('when')
  when.addToPage(page, box(L, 1))
  put('when (dd/mm/yyyy)', L, 1)
  const age = form.createTextField('age')
  age.addToPage(page, box(R, 1, 80))
  put('age (18 to 120)', R, 1)

  const more = form.createCheckBox('more')
  more.addToPage(page, box(L, 2, 18, 18))
  put('more (shows extra)', L, 2, 18)
  const extra = form.createTextField('extra')
  extra.addToPage(page, { ...box(R, 2), hidden: true })

  const buttons: [string, string, number, number][] = [
    ['hello', 'Hello', L, 3],
    ['ask', 'Ask', L + 160, 3],
    ['submit', 'Submit', L + 320, 3],
    ['mail', 'Mail', L, 4],
    ['link', 'Link', L + 160, 4],
    ['print', 'Print', L + 320, 4],
    ['send', 'Send', L, 5],
    ['site', 'Site', L + 160, 5],
    ['clear', 'Clear', L + 320, 5],
  ]
  const btn: Record<string, PDFField> = {}
  for (const [n, caption, x, i] of buttons) {
    const b = form.createButton(n)
    b.addToPage(caption, page, box(x, i, 120, 24))
    btn[n] = b
  }

  form.updateFieldAppearances(font)

  addHelv(d, form)
  for (const f of form.getFields()) {
    if (f.acroField.dict.has(PDFName.of('DA'))) setDA(f, HELV_12)
  }
  fieldAA(qty, {
    K: 'AFNumber_Keystroke(0, 0, 0, 0, "", true)',
    F: 'AFNumber_Format(0, 0, 0, 0, "", true)',
  })
  fieldAA(price, { K: `AFNumber_Keystroke(${pounds})`, F: `AFNumber_Format(${pounds})` })
  fieldAA(total, {
    C: 'AFSimple_Calculate("PRD", new Array("qty", "price"))',
    F: `AFNumber_Format(${pounds})`,
  })
  // Written as Acrobat writes them, with the semicolon PDF.js looks for to treat the field
  // as a date.
  fieldAA(when, {
    K: 'AFDate_KeystrokeEx("dd/mm/yyyy");',
    F: 'AFDate_FormatEx("dd/mm/yyyy");',
  })
  fieldAA(age, { V: 'event.rc = event.value >= 18 && event.value <= 120' })
  form.acroForm.dict.set(PDFName.of('CO'), ctx.obj([total.ref]))

  widgetDict(more).set(
    PDFName.of('AA'),
    ctx.obj({
      U: js(
        ctx,
        'this.getField("extra").display = event.target.value == "Off" ? display.hidden : display.visible'
      ),
    })
  )

  const action = (n: string, a: PDFDict) => widgetDict(btn[n]!).set(PDFName.of('A'), a)
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
  // Runs before the reset, so the press undoes in one step only if both share it.
  widgetDict(btn.clear!).set(
    PDFName.of('AA'),
    ctx.obj({ U: js(ctx, 'this.getField("qty").value = 0') })
  )

  d.addJavaScript('init', 'var formReady = true;')

  await save(
    'form-scripted',
    d,
    {
      pages: 1,
      opens: true,
      describes:
        'Fields with keystroke, format, validate and calculate scripts, a mouse-up script that shows a hidden field, JavaScript and non-JavaScript button actions, a reset button whose mouse-up script zeroes qty first, and a document-level script',
      annotations: { Widget: 16 },
    },
    { appearances: false }
  )
}

async function formSigned() {
  {
    const { d, font } = await doc()
    const ctx = d.context
    const page = d.addPage([612, 792])
    text(page, font, ['Certified form'], 740)
    const form = d.getForm()
    const name = form.createTextField('name')
    name.addToPage(page, { x: 72, y: 600, width: 200, height: 22 })
    label(page, font, 'name', 72, 600, 22)
    form.updateFieldAppearances(font)
    addHelv(d, form)
    setDA(name, HELV_12)

    const sig = dummySignature(ctx, {
      TransformMethod: 'DocMDP',
      TransformParams: { Type: 'TransformParams', P: 1, V: '1.2' },
    })
    addRawField(form, page, {
      FT: 'Sig',
      T: PDFString.of('cert'),
      V: sig,
      Rect: [72, 500, 272, 540],
    })
    label(page, font, 'cert (certifying signature)', 72, 500, 40)
    form.acroForm.dict.set(PDFName.of('SigFlags'), PDFNumber.of(3))
    d.catalog.set(PDFName.of('Perms'), ctx.obj({ DocMDP: sig }))
    await save(
      'form-signed',
      d,
      {
        pages: 1,
        opens: true,
        describes:
          'A certified document: /Perms /DocMDP names the signature in "cert" with /P 1 (no changes allowed), plus a text field',
        annotations: { Widget: 2 },
      },
      { appearances: false }
    )
  }
  {
    const { d, font } = await doc()
    const ctx = d.context
    const page = d.addPage([612, 792])
    text(page, font, ['Approval form'], 740)
    const form = d.getForm()
    const amount = form.createTextField('amount')
    amount.setText('120.00')
    amount.addToPage(page, { x: 72, y: 600, width: 200, height: 22 })
    label(page, font, 'amount (locked by approved)', 72, 600, 22)
    const memo = form.createTextField('memo')
    memo.addToPage(page, { x: 72, y: 540, width: 200, height: 22 })
    label(page, font, 'memo', 72, 540, 22)
    form.updateFieldAppearances(font)
    addHelv(d, form)
    setDA(amount, HELV_12)
    setDA(memo, HELV_12)

    const fields = ctx.obj([PDFString.of('amount')])
    const sig = dummySignature(ctx, {
      TransformMethod: 'FieldMDP',
      TransformParams: {
        Type: 'TransformParams',
        Action: 'Include',
        Fields: fields,
        V: '1.2',
      },
    })
    addRawField(form, page, {
      FT: 'Sig',
      T: PDFString.of('approved'),
      V: sig,
      Lock: { Type: 'SigFieldLock', Action: 'Include', Fields: fields },
      Rect: [72, 440, 272, 480],
    })
    label(page, font, 'approved (signature)', 72, 440, 40)
    form.acroForm.dict.set(PDFName.of('SigFlags'), PDFNumber.of(3))
    await save(
      'form-fieldmdp',
      d,
      {
        pages: 1,
        opens: true,
        describes:
          'No DocMDP; the signed field "approved" has /Lock /Include [amount], so amount is locked and memo stays editable',
        annotations: { Widget: 3 },
      },
      { appearances: false }
    )
  }
}

async function formTimer() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, ['Timer form'], 740)
  const form = d.getForm()
  const ticker = form.createTextField('ticker')
  ticker.addToPage(page, { x: 72, y: 600, width: 200, height: 22 })
  label(page, font, 'ticker (counts up every 50 ms)', 72, 600, 22)
  const note = form.createTextField('note')
  note.addToPage(page, { x: 72, y: 540, width: 200, height: 22 })
  label(page, font, 'note (no scripts)', 72, 540, 22)
  form.updateFieldAppearances(font)
  addHelv(d, form)
  setDA(ticker, HELV_12)
  setDA(note, HELV_12)
  d.addJavaScript(
    'tick',
    `var ticking = app.setInterval("this.getField('ticker').value = String(Number(this.getField('ticker').value || 0) + 1)", 50)`
  )
  await save(
    'form-timer',
    d,
    {
      pages: 1,
      opens: true,
      describes:
        'A text field a document-level app.setInterval bumps every 50 ms and a plain text field, for checking that teardown clears sandbox timers and that timer writes are no undo step',
      annotations: { Widget: 2 },
    },
    { appearances: false }
  )
}

async function formUppercase() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, ['Uppercase form'], 740)
  const form = d.getForm()
  const code = form.createTextField('code')
  code.addToPage(page, { x: 72, y: 600, width: 200, height: 22 })
  label(page, font, 'code (a validate script upper-cases it)', 72, 600, 22)
  form.updateFieldAppearances(font)
  addHelv(d, form)
  setDA(code, HELV_12)
  code.acroField.dict.set(
    PDFName.of('AA'),
    d.context.obj({ V: js(d.context, 'event.value = event.value.toUpperCase()') })
  )
  await save(
    'form-uppercase',
    d,
    {
      pages: 1,
      opens: true,
      describes:
        'One text field whose validate script upper-cases the committed value, for checking that a value a script changes is the one kept',
      annotations: { Widget: 1 },
    },
    { appearances: false }
  )
}

async function formSharedScripted() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, ['Shared export form'], 740)
  const form = d.getForm()
  // Two widgets share the export value "A"; a validate script makes the commit go through the
  // sandbox, which names the first widget whichever was chosen.
  const shared = form.createRadioGroup('shared')
  shared.addOptionToPage('A', page, { x: 72, y: 600, width: 18, height: 18 })
  shared.addOptionToPage('A', page, { x: 172, y: 600, width: 18, height: 18 })
  shared.acroField.dict.set(PDFName.of('V'), PDFName.of('Off'))
  label(page, font, 'shared: first A', 72, 600, 18)
  label(page, font, 'second A', 172, 600, 18)
  form.updateFieldAppearances(font)
  shared.acroField.dict.set(
    PDFName.of('AA'),
    d.context.obj({ V: js(d.context, 'event.rc = true') })
  )
  await save(
    'form-shared-scripted',
    d,
    {
      pages: 1,
      opens: true,
      describes:
        'A radio group whose two widgets share the export value "A", with a validate script, for checking that the widget chosen is the one kept',
      annotations: { Widget: 2 },
    },
    { appearances: false }
  )
}

/** Buttons whose GoTo actions name their page explicitly, by a name-tree name and by a /Dests name. */
async function formGoto() {
  const { d, font } = await doc()
  const ctx = d.context
  const page = d.addPage([612, 792])
  const p2 = d.addPage([612, 792])
  const p3 = d.addPage([612, 792])
  text(page, font, ['GoTo form'], 740)
  text(p2, font, ['Page 2'], 740)
  text(p3, font, ['Page 3'], 740)
  const form = d.getForm()
  const buttons: [string, string, number][] = [
    ['explicit', 'Page 3', 640],
    ['named', 'Chapter 3', 590],
    ['legacy', 'Chapter 2', 540],
    ['missing', 'Nowhere', 490],
    ['scripted', 'Script', 440],
    ['goto-script', 'Page 2 + script', 390],
    ['chain', 'Chain', 340],
  ]
  const btn: Record<string, PDFField> = {}
  for (const [n, caption, y] of buttons) {
    const b = form.createButton(n)
    b.addToPage(caption, page, { x: 72, y, width: 120, height: 24 })
    btn[n] = b
  }
  form.updateFieldAppearances(font)
  addHelv(d, form)
  const goto = (dest: PDFString | PDFName | [PDFRef, string]) => {
    const a = ctx.obj({ S: 'GoTo' })
    a.set(PDFName.of('D'), Array.isArray(dest) ? ctx.obj(dest) : dest)
    return a
  }
  const action = (n: string, a: PDFDict) => widgetDict(btn[n]!).set(PDFName.of('A'), a)
  action('explicit', goto([p3.ref, 'Fit']))
  action('named', goto(PDFString.of('chapter-3')))
  action('legacy', goto(PDFName.of('ch2')))
  action('missing', goto(PDFString.of('nowhere')))
  const script = js(ctx, 'app.alert("Going to chapter 3")')
  script.set(PDFName.of('Next'), goto(PDFString.of('chapter-3')))
  action('scripted', script)
  // A GoTo that runs JavaScript after it, as Acrobat's action lists write it.
  const then = goto([p2.ref, 'Fit'])
  then.set(PDFName.of('Next'), js(ctx, 'var went = true'))
  action('goto-script', then)
  // A JavaScript /A whose /Next chain opens a URL, goes to page 2, then prints.
  const print = goto([p2.ref, 'Fit'])
  print.set(PDFName.of('Next'), ctx.obj({ S: 'Named', N: 'Print' }))
  const chain = js(ctx, 'var chained = true')
  chain.set(
    PDFName.of('Next'),
    ctx.obj([ctx.obj({ S: 'URI', URI: PDFString.of('https://example.com/next') }), print])
  )
  action('chain', chain)
  d.catalog.set(
    PDFName.of('Names'),
    ctx.obj({ Dests: { Names: [PDFString.of('chapter-3'), [p3.ref, 'Fit']] } } as never)
  )
  d.catalog.set(PDFName.of('Dests'), ctx.obj({ ch2: [p2.ref, 'Fit'] } as never))
  await save(
    'form-goto',
    d,
    {
      pages: 3,
      opens: true,
      describes:
        "Push buttons with GoTo actions: an explicit destination, a name-tree name, a catalog /Dests name, a name with no destination, a JavaScript action whose /Next is a named GoTo, a GoTo whose /Next is JavaScript, and a JavaScript action whose /Next chain holds a URI, a GoTo and that GoTo's /Next Print",
      annotations: { Widget: 7 },
    },
    { appearances: false }
  )
}

/** A field whose validator, `AFRange_Validate`, refuses an out-of-range value with an alert. */
async function formRange() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, ['Range form'], 740)
  const form = d.getForm()
  const score = form.createTextField('score')
  score.addToPage(page, { x: 72, y: 600, width: 200, height: 22 })
  label(page, font, 'score (0 to 10; a value outside alerts)', 72, 600, 22)
  const note = form.createTextField('note')
  note.addToPage(page, { x: 72, y: 540, width: 200, height: 22 })
  label(page, font, 'note (no scripts)', 72, 540, 22)
  const clear = form.createButton('clear')
  clear.addToPage('Clear', page, { x: 72, y: 480, width: 120, height: 24 })
  form.updateFieldAppearances(font)
  addHelv(d, form)
  // A script, then a reset of note and an HTML submit, as an Acrobat action list writes them.
  const ctx = d.context
  const press = js(ctx, 'this.getField("score").value = "3"')
  press.set(
    PDFName.of('Next'),
    ctx.obj([
      ctx.obj({ S: 'ResetForm', Fields: [PDFString.of('note')], Flags: 0 }),
      ctx.obj({
        S: 'SubmitForm',
        F: PDFString.of('https://example.com/range'),
        Flags: 4,
      }),
    ])
  )
  widgetDict(clear).set(PDFName.of('A'), press)
  setDA(score, HELV_12)
  setDA(note, HELV_12)
  score.acroField.dict.set(
    PDFName.of('AA'),
    d.context.obj({ V: js(d.context, 'AFRange_Validate(true, 0, true, 10)') })
  )
  await save(
    'form-range',
    d,
    {
      pages: 1,
      opens: true,
      describes:
        'A text field whose AFRange_Validate (0 to 10) alerts and refuses a value outside the range, a plain text field, and a button whose JavaScript sets score and whose /Next resets note and submits, for checking that a refused value stays as typed through the alert and that /Next resets and submits run',
      annotations: { Widget: 3 },
    },
    { appearances: false }
  )
}

async function formBareAppearances() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  text(page, font, ['Bare appearances form'], 740)
  const form = d.getForm()
  const agree = form.createCheckBox('agree')
  agree.addToPage(page, { x: 72, y: 600, width: 18, height: 18 })
  label(page, font, 'agree (no /Off appearance)', 72, 600, 18)
  const note = form.createTextField('note')
  note.addToPage(page, { x: 72, y: 540, width: 200, height: 22 })
  label(page, font, 'note (no /AP)', 72, 540, 22)
  form.updateFieldAppearances(font)
  addHelv(d, form)
  setDA(note, HELV_12)
  // The checkbox draws only when on: its /AP holds /Yes and no /Off, as many generators write.
  const box = widgetDict(agree)
  for (const key of ['N', 'D']) {
    const states = box
      .lookupMaybe(PDFName.of('AP'), PDFDict)
      ?.lookupMaybe(PDFName.of(key), PDFDict)
    states?.delete(PDFName.of('Off'))
  }
  box.set(PDFName.of('AS'), PDFName.of('Off'))
  widgetDict(note).delete(PDFName.of('AP'))
  await save(
    'form-bare-appearances',
    d,
    {
      pages: 1,
      opens: true,
      describes:
        'A checkbox whose /AP has an on state and no /Off, and a text field with no /AP, for checking that widgets the file draws nothing for are not reported as missing',
      annotations: { Widget: 2 },
    },
    { appearances: false }
  )
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

  const d2 = await PDFDocument.load(base, { updateMetadata: false })
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

  write('incremental-saved', appendRevision(base, ctx, [p2.ref, hl], 'incremental-saved'))
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
  encrypt(
    name,
    plain,
    ['--allow-weak-crypto', '--encrypt', 'inkbar', 'owner-secret', ...keyArgs],
    'inkbar'
  )
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

async function formStructure() {
  const { d, font } = await doc()
  const page = d.addPage([612, 792])
  page.node.set(PDFName.of('Tabs'), PDFName.of('S'))
  text(page, font, ['Structure form'], 740)
  const form = d.getForm()
  // /Annots order is first, second, third, top to bottom on the page.
  const names = ['first', 'second', 'third'] as const
  const fields = names.map((name, i) => {
    const f = form.createTextField(name)
    f.addToPage(page, { x: 72, y: 640 - i * 60, width: 200, height: 22 })
    label(page, font, name, 72, 640 - i * 60, 22)
    return f
  })
  form.updateFieldAppearances(font)
  addHelv(d, form)
  // The structure tree reads third, then first; second is not in it. The widgets sit deep in
  // it (Document > Sect > Form > OBJR), and third's Form element also holds marked content.
  const ctx = d.context
  const rootRef = ctx.nextRef()
  const docRef = ctx.nextRef()
  const sectRef = ctx.nextRef()
  const widgetRef = (i: number) => ctx.getObjectRef(widgetDict(fields[i]!))!
  const objr = (i: number) => ctx.obj({ Type: 'OBJR', Obj: widgetRef(i), Pg: page.ref })
  const elems = [2, 0].map((i, n) => {
    const ref = ctx.register(
      ctx.obj({
        Type: 'StructElem',
        S: 'Form',
        P: sectRef,
        Pg: page.ref,
        K: n === 0 ? ctx.obj([0, objr(i)]) : objr(i),
      })
    )
    widgetDict(fields[i]!).set(PDFName.of('StructParent'), PDFNumber.of(n))
    return ref
  })
  ctx.assign(sectRef, ctx.obj({ Type: 'StructElem', S: 'Sect', P: docRef, K: elems }))
  ctx.assign(
    docRef,
    ctx.obj({ Type: 'StructElem', S: 'Document', P: rootRef, K: [sectRef] })
  )
  ctx.assign(
    rootRef,
    ctx.obj({
      Type: 'StructTreeRoot',
      K: [docRef],
      ParentTree: ctx.obj({ Nums: [0, elems[0]!, 1, elems[1]!] }),
      ParentTreeNextKey: 2,
    })
  )
  d.catalog.set(PDFName.of('StructTreeRoot'), rootRef)
  d.catalog.set(PDFName.of('MarkInfo'), ctx.obj({ Marked: true }))
  // A second page with /Tabs S and no fields: its tree is not read.
  const blank = d.addPage([612, 792])
  blank.node.set(PDFName.of('Tabs'), PDFName.of('S'))
  text(blank, font, ['No fields here'], 740)
  await save('form-structure', d, {
    pages: 2,
    opens: true,
    describes:
      'Three text fields (first, second, third, in that /Annots and top-to-bottom order) on a page with /Tabs S, whose structure tree (Document > Sect > Form > OBJR, one Form also holding an MCID) lists third, then first, and leaves second out; a second /Tabs S page has no fields',
    annotations: { Widget: 3 },
  })
}

async function main() {
  mkdirSync(out, { recursive: true })
  const simple = await textSimple()
  await textSearch()
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
  await calloutXrefStream()
  await calloutIncremental()
  await calloutEncrypted()
  await calloutBadXref()
  await noteIconAp()
  await freetextFonts()
  await annotatedUnsupported()
  await acroformBasic()
  await formFields()
  await formScripted()
  await formSigned()
  await formTimer()
  await formUppercase()
  await formSharedScripted()
  await formBareAppearances()
  await formGoto()
  await formRange()
  await formStructure()
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
