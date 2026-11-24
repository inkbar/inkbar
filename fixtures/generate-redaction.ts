/*
 * Writes the fixtures for applying redactions into pdf/, and their entries into manifest.json,
 * keeping every other entry. Each file is written byte by byte, so running it again writes the
 * same bytes. Every content stream is Flate-compressed, so a test that looks for a secret in the
 * raw bytes must inflate them first.
 *
 *   pnpm --filter @inkbar/fixtures exec tsx generate-redaction.ts
 *
 * Each entry records `secrets` (words under a region that must be gone after the apply), `keeps`
 * (page text beside the regions that must survive) and `regions` (where to put the marks). The
 * check-* files hold content under their regions that no apply has touched, and the bad-* files
 * are redacted badly on purpose and have no regions; in both, `secrets` are words still there.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

import { format, resolveConfig } from 'prettier'

import { here, manifestPath, out } from './generate-paths'

import type { FixtureMeta, RedactionRegion } from './index'
import type { FixtureName } from './urls'

/** A PDF of `bodies`, object n at bodies[n - 1], object 1 the catalog. */
function buildPdf(bodies: (string | Buffer)[], trailer = ''): Buffer {
  const parts = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')]
  const offsets: number[] = []
  let length = (parts[0] as Buffer).length
  bodies.forEach((body, i) => {
    offsets.push(length)
    const piece = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`),
      typeof body === 'string' ? Buffer.from(body, 'latin1') : body,
      Buffer.from('\nendobj\n'),
    ])
    parts.push(piece)
    length += piece.length
  })
  const xref = [`xref\n0 ${bodies.length + 1}\n`, '0000000000 65535 f \n']
  for (const offset of offsets)
    xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`)
  xref.push(
    `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R ${trailer}>>\nstartxref\n${length}\n%%EOF\n`
  )
  parts.push(Buffer.from(xref.join('')))
  return Buffer.concat(parts)
}

/** A Flate-compressed stream object with `dict` entries. */
function stream(dict: string, data: string | Buffer): Buffer {
  const body = deflateSync(typeof data === 'string' ? Buffer.from(data, 'latin1') : data)
  return Buffer.concat([
    Buffer.from(`<< ${dict} /Length ${body.length} /Filter /FlateDecode >>\nstream\n`),
    body,
    Buffer.from('\nendstream'),
  ])
}

const WIDTH = 400
const HEIGHT = 300
const HELVETICA =
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'

/**
 * A page object of the standard size, drawing `contents`, with /F1 and `resources` in its
 * resources and `entries` in its dictionary.
 */
const page = (contents: number, font: number, resources = '', entries = '') =>
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] /Contents ${contents} 0 R /Resources << /Font << /F1 ${font} 0 R >> ${resources}>> ${entries}>>`

/** Helvetica 20 at the baseline (x, y). */
const line = (x: number, y: number, text: string) =>
  `BT /F1 20 Tf ${x} ${y} Td (${text}) Tj ET\n`

/** A region from its left, bottom, right and top edges, corners in Gloss order. */
const region = (
  pageIndex: number,
  [l, b, r, t]: [number, number, number, number]
): RedactionRegion => ({ page: pageIndex, quad: [l, t, r, t, l, b, r, b] })

/**
 * The words sit on the baseline y 200: Helvetica 20 runs from about y 196 to 214. Each secret
 * ends near x 203; KEEP-BETA starts at x 300.
 */
const OVER_WORD: [number, number, number, number] = [45, 190, 215, 225]

/** `text` as the digits of a hex string. */
const hex = (text: string) => Buffer.from(text, 'latin1').toString('hex').toUpperCase()

const entries: Partial<Record<FixtureName, FixtureMeta>> = {}

function write(name: FixtureName, bytes: Buffer, meta: Omit<FixtureMeta, 'file'>) {
  writeFileSync(join(out, `${name}.pdf`), bytes)
  entries[name] = { file: `${name}.pdf`, ...meta }
}

function redactText() {
  write(
    'redact-text',
    buildPdf(
      [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        page(4, 5),
        stream('', line(50, 200, 'SECRET-ALPHA') + line(300, 200, 'KEEP-BETA')),
        HELVETICA,
        '<< /Title (Redaction fixture) /Producer (Inkbar fixtures) >>',
      ],
      '/Info 6 0 R '
    ),
    {
      pages: 1,
      opens: true,
      describes:
        'SECRET-ALPHA and KEEP-BETA on one line of Helvetica, with a region over the first; the trailer has /Info',
      secrets: ['SECRET', 'ALPHA'],
      keeps: ['KEEP-BETA'],
      regions: [region(0, OVER_WORD)],
    }
  )
}

/**
 * A 20 x 10 RGB image over x 100..300, y 100..200. Columns 0 to 9 are red, 10 to 18 green and 19
 * red again; the region covers the left half.
 */
function redactImageFlate() {
  const pixels = Buffer.alloc(20 * 10 * 3)
  for (let row = 0; row < 10; row++)
    for (let col = 0; col < 20; col++)
      pixels.set(col < 10 || col === 19 ? [255, 0, 0] : [0, 128, 0], (row * 20 + col) * 3)
  write(
    'redact-image-flate',
    buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      page(4, 5, '/XObject << /Im0 6 0 R >> '),
      stream('', `q 200 0 0 100 100 100 cm /Im0 Do Q\n${line(100, 50, 'KEEP-BETA')}`),
      HELVETICA,
      stream(
        '/Type /XObject /Subtype /Image /Width 20 /Height 10 /ColorSpace /DeviceRGB /BitsPerComponent 8',
        pixels
      ),
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'A Flate RGB image of 20 by 10 samples over x 100..300, y 100..200: columns 0 to 9 and 19 red, the rest green; the region covers the left half',
      secrets: [],
      keeps: ['KEEP-BETA'],
      regions: [region(0, [95, 95, 200, 205])],
    }
  )
}

/** A red five-pointed star around (150, 150) that the region cuts, and a blue square beside it. */
function redactPath() {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? 60 : 24
    const angle = Math.PI / 2 + (i * Math.PI) / 5
    return [150 + radius * Math.cos(angle), 150 + radius * Math.sin(angle)].map(
      (n) => Math.round(n * 100) / 100
    )
  })
  const star = points.map(([x, y], i) => `${x} ${y} ${i === 0 ? 'm' : 'l'}`).join(' ')
  write(
    'redact-path',
    buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      page(4, 5),
      stream(
        '',
        `1 0 0 rg ${star} h f\n0 0 1 rg 260 120 60 60 re f\n${line(100, 50, 'KEEP-BETA')}`
      ),
      HELVETICA,
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'A red filled star around (150, 150), 60 pt to its points, with the region over its middle (x and y 120..180), and a blue square at x 260..320, y 120..180',
      secrets: [],
      keeps: ['KEEP-BETA'],
      regions: [region(0, [120, 120, 180, 180])],
    }
  )
}

/**
 * Under the region (x 40..240, y 150..250): a stamp whose appearance says SECRET-STAMP, the text
 * widget of field "hidden" holding SECRET-DELTA, and a note saying SECRET-NOTE with a pop-up
 * beside the region. Field "kept" has its widget below the region.
 */
function redactAnnotations() {
  const appearance = (w: number, h: number, text: string) =>
    stream(
      `/Type /XObject /Subtype /Form /BBox [0 0 ${w} ${h}] /Resources << /Font << /F1 5 0 R >> >>`,
      `0.9 g 0 0 ${w} ${h} re f 0 g BT /F1 10 Tf 4 8 Td (${text}) Tj ET`
    )
  write(
    'redact-annotations',
    buildPdf([
      '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [8 0 R 9 0 R] /DA (/F1 10 Tf 0 g) /DR << /Font << /F1 5 0 R >> >> >> >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      page(4, 5, '', '/Annots [6 0 R 8 0 R 10 0 R 11 0 R 9 0 R] '),
      stream('', line(100, 50, 'KEEP-BETA')),
      HELVETICA,
      '<< /Type /Annot /Subtype /Stamp /Rect [50 160 125 200] /F 4 /NM (stamp) /Name /Draft /AP << /N 7 0 R >> /P 3 0 R >>',
      appearance(75, 40, 'SECRET-STAMP'),
      `<< /Type /Annot /Subtype /Widget /FT /Tx /T (hidden) /V <${hex('SECRET-DELTA')}> /DA (/F1 10 Tf 0 g) /Rect [130 160 230 185] /F 4 /AP << /N 12 0 R >> /P 3 0 R >>`,
      `<< /Type /Annot /Subtype /Widget /FT /Tx /T (kept) /V <${hex('KEEP-FIELD')}> /DA (/F1 10 Tf 0 g) /Rect [260 60 360 85] /F 4 /AP << /N 13 0 R >> /P 3 0 R >>`,
      `<< /Type /Annot /Subtype /Text /Rect [60 215 80 235] /F 4 /NM (note) /Name /Comment /Contents <${hex('SECRET-NOTE')}> /Popup 11 0 R /P 3 0 R >>`,
      '<< /Type /Annot /Subtype /Popup /Rect [260 200 380 260] /Parent 10 0 R /Open false >>',
      appearance(100, 25, 'SECRET-DELTA'),
      appearance(100, 25, 'KEEP-FIELD'),
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'Under the region (x 40..240, y 150..250) a stamp drawing SECRET-STAMP, the widget of text field "hidden" holding SECRET-DELTA, and a note saying SECRET-NOTE whose pop-up lies outside it; text field "kept" has its widget below the region',
      annotations: { Stamp: 1, Widget: 2, Text: 1, Popup: 1 },
      placed: [
        { what: "the stamp's appearance, SECRET-STAMP", box: [50, 160, 125, 200] },
        { what: 'the widget of field "hidden", SECRET-DELTA', box: [130, 160, 230, 185] },
        { what: 'the note, whose contents are SECRET-NOTE', box: [60, 215, 80, 235] },
      ],
      secrets: ['SECRET', 'STAMP', 'DELTA', 'NOTE'],
      keeps: ['KEEP-BETA'],
      regions: [region(0, [40, 150, 240, 250])],
    }
  )
}

/**
 * Page 1 has HIDDEN-DELTA under the region and KEEP-BETA beside it. Page 2 has SECRET-GAMMA under
 * a Redact annotation another program left unapplied, with no /INKB_Gloss.
 */
function redactForeignMark() {
  const [l, b, r, t] = OVER_WORD
  write(
    'redact-foreign-mark',
    buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
      page(4, 5),
      stream('', line(50, 200, 'HIDDEN-DELTA') + line(300, 200, 'KEEP-BETA')),
      HELVETICA,
      page(7, 5, '', '/Annots [8 0 R] '),
      stream('', line(50, 200, 'SECRET-GAMMA')),
      `<< /Type /Annot /Subtype /Redact /Rect [${l} ${b} ${r} ${t}] /QuadPoints [${l} ${t} ${r} ${t} ${l} ${b} ${r} ${b}] /IC [0 0 0] /F 4 /NM (other-mark) /T (Another program) >>`,
    ]),
    {
      pages: 2,
      opens: true,
      describes:
        'Page 1: HIDDEN-DELTA under the region, KEEP-BETA beside it. Page 2: SECRET-GAMMA under an unapplied Redact annotation from another program, with no /INKB_Gloss',
      annotations: { Redact: 1 },
      secrets: ['HIDDEN', 'DELTA'],
      keeps: ['KEEP-BETA', 'SECRET-GAMMA'],
      regions: [region(0, OVER_WORD)],
    }
  )
}

/**
 * SECRET-GAMMA under a Redact annotation another program left unapplied, and KEEP-BETA beside
 * it. The mark has a pop-up listed in the page's /Annots and an appearance stroking a red
 * rectangle along its edge.
 */
function redactForeignPopup() {
  const [l, b, r, t] = OVER_WORD
  write(
    'redact-foreign-popup',
    buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      page(4, 5, '', '/Annots [6 0 R 7 0 R] '),
      stream('', line(50, 200, 'SECRET-GAMMA') + line(300, 200, 'KEEP-BETA')),
      HELVETICA,
      `<< /Type /Annot /Subtype /Redact /Rect [${l} ${b} ${r} ${t}] /QuadPoints [${l} ${t} ${r} ${t} ${l} ${b} ${r} ${b}] /IC [0 0 0] /C [1 0 0] /F 4 /NM (other-mark) /T (Another program) /Popup 7 0 R /AP << /N 8 0 R >> /P 3 0 R >>`,
      '<< /Type /Annot /Subtype /Popup /Rect [220 40 380 100] /Parent 6 0 R /Open false >>',
      stream(
        `/Type /XObject /Subtype /Form /BBox [0 0 ${r - l} ${t - b}]`,
        `1 0 0 RG 2 w 1 1 ${r - l - 2} ${t - b - 2} re S`
      ),
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        "SECRET-GAMMA under an unapplied Redact annotation from another program, with no /INKB_Gloss, and KEEP-BETA beside it. The mark's pop-up is listed in /Annots and its appearance strokes a red rectangle along its edge",
      annotations: { Redact: 1, Popup: 1 },
      secrets: [],
      keeps: ['SECRET-GAMMA', 'KEEP-BETA'],
    }
  )
}

/**
 * redact-text with an optional content group that the default configuration turns off, holding
 * the words LAYER-TEXT below the line.
 */
function redactHiddenLayer() {
  write(
    'redact-hidden-layer',
    buildPdf([
      '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [6 0 R] /D << /OFF [6 0 R] >> >> >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      page(4, 5, '/Properties << /L0 6 0 R >> '),
      stream(
        '',
        line(50, 200, 'SECRET-ALPHA') +
          line(300, 200, 'KEEP-BETA') +
          `/OC /L0 BDC\n${line(50, 100, 'LAYER-TEXT')}EMC\n`
      ),
      HELVETICA,
      '<< /Type /OCG /Name (Hidden layer) >>',
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'redact-text without /Info, plus a layer the default configuration hides, drawing LAYER-TEXT at y 100',
      secrets: ['SECRET', 'ALPHA'],
      keeps: ['KEEP-BETA', 'LAYER-TEXT'],
      regions: [region(0, OVER_WORD)],
    }
  )
}

/*
 * Files with content left under a region and nothing done to it, for the strict check: each must
 * fail it. Text, a path and text in an annotation appearance are the unredacted redact-text,
 * redact-path and redact-annotations. redact-image-flate cannot serve for an image: its left half
 * is one flat red, and the check counts samples of one value as blank.
 */

/**
 * A 20 x 10 Flate RGB image over x 100..300, y 100..200, every sample a different colour; the
 * region covers its left half.
 */
function checkImage() {
  const pixels = Buffer.alloc(20 * 10 * 3)
  for (let row = 0; row < 10; row++)
    for (let col = 0; col < 20; col++)
      pixels.set([col * 12, row * 25, 255 - col * 12], (row * 20 + col) * 3)
  write(
    'check-image',
    buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      page(4, 5, '/XObject << /Im0 6 0 R >> '),
      stream('', `q 200 0 0 100 100 100 cm /Im0 Do Q\n${line(100, 50, 'KEEP-BETA')}`),
      HELVETICA,
      stream(
        '/Type /XObject /Subtype /Image /Width 20 /Height 10 /ColorSpace /DeviceRGB /BitsPerComponent 8',
        pixels
      ),
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'A Flate RGB image of 20 by 10 samples over x 100..300, y 100..200, its colour changing from sample to sample; the region covers its left half; nothing redacted',
      secrets: [],
      keeps: ['KEEP-BETA'],
      regions: [region(0, [95, 95, 200, 205])],
    }
  )
}

/** SECRET-ALPHA drawn by a Form XObject under the region, KEEP-BETA in the page content. */
function checkFormText() {
  write(
    'check-form-text',
    buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      page(4, 5, '/XObject << /Fm0 6 0 R >> '),
      stream('', `q /Fm0 Do Q\n${line(300, 200, 'KEEP-BETA')}`),
      HELVETICA,
      stream(
        `/Type /XObject /Subtype /Form /BBox [0 0 ${WIDTH} ${HEIGHT}] /Resources << /Font << /F1 5 0 R >> >>`,
        line(50, 200, 'SECRET-ALPHA')
      ),
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'SECRET-ALPHA drawn by a Form XObject under the region, KEEP-BETA beside it in the page content; nothing redacted',
      secrets: ['SECRET', 'ALPHA'],
      keeps: ['KEEP-BETA'],
      regions: [region(0, OVER_WORD)],
    }
  )
}

/**
 * A 4 x 4 grey inline image in a checkerboard of two values over x 100..200, y 100..200; the
 * region covers its left half.
 */
function checkInlineImage() {
  const samples = Buffer.alloc(16)
  for (let i = 0; i < 16; i++) samples[i] = (Math.floor(i / 4) + i) % 2 ? 0x20 : 0xc0
  write(
    'check-inline-image',
    buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      page(4, 5),
      stream(
        '',
        Buffer.concat([
          Buffer.from('q 100 0 0 100 100 100 cm\nBI /W 4 /H 4 /CS /G /BPC 8 ID '),
          samples,
          Buffer.from(`\nEI Q\n${line(100, 50, 'KEEP-BETA')}`),
        ])
      ),
      HELVETICA,
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'A 4 by 4 grey inline image, a checkerboard of two values, over x 100..200, y 100..200; the region covers its left half; nothing redacted',
      secrets: [],
      keeps: ['KEEP-BETA'],
      regions: [region(0, [95, 95, 150, 205])],
    }
  )
}

/**
 * The region filled with a tiling pattern whose cell draws SECRET-ALPHA. The redaction does not
 * enter patterns, so an apply would leave the text.
 */
function checkPatternText() {
  const [l, b, r, t] = OVER_WORD
  write(
    'check-pattern-text',
    buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      page(4, 5, '/Pattern << /P0 6 0 R >> '),
      stream(
        '',
        `q /Pattern cs /P0 scn ${l + 1} ${b + 1} ${r - l - 2} ${t - b - 2} re f Q\n${line(300, 200, 'KEEP-BETA')}`
      ),
      HELVETICA,
      stream(
        '/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 200 40] /XStep 200 /YStep 40 /Resources << /Font << /F1 5 0 R >> >>',
        `BT /F1 20 Tf 5 12 Td (SECRET-ALPHA) Tj ET`
      ),
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'A fill 1 pt inside the region (x 46..214, y 191..224) with a tiling pattern whose cell draws SECRET-ALPHA, KEEP-BETA beside it in the page content; nothing redacted. The fill lies wholly inside the region',
      secrets: ['SECRET', 'ALPHA'],
      keeps: ['KEEP-BETA'],
      regions: [region(0, OVER_WORD)],
      placed: [
        {
          what: "SECRET-ALPHA in the pattern's 200 by 40 cell at (5, 12); the tile at (0, 200) puts it at (5, 212), across the region's top edge",
          box: [5, 208, 159, 227],
        },
      ],
      refused: {
        need: 'covered',
        kinds: ['pattern'],
        why: 'the shape lies wholly inside the mark, so the apply would remove it; the engine refuses all the same, because it cannot show that nothing else keeps the pattern in the file',
      },
    }
  )
}

/*
 * Files redacted badly on purpose, for the check without regions.
 */

/** A black rectangle drawn over SECRET-DELTA in the page content, which still holds the text. */
function badBlackBox() {
  const [l, b, r, t] = OVER_WORD
  write(
    'bad-black-box',
    buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      page(4, 5),
      stream(
        '',
        `${line(50, 200, 'SECRET-DELTA')}0 g ${l} ${b} ${r - l} ${t - b} re f\n${line(300, 200, 'KEEP-BETA')}`
      ),
      HELVETICA,
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'SECRET-DELTA with a black rectangle drawn over it (x 45..215, y 190..225) in the page content, KEEP-BETA beside it',
      secrets: ['SECRET', 'DELTA'],
      keeps: ['KEEP-BETA'],
    }
  )
}

/** SECRET-GAMMA under a Redact annotation nobody applied. */
function badUnapplied() {
  const [l, b, r, t] = OVER_WORD
  write(
    'bad-unapplied',
    buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      page(4, 5, '', '/Annots [6 0 R] '),
      stream('', line(50, 200, 'SECRET-GAMMA') + line(300, 200, 'KEEP-BETA')),
      HELVETICA,
      `<< /Type /Annot /Subtype /Redact /Rect [${l} ${b} ${r} ${t}] /QuadPoints [${l} ${t} ${r} ${t} ${l} ${b} ${r} ${b}] /IC [0 0 0] /F 4 /NM (unapplied) >>`,
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'SECRET-GAMMA under a Redact annotation (x 45..215, y 190..225) that was never applied, KEEP-BETA beside it',
      annotations: { Redact: 1 },
      secrets: ['SECRET', 'GAMMA'],
      keeps: ['KEEP-BETA'],
    }
  )
}

/**
 * A first revision with SECRET-ZETA and KEEP-BETA, and an appended second revision whose page
 * draws KEEP-BETA alone. The first revision's content stream stays in the bytes.
 */
function badAppended() {
  const original = buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    page(4, 5),
    stream('', line(50, 200, 'SECRET-ZETA') + line(300, 200, 'KEEP-BETA')),
    HELVETICA,
  ])
  const previous = /startxref\n(\d+)\n%%EOF\n$/.exec(original.toString('latin1'))?.[1]
  if (previous === undefined) throw new Error('no startxref in the first revision')
  const pageObject = Buffer.from(`3 0 obj\n${page(6, 5)}\nendobj\n`, 'latin1')
  const contentObject = Buffer.concat([
    Buffer.from('6 0 obj\n'),
    stream('', line(300, 200, 'KEEP-BETA')),
    Buffer.from('\nendobj\n'),
  ])
  const pageAt = original.length
  const contentAt = pageAt + pageObject.length
  const xrefAt = contentAt + contentObject.length
  const offset = (n: number) => `${String(n).padStart(10, '0')} 00000 n \n`
  const update = [
    'xref\n0 1\n0000000000 65535 f \n',
    `3 1\n${offset(pageAt)}`,
    `6 1\n${offset(contentAt)}`,
    `trailer\n<< /Size 7 /Root 1 0 R /Prev ${previous} >>\nstartxref\n${xrefAt}\n%%EOF\n`,
  ].join('')
  write(
    'bad-appended',
    Buffer.concat([original, pageObject, contentObject, Buffer.from(update, 'latin1')]),
    {
      pages: 1,
      opens: true,
      describes:
        'Two revisions: the first draws SECRET-ZETA and KEEP-BETA, the appended second draws KEEP-BETA alone; the first content stream stays in the bytes',
      secrets: ['SECRET', 'ZETA'],
      keeps: ['KEEP-BETA'],
    }
  )
}

/*
 * The matrix: one file per kind of content a redaction must remove, each read back after the
 * apply by readers that are not PDFium. Secrets in text are two words joined by a hyphen. A
 * secret in an image or a drawing is whatever the image or drawing paints inside the region:
 * the readers look for any painted sample or path there, so these files keep the area beside
 * each region clear and put the content they keep at least 8 pt away from it.
 */

const samples = join(here, 'redaction-samples')
const sample = (file: string) => readFileSync(join(samples, file))

/** A stream object stored as `data`, with `dict` entries and no compression added. */
function rawStream(dict: string, data: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`),
    data,
    Buffer.from('\nendstream'),
  ])
}

/**
 * Object numbers handed out in order, so a file's objects can refer to each other before they
 * are written. Object 1 is the catalog and object 2 the page tree.
 */
class Objects {
  private bodies: (string | Buffer | undefined)[] = [undefined, undefined]
  add(body: string | Buffer): number {
    this.bodies.push(body)
    return this.bodies.length
  }
  reserve(): number {
    this.bodies.push(undefined)
    return this.bodies.length
  }
  set(n: number, body: string | Buffer) {
    this.bodies[n - 1] = body
  }
  /** The file, with `catalog` entries beside /Pages and the pages in `kids`. */
  pdf(kids: number[], catalog = '', trailer = ''): Buffer {
    this.set(1, `<< /Type /Catalog /Pages 2 0 R ${catalog}>>`)
    this.set(
      2,
      `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`
    )
    const missing = this.bodies.findIndex((b) => b === undefined)
    if (missing >= 0) throw new Error(`object ${missing + 1} was reserved and never set`)
    return buildPdf(this.bodies as (string | Buffer)[], trailer)
  }
}

/** A page of the standard size with `resources` and `entries`, drawing `contents`. */
const plainPage = (contents: number, resources: string, entries = '') =>
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] /Contents ${contents} 0 R /Resources << ${resources} >> ${entries}>>`

/**
 * A one-page file: `content` drawn with `resources`, Helvetica as /F1 and `fonts` beside it.
 * Helvetica is object 3, then come the objects `resources` adds, then those `fonts` adds.
 */
function onePage(
  content: string | Buffer,
  resources: (o: Objects) => string = () => '',
  extra: { fonts?: (o: Objects) => string; page?: string; catalog?: string } = {}
) {
  const o = new Objects()
  const font = o.add(HELVETICA)
  const more = resources(o)
  const fonts = extra.fonts?.(o) ?? ''
  const contents = o.add(stream('', content))
  const pageObject = o.add(
    plainPage(contents, `/Font << /F1 ${font} 0 R ${fonts}>> ${more}`, extra.page)
  )
  return o.pdf([pageObject], extra.catalog)
}

/** The text of a redact-text page: SECRET-ALPHA under OVER_WORD and KEEP-BETA beside it. */
const SECRET_LINE = line(50, 200, 'SECRET-ALPHA') + line(300, 200, 'KEEP-BETA')

/** What a text row records, beside its own description. */
const textRow = (describes: string, more: Partial<FixtureMeta> = {}) => ({
  pages: 1,
  opens: true,
  describes,
  secrets: ['SECRET', 'ALPHA'],
  keeps: ['KEEP-BETA'],
  regions: [region(0, OVER_WORD)],
  ...more,
})

/** `text` as a hex string of 2-byte codes, one per character: the Unicode value. */
const cids = (text: string) =>
  `<${[...text]
    .map((c) => c.charCodeAt(0).toString(16).padStart(4, '0'))
    .join('')
    .toUpperCase()}>`

/**
 * The Ahem subset (every glyph a square one em wide, ascent 0.8, descent 0.2) as a Type0 font
 * whose codes are Unicode values, mapped to glyphs by a CIDToGIDMap stream. `encoding` is
 * /Identity-H or /Identity-V.
 */
function ahemFont(o: Objects, encoding: 'Identity-H' | 'Identity-V'): number {
  const file = o.add(stream('', sample('ahem-subset.ttf')))
  const descriptor = o.add(
    `<< /Type /FontDescriptor /FontName /Ahem /Flags 4 /FontBBox [0 -200 1000 800] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 800 /StemV 80 /FontFile2 ${file} 0 R >>`
  )
  // The subset keeps Ahem's glyph numbers: a letter or the hyphen is glyph (code - 30).
  const map = Buffer.alloc(0x5b * 2)
  for (const c of ['-', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']) {
    const code = c.charCodeAt(0)
    map.writeUInt16BE(code - 30, code * 2)
  }
  const gids = o.add(stream('', map))
  const cid = o.add(
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Ahem /CIDSystemInfo << /Registry <${hex('Adobe')}> /Ordering <${hex('Identity')}> /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /DW 1000 /CIDToGIDMap ${gids} 0 R >>`
  )
  const toUnicode = o.add(
    stream(
      '',
      [
        '/CIDInit /ProcSet findresource begin 12 dict begin begincmap',
        `/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def`,
        '/CMapName /Adobe-Identity-UCS def /CMapType 2 def',
        '1 begincodespacerange <0000> <FFFF> endcodespacerange',
        '2 beginbfrange <002D> <002D> <002D> <0041> <005A> <0041> endbfrange',
        'endcmap CMapName currentdict /CMap defineresource pop end end',
      ].join('\n')
    )
  )
  return o.add(
    `<< /Type /Font /Subtype /Type0 /BaseFont /Ahem /Encoding /${encoding} /DescendantFonts [${cid} 0 R] /ToUnicode ${toUnicode} 0 R >>`
  )
}

function redactTextComposite() {
  write(
    'redact-text-composite',
    onePage(
      `BT /F2 14 Tf 50 200 Td ${cids('SECRET-ALPHA')} Tj ET\nBT /F2 14 Tf 250 200 Td ${cids('KEEP-BETA')} Tj ET\n`,
      undefined,
      { fonts: (o) => `/F2 ${ahemFont(o, 'Identity-H')} 0 R` }
    ),
    textRow(
      'SECRET-ALPHA at x 50..218 and KEEP-BETA at x 250..376 in an embedded TrueType font (a subset of Ahem) under a Type0 font with Identity-H codes equal to Unicode values; the region is over the first'
    )
  )
}

/** A Type 3 font whose glyphs are 600-unit squares named by the standard glyph names. */
function type3Font(o: Objects): number {
  const letters = [...new Set('SECRET-ALPHAKEEP-BETA')]
  const names: Record<string, string> = Object.fromEntries(
    letters.map((c) => [c, c === '-' ? 'hyphen' : c])
  )
  const procs = letters.map(
    (c) =>
      `/${names[c]} ${o.add(stream('', '600 0 50 0 550 700 d1 50 0 500 700 re f'))} 0 R`
  )
  const widths = Array.from({ length: 90 - 45 + 1 }, (_, i) =>
    letters.includes(String.fromCharCode(45 + i)) ? 600 : 0
  )
  const differences = letters.map((c) => `${c.charCodeAt(0)} /${names[c]}`).join(' ')
  return o.add(
    `<< /Type /Font /Subtype /Type3 /FontBBox [0 0 600 700] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << ${procs.join(' ')} >> /Encoding << /Type /Encoding /Differences [${differences}] >> /FirstChar 45 /LastChar 90 /Widths [${widths.join(' ')}] /Resources << >> >>`
  )
}

function redactTextType3() {
  write(
    'redact-text-type3',
    onePage(
      `BT /F3 20 Tf 50 200 Td (SECRET-ALPHA) Tj ET\nBT /F3 20 Tf 250 200 Td (KEEP-BETA) Tj ET\n`,
      undefined,
      { fonts: (o) => `/F3 ${type3Font(o)} 0 R` }
    ),
    textRow(
      'SECRET-ALPHA at x 50..194 and KEEP-BETA at x 250..358 in a Type 3 font whose glyphs are filled squares; the region is over the first'
    )
  )
}

function redactTextNestedForm() {
  write(
    'redact-text-nested-form',
    onePage(`q /Fm0 Do Q\n${line(300, 200, 'KEEP-BETA')}`, (o) => {
      const font = o.add(HELVETICA)
      const inner = o.add(
        stream(
          `/Type /XObject /Subtype /Form /BBox [0 0 ${WIDTH} ${HEIGHT}] /Resources << /Font << /F1 ${font} 0 R >> >>`,
          line(40, 200, 'SECRET-ALPHA')
        )
      )
      const outer = o.add(
        stream(
          `/Type /XObject /Subtype /Form /BBox [0 0 ${WIDTH} ${HEIGHT}] /Resources << /XObject << /Fm1 ${inner} 0 R >> >>`,
          'q 1 0 0 1 10 0 cm /Fm1 Do Q'
        )
      )
      return `/XObject << /Fm0 ${outer} 0 R >>`
    }),
    textRow(
      'SECRET-ALPHA drawn by a form inside a form (shifted 10 pt right by the outer one) under the region, KEEP-BETA in the page content'
    )
  )
}

function redactTextSharedForm() {
  const o = new Objects()
  const font = o.add(HELVETICA)
  const form = o.add(
    stream(
      `/Type /XObject /Subtype /Form /BBox [0 0 ${WIDTH} ${HEIGHT}] /Resources << /Font << /F1 ${font} 0 R >> >>`,
      line(50, 200, 'SECRET-ALPHA')
    )
  )
  const pages = [0, 1].map(() => {
    const contents = o.add(stream('', `q /Fm0 Do Q\n${line(300, 200, 'KEEP-BETA')}`))
    return o.add(
      plainPage(contents, `/Font << /F1 ${font} 0 R >> /XObject << /Fm0 ${form} 0 R >>`)
    )
  })
  write(
    'redact-text-shared-form',
    o.pdf(pages),
    textRow(
      'Two pages that each draw one form holding SECRET-ALPHA, and KEEP-BETA in their own content; the region is on the first page only, so the second must still show SECRET-ALPHA',
      { pages: 2, keeps: ['KEEP-BETA', 'SECRET-ALPHA'] }
    )
  )
}

function redactTextClip() {
  write(
    'redact-text-clip',
    onePage(
      `q BT /F1 20 Tf 7 Tr 50 200 Td (SECRET-ALPHA) Tj ET 1 0 1 rg 40 185 240 45 re f Q\n${line(300, 200, 'KEEP-BETA')}`
    ),
    textRow(
      'SECRET-ALPHA in text rendering mode 7, a clipping path that a magenta rectangle (x 40..280, y 185..230) then fills, and KEEP-BETA beside it; the region is over the clipping text'
    )
  )
}

/** A point of the text space of `matrix` (a b c d e f) on the page, to two places. */
const onPage = ([a, b, c, d, e, f]: number[], x: number, y: number): [number, number] => [
  Math.round(((a as number) * x + (c as number) * y + (e as number)) * 100) / 100,
  Math.round(((b as number) * x + (d as number) * y + (f as number)) * 100) / 100,
]

/** A region of the rectangle l b r t in the space of `matrix`, its corners in Gloss order. */
const regionIn = (
  pageIndex: number,
  matrix: number[],
  [l, b, r, t]: [number, number, number, number]
): RedactionRegion => ({
  page: pageIndex,
  quad: [
    ...onPage(matrix, l, t),
    ...onPage(matrix, r, t),
    ...onPage(matrix, l, b),
    ...onPage(matrix, r, b),
  ],
})

const COS30 = 0.866025
const SIN30 = 0.5

/**
 * A band (x 20..380, y 170..240) filled with a tiling pattern of one cell the size of the page,
 * which draws SECRET-ALPHA where the region is. The band reaches past the region, so the apply
 * cuts a hole in it and the pattern is still painted around the hole.
 */
function redactTextPattern() {
  write(
    'redact-text-pattern',
    onePage(
      `q /Pattern cs /P0 scn 20 170 360 70 re f Q\n${line(300, 100, 'KEEP-BETA')}`,
      (o) => {
        const font = o.add(HELVETICA)
        return `/Pattern << /P0 ${o.add(
          stream(
            `/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 ${WIDTH} ${HEIGHT}] /XStep ${WIDTH} /YStep ${HEIGHT} /Resources << /Font << /F1 ${font} 0 R >> >>`,
            `0.8 g 0 0 ${WIDTH} ${HEIGHT} re f 0 g ${line(50, 200, 'SECRET-ALPHA')}`
          )
        )} 0 R >>`
      }
    ),
    textRow(
      'A band at x 20..380, y 170..240 filled with a tiling pattern whose one cell, the size of the page, is grey with SECRET-ALPHA at (50, 200), under the region; KEEP-BETA at (300, 100) in the page content',
      {
        placed: [
          {
            what: "SECRET-ALPHA in the pattern's one page-sized cell, placed by the identity matrix at (50, 200)",
            box: [50, 196, 204, 215],
          },
        ],
        refused: {
          need: 'shown',
          kinds: ['pattern'],
          why: "the band reaches past the mark, so the apply would cut a hole in it and leave the pattern's cell, which holds the text where the mark is; the engine refuses before the apply",
        },
      }
    )
  )
}

function redactTextRotated() {
  const matrix = [COS30, SIN30, -SIN30, COS30, 60, 120]
  write(
    'redact-text-rotated',
    onePage(
      `BT /F1 20 Tf ${matrix.join(' ')} Tm (SECRET-ALPHA) Tj 20 40 Td (KEEP-GAMMA) Tj ET\n${line(250, 60, 'KEEP-BETA')}`
    ),
    textRow(
      'SECRET-ALPHA on a baseline turned 30 degrees about (60, 120), under a region turned with it; KEEP-GAMMA on the turned baseline 40 pt above, partly inside the bounding box of the region and outside the region; KEEP-BETA level at (250, 60)',
      // SECRET-ALPHA is 153.4 pt long and its capitals 14.4 pt high.
      {
        keeps: ['KEEP-BETA', 'KEEP-GAMMA'],
        regions: [regionIn(0, matrix, [-5, -6, 158, 20])],
      }
    )
  )
}

function redactTextVertical() {
  write(
    'redact-text-vertical',
    onePage(
      `BT /F2 16 Tf 100 280 Td ${cids('SECRET-ALPHA')} Tj ET\nBT /F2 16 Tf 300 280 Td ${cids('KEEP-BETA')} Tj ET\n`,
      undefined,
      { fonts: (o) => `/F2 ${ahemFont(o, 'Identity-V')} 0 R` }
    ),
    textRow(
      'SECRET-ALPHA and KEEP-BETA written top to bottom in the Ahem subset with Identity-V codes, from y 280 at x 100 and x 300; the region is over the first column',
      { regions: [region(0, [80, 60, 125, 295])] }
    )
  )
}

function redactTextHalfWord() {
  // K, E, E, P and the hyphen advance 60.02 pt at Helvetica 20: S starts at x 110.02.
  write(
    'redact-text-half-word',
    onePage(line(50, 200, 'KEEP-SECRET')),
    textRow(
      'KEEP-SECRET in one string of Helvetica, with the region from x 110, where its S starts, to x 215',
      {
        secrets: ['SECRET'],
        keeps: ['KEEP-'],
        regions: [region(0, [110, 190, 215, 225])],
      }
    )
  )
}

/*
 * Images. Each is 64 by 32 samples drawn over x 100..292, y 100..196 (3 pt a sample) unless
 * said otherwise. Samples 4 to 27 across, rows 4 to 27, hold the content under the region; samples
 * 36 to 59 across hold the content beside it; the rest is paper. The region ends at x 198, a
 * third of the way into sample 32.
 */
const IMAGE_AT = 'q 192 0 0 96 100 100 cm /Im0 Do Q'
const UNDER_IMAGE: [number, number, number, number] = [90, 90, 198, 205]
const inSecret = (col: number, row: number) =>
  col >= 4 && col <= 27 && row >= 4 && row <= 27
const inKept = (col: number, row: number) =>
  col >= 36 && col <= 59 && row >= 4 && row <= 27

/** The two-level pattern: 3 by 3 squares of 6 samples under the region, a solid block beside. */
const bilevelInk = (col: number, row: number) =>
  (inSecret(col, row) && (col - 4) % 8 < 6 && (row - 4) % 8 < 6) || inKept(col, row)

/**
 * The colour pattern: a different magenta for every sample under the region, green beside it
 * from sample `keptFrom` across.
 */
function colourPixels(keptFrom = 36): Buffer {
  const pixels = Buffer.alloc(64 * 32 * 3, 255)
  for (let row = 0; row < 32; row++)
    for (let col = 0; col < 64; col++) {
      const at = (row * 64 + col) * 3
      if (inSecret(col, row))
        pixels.set([200 + col, (col * 7 + row * 3) % 90, 255 - row], at)
      else if (inKept(col, row) && col >= keptFrom) pixels.set([0, 160, 0], at)
    }
  return pixels
}

/** One bit a sample, rows padded to bytes, a bit set where `set` says. */
function bits(width: number, height: number, set: (col: number, row: number) => boolean) {
  const stride = Math.ceil(width / 8)
  const out = Buffer.alloc(stride * height)
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++)
      if (set(col, row)) {
        const at = row * stride + (col >> 3)
        out[at] = (out[at] as number) | (0x80 >> (col & 7))
      }
  return out
}

const COLOUR_IMAGE =
  '/Type /XObject /Subtype /Image /Width 64 /Height 32 /ColorSpace /DeviceRGB /BitsPerComponent 8'

/** What an image row records, beside its own description. */
const imageRow = (describes: string, more: Partial<FixtureMeta> = {}) => ({
  pages: 1,
  opens: true,
  describes,
  secrets: [],
  keeps: ['KEEP-BETA'],
  regions: [region(0, UNDER_IMAGE)],
  ...more,
})

/** A page drawing the image `image` makes at IMAGE_AT (or `at`), with KEEP-BETA at `keep`. */
const imagePage = (
  image: (o: Objects) => number,
  at = IMAGE_AT,
  keep = line(100, 50, 'KEEP-BETA')
) => onePage(`${at}\n${keep}`, (o) => `/XObject << /Im0 ${image(o)} 0 R >>`)

const IMAGE_LAYOUT =
  'over x 100..292, y 100..196: content in samples 4..27 across under the region (x 90..198), content in samples 36..59 beside it'

function redactImageEncoded() {
  write(
    'redact-image-jpeg',
    imagePage((o) =>
      o.add(rawStream(`${COLOUR_IMAGE} /Filter /DCTDecode`, sample('pattern.jpg')))
    ),
    imageRow(
      `A 64 by 32 JPEG (4:2:0, quality 90; a different magenta for every sample under the region, green beside it) ${IMAGE_LAYOUT}`
    )
  )
  write(
    'redact-image-jpx',
    imagePage((o) =>
      o.add(
        rawStream(
          '/Type /XObject /Subtype /Image /Width 64 /Height 32 /Filter /JPXDecode',
          sample('pattern.jp2')
        )
      )
    ),
    imageRow(
      `A 64 by 32 JPEG 2000 image (a different magenta for every sample under the region, green beside it) ${IMAGE_LAYOUT}`
    )
  )
  write(
    'redact-image-ccitt',
    imagePage((o) =>
      o.add(
        rawStream(
          '/Type /XObject /Subtype /Image /Width 64 /Height 32 /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /CCITTFaxDecode /DecodeParms << /K -1 /Columns 64 /Rows 32 >>',
          sample('pattern.g4')
        )
      )
    ),
    imageRow(
      `A 64 by 32 CCITT Group 4 image (black squares under the region, a black block beside it) ${IMAGE_LAYOUT}`
    )
  )
  write(
    'redact-image-1bit',
    imagePage((o) =>
      o.add(
        stream(
          '/Type /XObject /Subtype /Image /Width 64 /Height 32 /ColorSpace /DeviceGray /BitsPerComponent 1',
          bits(64, 32, (col, row) => !bilevelInk(col, row))
        )
      )
    ),
    imageRow(
      `A 64 by 32 Flate grey image of 1 bit a sample (black squares under the region, a black block beside it) ${IMAGE_LAYOUT}`
    )
  )
  // The page in PDFium's test is 399 by 400 samples: two dots at the left, then a curve.
  write(
    'redact-image-jbig2',
    onePage(
      `q 199.5 0 0 200 100 50 cm /Im0 Do Q\n${line(150, 15, 'KEEP-BETA')}`,
      (o) =>
        `/XObject << /Im0 ${o.add(
          rawStream(
            '/Type /XObject /Subtype /Image /Width 399 /Height 400 /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /JBIG2Decode',
            sample('composite-and-xnor.jb2')
          )
        )} 0 R >>`
    ),
    imageRow(
      "A 399 by 400 JBIG2 image from PDFium's tests (two dots at the left, strokes to their right) over x 100..300, y 50..250; the region (x 110..160) covers the dots",
      { regions: [region(0, [110, 45, 160, 255])] }
    )
  )
}

function redactImageMasks() {
  write(
    'redact-image-stencil',
    onePage(
      `q 1 0 1 rg ${IMAGE_AT.slice(2)}\n${line(100, 50, 'KEEP-BETA')}`,
      (o) =>
        `/XObject << /Im0 ${o.add(
          stream(
            '/Type /XObject /Subtype /Image /Width 64 /Height 32 /ImageMask true /BitsPerComponent 1',
            bits(64, 32, (col, row) => !bilevelInk(col, row))
          )
        )} 0 R >>`
    ),
    imageRow(
      `A 64 by 32 stencil mask painted magenta (squares under the region, a block beside it) ${IMAGE_LAYOUT}`
    )
  )
  const alpha = Buffer.alloc(64 * 32, 255)
  for (let row = 0; row < 32; row++)
    for (let col = 0; col < 64; col++)
      if (inSecret(col, row)) alpha[row * 64 + col] = (col + row) % 2 ? 0 : 120
  write(
    'redact-image-smask',
    imagePage((o) => {
      const smask = o.add(
        stream(
          '/Type /XObject /Subtype /Image /Width 64 /Height 32 /ColorSpace /DeviceGray /BitsPerComponent 8',
          alpha
        )
      )
      return o.add(stream(`${COLOUR_IMAGE} /SMask ${smask} 0 R`, colourPixels()))
    }),
    imageRow(
      `A 64 by 32 Flate RGB image (varied magentas under the region, green beside it) with a /SMask that is a checkerboard of two opacities under the region and opaque elsewhere, ${IMAGE_LAYOUT}`
    )
  )
  write(
    'redact-image-mask',
    imagePage((o) => {
      const mask = o.add(
        stream(
          '/Type /XObject /Subtype /Image /Width 64 /Height 32 /ImageMask true /BitsPerComponent 1',
          bits(64, 32, (col, row) => inSecret(col, row) && (col + row) % 3 === 0)
        )
      )
      return o.add(stream(`${COLOUR_IMAGE} /Mask ${mask} 0 R`, colourPixels()))
    }),
    imageRow(
      `A 64 by 32 Flate RGB image (varied magentas under the region, green beside it) with a stream /Mask that masks every third sample under the region, ${IMAGE_LAYOUT}`
    )
  )
}

function redactImagePlacements() {
  const o = new Objects()
  const font = o.add(HELVETICA)
  const image = o.add(stream(COLOUR_IMAGE, colourPixels()))
  const pages = [0, 1].map(() => {
    const contents = o.add(stream('', `${IMAGE_AT}\n${line(100, 50, 'KEEP-BETA')}`))
    return o.add(
      plainPage(contents, `/Font << /F1 ${font} 0 R >> /XObject << /Im0 ${image} 0 R >>`)
    )
  })
  write(
    'redact-image-shared',
    o.pdf(pages),
    imageRow(
      `One 64 by 32 Flate RGB image (varied magentas under the region, green beside it) drawn on two pages ${IMAGE_LAYOUT}; the region is on the first page only, so the second must still show the whole image`,
      { pages: 2 }
    )
  )
  // Turned 30 degrees about (120, 60); the region is the image's left half, turned with it.
  const turned = [192 * COS30, 192 * SIN30, -96 * SIN30, 96 * COS30, 120, 60].map(
    (n) => Math.round(n * 1000) / 1000
  )
  write(
    'redact-image-rotated',
    imagePage(
      (p) => p.add(stream(COLOUR_IMAGE, colourPixels(48))),
      `q ${turned.join(' ')} cm /Im0 Do Q`,
      line(250, 25, 'KEEP-BETA')
    ),
    imageRow(
      "The colour pattern of redact-image-shared turned 30 degrees about (120, 60), green only from sample 48 across, with KEEP-BETA at (250, 25); the region is the image's left half (up to a third of the way into sample 32), turned with it. The apply blanks the samples in the region's bounding box on the page, which reaches sample 47, so the green starts past it",
      { regions: [regionIn(0, turned, [-0.02, -0.05, 32.33 / 64, 1.05])] }
    )
  )
  write(
    'redact-image-skewed',
    imagePage(
      (p) => p.add(stream(COLOUR_IMAGE, colourPixels())),
      'q 192 0 15 96 100 100 cm /Im0 Do Q'
    ),
    imageRow(
      'The colour pattern of redact-image-shared skewed: its top edge 15 pt right of its bottom edge, over x 100..307, y 100..196; the region (x 90..203) covers the content under it, which ends by x 197.2, and the content beside it starts at x 209.9',
      { regions: [region(0, [90, 90, 203, 205])] }
    )
  )
}

/*
 * Drawing. Content under a region is magenta, content beside it blue, so a reader can tell both
 * from the black overlay an apply leaves.
 */
const BLUE_SQUARE = '0 0 1 rg 260 120 60 60 re f'

const drawingRow = (describes: string, more: Partial<FixtureMeta> = {}) => ({
  pages: 1,
  opens: true,
  describes,
  secrets: [],
  keeps: ['KEEP-BETA'],
  regions: [region(0, [110, 110, 190, 190])],
  ...more,
})

function redactDrawing() {
  write(
    'redact-drawing-fill',
    onePage(
      `1 0 1 rg 130 130 m 170 135 l 160 170 l 135 165 l h f\n${BLUE_SQUARE}\n${line(100, 50, 'KEEP-BETA')}`
    ),
    drawingRow(
      'A magenta quadrilateral wholly under the region (x and y 110..190) and a blue square at x 260..320, y 120..180'
    )
  )
  write(
    'redact-drawing-stroke',
    onePage(
      `1 0 1 RG 4 w 60 150 m 150 150 l 240 160 l 330 150 l S\n0 0 1 RG 2 w 60 240 m 340 240 l S\n${line(100, 50, 'KEEP-BETA')}`
    ),
    drawingRow(
      'A magenta line 4 pt wide from (60, 150) through the region (x 110..190, y 110..190) to (330, 150), and a blue line at y 240',
      { regions: [region(0, [110, 110, 190, 190])] }
    )
  )
  write(
    'redact-drawing-shading',
    onePage(
      `q 125 125 50 50 re W n /Sh0 sh Q\nq 260 120 60 60 re W n /Sh1 sh Q\n${line(100, 50, 'KEEP-BETA')}`,
      () =>
        '/Shading << /Sh0 << /ShadingType 2 /ColorSpace /DeviceRGB /Coords [125 125 175 175] /Function << /FunctionType 2 /Domain [0 1] /C0 [1 0 1] /C1 [0.6 0 0.6] /N 1 >> /Extend [true true] >> /Sh1 << /ShadingType 2 /ColorSpace /DeviceRGB /Coords [260 120 320 180] /Function << /FunctionType 2 /Domain [0 1] /C0 [0 0 1] /C1 [0 0 0.6] /N 1 >> /Extend [true true] >> >>'
    ),
    drawingRow(
      'An axial magenta shading painted through a clip of x and y 125..175, under the region (x and y 110..190), and a blue one through a clip of x 260..320, y 120..180'
    )
  )
  write(
    'redact-drawing-pattern',
    onePage(
      `q /Pattern cs /P0 scn 120 120 60 60 re f Q\n${BLUE_SQUARE}\n${line(100, 50, 'KEEP-BETA')}`,
      (o) =>
        `/Pattern << /P0 ${o.add(
          stream(
            '/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 20 20] /XStep 20 /YStep 20 /Resources << >>',
            '1 0 1 rg 2 2 m 18 4 l 10 18 l h f'
          )
        )} 0 R >>`
    ),
    drawingRow(
      'A square (x and y 120..180) under the region filled with a tiling pattern whose 20 pt cell draws a magenta triangle, and a blue square at x 260..320. The square lies wholly under the region',
      {
        refused: {
          need: 'covered',
          kinds: ['pattern'],
          why: 'the shape lies wholly inside the mark, so the apply would remove it; the engine refuses all the same, because it cannot show that nothing else keeps the pattern in the file',
        },
      }
    )
  )
  // One cell the size of the page, so what it draws under the region appears nowhere else.
  write(
    'redact-drawing-pattern-past-mark',
    onePage(
      `q /Pattern cs /P0 scn 20 100 360 100 re f Q\n${line(100, 50, 'KEEP-BETA')}`,
      (o) =>
        `/Pattern << /P0 ${o.add(
          stream(
            `/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 ${WIDTH} ${HEIGHT}] /XStep ${WIDTH} /YStep ${HEIGHT} /Resources << >>`,
            `1 0 1 rg 130 130 m 170 135 l 160 170 l 135 165 l h f\n${BLUE_SQUARE}`
          )
        )} 0 R >>`
    ),
    drawingRow(
      'A band at x 20..380, y 100..200 filled with a tiling pattern whose one cell, the size of the page, draws a magenta quadrilateral under the region (x and y 110..190) and a blue square at x 260..320, y 120..180 beside it',
      {
        refused: {
          need: 'shown',
          kinds: ['pattern'],
          why: "the band reaches past the mark, so the apply would cut a hole in it and leave the pattern's cell, which draws the quadrilateral where the mark is; the engine refuses before the apply",
        },
      }
    )
  )
  // The same band and cell, with the mark across the band's whole left end: after the apply the
  // band no longer reaches the mark, and the cell still draws under it.
  write(
    'redact-drawing-pattern-side',
    onePage(
      `q /Pattern cs /P0 scn 20 100 360 100 re f Q\n${line(100, 50, 'KEEP-BETA')}`,
      (o) =>
        `/Pattern << /P0 ${o.add(
          stream(
            `/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 ${WIDTH} ${HEIGHT}] /XStep ${WIDTH} /YStep ${HEIGHT} /Resources << >>`,
            `1 0 1 rg 30 130 m 60 135 l 55 170 l 35 165 l h f\n${BLUE_SQUARE}`
          )
        )} 0 R >>`
    ),
    drawingRow(
      "A band at x 20..380, y 100..200 filled with a tiling pattern of one page-sized cell that draws a magenta quadrilateral at x 30..60, y 130..170 and a blue square at x 260..320; the region (x 10..70, y 90..210) covers the band's whole left end",
      {
        regions: [region(0, [10, 90, 70, 210])],
        refused: {
          need: 'shown',
          kinds: ['pattern'],
          why: "the mark covers the band's left end only, so the apply would cut the band back and leave the pattern's cell, which draws the quadrilateral where the mark is; the engine refuses before the apply",
        },
      }
    )
  )
  // A hatch: a 20 pt cell of one magenta line, filling a band that reaches past the region.
  write(
    'redact-drawing-hatch',
    onePage(
      `q /Pattern cs /P0 scn 20 100 360 100 re f Q\n${line(100, 50, 'KEEP-BETA')}`,
      (o) =>
        `/Pattern << /P0 ${o.add(
          stream(
            '/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 20 20] /XStep 20 /YStep 20 /Resources << >>',
            '1 0 1 RG 2 w 0 0 m 20 20 l S'
          )
        )} 0 R >>`
    ),
    drawingRow(
      'A band at x 20..380, y 100..200 filled with a hatch: a tiling pattern whose 20 pt cell draws one magenta diagonal. Whole tiles show beside the region (x and y 110..190), so what lies under it is a repeat of what stays in view',
      {
        refused: {
          need: 'cautious',
          kinds: ['pattern'],
          why: 'the band reaches past the mark, and the engine refuses any mark over a shape painted with a tiling pattern that the apply would only cut, whatever the cell holds; here the cell repeats what stays in view, so the refusal is cautious rather than needed',
        },
      }
    )
  )
  write(
    'redact-drawing-hatch-under-mark',
    onePage(
      `q /Pattern cs /P0 scn 120 120 60 60 re f Q\n${BLUE_SQUARE}\n${line(100, 50, 'KEEP-BETA')}`,
      (o) =>
        `/Pattern << /P0 ${o.add(
          stream(
            '/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 20 20] /XStep 20 /YStep 20 /Resources << >>',
            '1 0 1 RG 2 w 0 0 m 20 20 l S'
          )
        )} 0 R >>`
    ),
    drawingRow(
      'A square at x and y 120..180, wholly inside the region (x and y 110..190), filled with the hatch of redact-drawing-hatch, and a blue square beside it',
      {
        refused: {
          need: 'covered',
          kinds: ['pattern'],
          why: 'the shape lies wholly inside the mark, so the apply would remove it; the engine refuses all the same, because it cannot show that nothing else keeps the pattern in the file',
        },
      }
    )
  )
  meshAndFunctionShadings()
  shadingsUnderMark()
}

/**
 * A free-form triangle mesh (type 4) of two magenta triangles over x 125..275, y 125..175, so a
 * region over its left end leaves its right end in view.
 */
const MESH =
  '/ShadingType 4 /ColorSpace /DeviceRGB /BitsPerCoordinate 16 /BitsPerComponent 8 /BitsPerFlag 8 /Decode [0 65535 0 65535 0 1 0 1 0 1]'
function meshData(): Buffer {
  const vertices = [
    [125, 125, 255, 0, 255],
    [275, 125, 200, 40, 230],
    [200, 175, 230, 20, 255],
    [125, 175, 210, 60, 240],
    [275, 175, 255, 10, 200],
    [200, 125, 220, 30, 250],
  ] as const
  return Buffer.concat(
    vertices.map(([x, y, r, g, b]) => {
      const vertex = Buffer.alloc(8)
      vertex.writeUInt16BE(x, 1)
      vertex.writeUInt16BE(y, 3)
      vertex.set([r, g, b], 5)
      return vertex
    })
  )
}

/** The mesh of MESH with every vertex pulled into x and y 125..175. */
function smallMeshData(): Buffer {
  const data = meshData()
  for (let at = 0; at < data.length; at += 8) {
    const x = data.readUInt16BE(at + 1)
    data.writeUInt16BE(x > 200 ? 175 : x === 200 ? 150 : x, at + 1)
  }
  return data
}

function shadingsUnderMark() {
  write(
    'redact-drawing-mesh-under-mark',
    onePage(
      `q 120 120 60 60 re W n /Sh0 sh Q\n${BLUE_SQUARE}\n${line(100, 50, 'KEEP-BETA')}`,
      (o) => `/Shading << /Sh0 ${o.add(stream(MESH, smallMeshData()))} 0 R >>`
    ),
    drawingRow(
      'The triangle mesh of redact-drawing-mesh pulled into x and y 125..175, wholly inside the region (x and y 110..190), painted with sh, and a blue square beside it',
      {
        refused: {
          need: 'covered',
          kinds: ['shading'],
          why: 'the shape lies wholly inside the mark, so the apply would remove it; the engine refuses all the same, because it cannot show that nothing else keeps the mesh in the file',
        },
      }
    )
  )
  write(
    'redact-drawing-function-under-mark',
    onePage(
      `q 120 120 60 60 re W n /Sh0 sh Q\n${BLUE_SQUARE}\n${line(100, 50, 'KEEP-BETA')}`,
      (o) => {
        const fn = o.add(
          stream(
            '/FunctionType 4 /Domain [0 1 0 1] /Range [0 1 0 1 0 1]',
            '{ exch pop 0.5 mul 1 exch 1 }'
          )
        )
        const shading = o.add(
          `<< /ShadingType 1 /ColorSpace /DeviceRGB /Domain [0 1 0 1] /Matrix [50 0 0 50 125 125] /Function ${fn} 0 R >>`
        )
        return `/Shading << /Sh0 ${shading} 0 R >>`
      }
    ),
    drawingRow(
      'The function-based shading of redact-drawing-function-shading over x and y 125..175 only, wholly inside the region (x and y 110..190), and a blue square beside it',
      {
        refused: {
          need: 'covered',
          kinds: ['shading'],
          why: 'the shape lies wholly inside the mark, so the apply would remove it; the engine refuses all the same, because it cannot show that nothing else keeps the function in the file',
        },
      }
    )
  )
  write(
    'redact-drawing-sampled-axial',
    onePage(`q 120 120 160 60 re W n /Sh0 sh Q\n${line(100, 50, 'KEEP-BETA')}`, (o) => {
      const fn = o.add(
        stream(
          '/FunctionType 0 /Domain [0 1] /Range [0 1 0 1 0 1] /Size [4] /BitsPerSample 8',
          Buffer.from([255, 0, 255, 120, 0, 160, 255, 80, 255, 160, 0, 120])
        )
      )
      const shading = o.add(
        `<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [125 150 275 150] /Function ${fn} 0 R /Extend [true true] >>`
      )
      return `/Shading << /Sh0 ${shading} 0 R >>`
    }),
    drawingRow(
      'An axial shading whose function is sampled (type 0, four colours) painted with sh through a clip of x 120..280, y 120..180; the region (x and y 110..190) covers its left end',
      {
        refused: {
          need: 'shown',
          kinds: ['shading'],
          why: 'a sampled function can hold a picture, and the shading reaches past the mark, so the apply would only clip it and leave the function in the file; the engine refuses before the apply',
        },
      }
    )
  )
}

function meshAndFunctionShadings() {
  write(
    'redact-drawing-mesh',
    onePage(
      `q 120 120 160 60 re W n /Sh0 sh Q\n${line(100, 50, 'KEEP-BETA')}`,
      (o) => `/Shading << /Sh0 ${o.add(stream(MESH, meshData()))} 0 R >>`
    ),
    drawingRow(
      'A free-form triangle mesh shading (type 4) of two magenta triangles over x 125..275, y 125..175, painted with sh through a clip of x 120..280, y 120..180; the region (x and y 110..190) covers its left end',
      {
        refused: {
          need: 'shown',
          kinds: ['shading'],
          why: 'the shading reaches past the mark, so the apply would only clip it and leave its mesh in the file, where removing the clip shows it again; the engine refuses before the apply',
        },
      }
    )
  )
  write(
    'redact-drawing-function-shading',
    onePage(`q 120 120 160 60 re W n /Sh0 sh Q\n${line(100, 50, 'KEEP-BETA')}`, (o) => {
      const fn = o.add(
        stream(
          '/FunctionType 4 /Domain [0 1 0 1] /Range [0 1 0 1 0 1]',
          '{ exch pop 0.5 mul 1 exch 1 }'
        )
      )
      const shading = o.add(
        `<< /ShadingType 1 /ColorSpace /DeviceRGB /Domain [0 1 0 1] /Matrix [150 0 0 50 125 125] /Function ${fn} 0 R >>`
      )
      return `/Shading << /Sh0 ${shading} 0 R >>`
    }),
    drawingRow(
      'A function-based shading (type 1) over x 125..275, y 125..175, magenta shading to pink, painted with sh through a clip of x 120..280, y 120..180; the region (x and y 110..190) covers its left end',
      {
        refused: {
          need: 'shown',
          kinds: ['shading'],
          why: 'the shading reaches past the mark, so the apply would only clip it and leave its function in the file; the engine refuses before the apply',
        },
      }
    )
  )
  write(
    'redact-drawing-mesh-pattern',
    onePage(
      `q /Pattern cs /P0 scn 125 125 150 50 re f Q\n${line(100, 50, 'KEEP-BETA')}`,
      (o) =>
        `/Pattern << /P0 << /PatternType 2 /Shading ${o.add(stream(MESH, meshData()))} 0 R >> >>`
    ),
    drawingRow(
      'A rectangle at x 125..275, y 125..175 filled with a shading pattern whose shading is the triangle mesh of redact-drawing-mesh; the region (x and y 110..190) covers its left end',
      {
        refused: {
          need: 'shown',
          kinds: ['shading'],
          why: 'the rectangle reaches past the mark, so the apply would cut it and leave the mesh it is filled with; the engine refuses before the apply',
        },
      }
    )
  )
}

/**
 * A blue rectangle painted through a soft mask whose luminosity group draws SECRET-ALPHA (black
 * on white) at (50, 150), under the region x 45..215, y 140..175. `rect` is the rectangle.
 */
function maskGroupPage(rect: string) {
  return onePage(
    `q /GS0 gs 0 0 1 rg ${rect} re f Q\n${line(100, 50, 'KEEP-BETA')}`,
    (o) => {
      const font = o.add(HELVETICA)
      const group = o.add(
        stream(
          `/Type /XObject /Subtype /Form /BBox [0 0 ${WIDTH} ${HEIGHT}] /Group << /S /Transparency /CS /DeviceGray >> /Resources << /Font << /F1 ${font} 0 R >> >>`,
          `1 g 0 0 ${WIDTH} ${HEIGHT} re f 0 g ${line(50, 150, 'SECRET-ALPHA')}`
        )
      )
      return `/ExtGState << /GS0 << /Type /ExtGState /SMask << /Type /Mask /S /Luminosity /G ${group} 0 R >> >> >>`
    }
  )
}

const UNDER_MASK: [number, number, number, number] = [45, 140, 215, 175]

function redactMaskGroups() {
  write(
    'redact-mask-group-past-mark',
    maskGroupPage('20 130 360 60'),
    textRow(
      'A blue band at x 20..380, y 130..190 painted through a soft mask whose group draws SECRET-ALPHA at (50, 150); the region (x 45..215, y 140..175) covers the word and not the whole band',
      {
        regions: [region(0, UNDER_MASK)],
        placed: [
          {
            what: "SECRET-ALPHA in the soft mask's group, placed by the identity matrix at (50, 150)",
            box: [50, 146, 204, 165],
          },
        ],
        refused: {
          need: 'shown',
          kinds: ['mask-group'],
          why: "the band reaches past the mark, so the apply would cut a hole in it and leave the mask's group, which draws the text where the mark is; the engine refuses before the apply",
        },
      }
    )
  )
  write(
    'redact-mask-group-under-mark',
    maskGroupPage('60 145 120 25'),
    textRow(
      'A blue rectangle at x 60..180, y 145..170 painted through a soft mask whose group draws SECRET-ALPHA at (50, 150); the region (x 45..215, y 140..175) covers the rectangle',
      {
        regions: [region(0, UNDER_MASK)],
        placed: [
          {
            what: "SECRET-ALPHA in the soft mask's group, placed by the identity matrix at (50, 150)",
            box: [50, 146, 204, 165],
          },
        ],
        refused: {
          need: 'covered',
          kinds: ['mask-group'],
          why: 'the shape lies wholly inside the mark, so the apply would remove it; the engine refuses all the same, because it cannot show that nothing else keeps the mask group in the file',
        },
      }
    )
  )
}

function redactTextFade() {
  write(
    'redact-text-fade',
    onePage(
      `q /GS0 gs ${line(50, 200, 'SECRET-ALPHA')}Q\n${line(300, 200, 'KEEP-BETA')}`,
      (o) => {
        const group = o.add(
          stream(
            `/Type /XObject /Subtype /Form /BBox [0 0 ${WIDTH} ${HEIGHT}] /Group << /S /Transparency /CS /DeviceGray >> /Resources << /Shading << /Sh0 << /ShadingType 2 /ColorSpace /DeviceGray /Coords [40 0 220 0] /Function << /FunctionType 2 /Domain [0 1] /C0 [1] /C1 [0.3] /N 1 >> /Extend [true true] >> >> >>`,
            '/Sh0 sh'
          )
        )
        return `/ExtGState << /GS0 << /Type /ExtGState /SMask << /Type /Mask /S /Luminosity /G ${group} 0 R >> >> >>`
      }
    ),
    textRow(
      'SECRET-ALPHA under the region, faded by a soft mask whose group draws only an axial ramp (gradient transparency), and KEEP-BETA beside it unmasked: the mask holds no picture, so the apply runs and the text goes'
    )
  )
}

/** SECRET-ALPHA under the region, faded by a ramp clipped to a triangle: not a simple fade. */
function redactTextShapedFade() {
  write(
    'redact-text-shaped-fade',
    onePage(
      `q /GS0 gs ${line(50, 200, 'SECRET-ALPHA')}Q\n${line(300, 200, 'KEEP-BETA')}`,
      (o) => {
        const group = o.add(
          stream(
            `/Type /XObject /Subtype /Form /BBox [0 0 ${WIDTH} ${HEIGHT}] /Group << /S /Transparency /CS /DeviceGray >> /Resources << /Shading << /Sh0 << /ShadingType 2 /ColorSpace /DeviceGray /Coords [40 0 220 0] /Function << /FunctionType 2 /Domain [0 1] /C0 [1] /C1 [0.3] /N 1 >> /Extend [true true] >> >> >>`,
            '40 185 m 220 185 l 130 235 l h W n /Sh0 sh'
          )
        )
        return `/ExtGState << /GS0 << /Type /ExtGState /SMask << /Type /Mask /S /Luminosity /G ${group} 0 R >> >> >>`
      }
    ),
    textRow(
      'SECRET-ALPHA under the region, faded by a soft mask whose group draws an axial ramp clipped to a triangle (x 40..220, y 185..235), and KEEP-BETA beside it unmasked. The triangle is a shape, so the group is not a simple fade',
      {
        refused: {
          need: 'covered',
          kinds: ['mask-group'],
          why: 'the mask group draws a ramp clipped to a triangle, more than a simple fade; the text lies wholly inside the mark, so the apply would remove it with its mask, and the engine refuses because it cannot show that nothing else keeps the group in the file',
        },
      }
    )
  )
}

/** The page-sized cell of the pattern-gap rows: a magenta quadrilateral at x and y 130..170. */
const PAGE_CELL = `/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 ${WIDTH} ${HEIGHT}] /XStep ${WIDTH} /YStep ${HEIGHT} /Resources << >>`
const CELL_DRAWING = '1 0 1 rg 130 130 m 170 135 l 160 170 l 135 165 l h f'

/**
 * Two files that show why a pattern fill wholly inside a mark is refused. Without the refusal the
 * fork's smoke check shows what the apply would do: in the first, the later line still names the
 * pattern, so the cell stays in the saved file; in the second, the apply cuts the triangle's
 * mitred corner instead of removing it, so the pattern stays with the cut shape.
 */
function redactPatternGaps() {
  write(
    'redact-drawing-pattern-colour-kept',
    onePage(
      `/Pattern cs /P0 scn 120 120 60 60 re f\n0 0 1 RG 2 w 260 240 m 340 240 l S\n0 g ${line(100, 50, 'KEEP-BETA')}`,
      (o) => `/Pattern << /P0 ${o.add(stream(PAGE_CELL, CELL_DRAWING))} 0 R >>`
    ),
    drawingRow(
      "A square at x and y 120..180, wholly inside the region (x and y 110..190), filled with a tiling pattern of one page-sized cell that draws a magenta quadrilateral at x and y 130..170. With no q/Q around it, a blue stroke-only line at y 240 follows, whose fill colour is still the pattern; the fill colour is then set to black for KEEP-BETA, so the line is the only later object that carries the pattern colour. The line paints none of the pattern, but its colour still names it, so an apply that removed the square would keep the cell in the saved file (as the fork's smoke check shows)",
      {
        refused: {
          need: 'covered',
          kinds: ['pattern'],
          why: "the square lies wholly inside the mark, so the apply would remove it, and the engine refuses because it cannot show that nothing else keeps the pattern in the file: here a later line's fill colour still names it, which would keep the cell in the saved file",
        },
      }
    )
  )
  write(
    'redact-drawing-pattern-miter',
    onePage(
      `/Pattern CS /P0 SCN 10 w 0 j 130 130 m 170 130 l 150 185 l h S\n${line(100, 50, 'KEEP-BETA')}`,
      (o) => `/Pattern << /P0 ${o.add(stream(PAGE_CELL, CELL_DRAWING))} 0 R >>`
    ),
    drawingRow(
      "A closed triangle (130, 130), (170, 130), (150, 185) stroked 10 pt wide with mitred joins in a tiling pattern of one page-sized cell that draws a magenta quadrilateral at x and y 130..170. The region (x 115..185, y 115..195) holds the triangle's box grown by half the stroke width, but the top corner's miter reaches y 199.6, past it: an apply would cut the stroke there instead of removing it, and the pattern would stay with the cut shape (as the fork's smoke check shows)",
      {
        regions: [region(0, [115, 115, 185, 195])],
        refused: {
          need: 'covered',
          kinds: ['pattern'],
          why: "the triangle's stroke box lies wholly inside the mark, so the engine takes it as covered and cannot show that nothing keeps the pattern in the file: here the mitred corner reaches past the mark, so the apply would cut the stroke and keep the pattern",
        },
      }
    )
  )
}

function redactTextBesideCarriers() {
  write(
    'redact-text-beside-carriers',
    onePage(
      [
        SECRET_LINE,
        // A small swatch of a 10 pt hatch, a band of a large-cell texture, and a masked square.
        'q /Pattern cs /P0 scn 330 40 40 40 re f Q',
        'q /Pattern cs /P1 scn 20 20 280 40 re f Q',
        'q /GS0 gs 0 0 1 rg 250 100 60 60 re f Q',
      ].join('\n'),
      (o) => {
        const font = o.add(HELVETICA)
        const swatch = o.add(
          stream(
            '/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 10 10] /XStep 10 /YStep 10 /Resources << >>',
            '1 0 1 RG 1 w 0 0 m 10 10 l S'
          )
        )
        const texture = o.add(
          stream(
            `/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 ${WIDTH} ${HEIGHT}] /XStep ${WIDTH} /YStep ${HEIGHT} /Resources << >>`,
            '0 0.6 0 rg 40 25 m 120 30 l 100 55 l h f'
          )
        )
        const group = o.add(
          stream(
            `/Type /XObject /Subtype /Form /BBox [0 0 ${WIDTH} ${HEIGHT}] /Group << /S /Transparency /CS /DeviceGray >> /Resources << /Font << /F1 ${font} 0 R >> >>`,
            `1 g 0 0 ${WIDTH} ${HEIGHT} re f 0 g BT /F1 12 Tf 255 125 Td (MASKED) Tj ET`
          )
        )
        return `/Pattern << /P0 ${swatch} 0 R /P1 ${texture} 0 R >> /ExtGState << /GS0 << /Type /ExtGState /SMask << /Type /Mask /S /Luminosity /G ${group} 0 R >> >> >>`
      }
    ),
    textRow(
      'redact-text on a page that also has a hatch swatch (x 330..370, y 40..80), a band of a large-cell texture (x 20..300, y 20..60) and a square under a soft mask whose group holds text (x 250..310, y 100..160), none of them under the region: the apply runs'
    )
  )
}

function redactUnderMark() {
  write(
    'redact-image-under-mark',
    imagePage(
      (o) => o.add(stream(COLOUR_IMAGE, colourPixels())),
      'q 60 0 0 30 120 135 cm /Im0 Do Q'
    ),
    imageRow(
      'The colour pattern of redact-image-shared drawn small, over x 120..180, y 135..165, wholly under the region (x and y 110..190): the apply leaves no image in the file',
      { regions: [region(0, [110, 110, 190, 190])] }
    )
  )
  write(
    'redact-text-form-under-mark',
    onePage(`q 1 0 0 1 120 140 cm /Fm0 Do Q\n${line(100, 50, 'KEEP-BETA')}`, (o) => {
      const font = o.add(HELVETICA)
      const form = o.add(
        stream(
          `/Type /XObject /Subtype /Form /BBox [0 0 70 30] /Resources << /Font << /F1 ${font} 0 R >> >>`,
          'BT /F1 8 Tf 5 10 Td (SECRET-ALPHA) Tj ET'
        )
      )
      return `/XObject << /Fm0 ${form} 0 R >>`
    }),
    textRow(
      'A form at (120, 140) whose only content, SECRET-ALPHA in Helvetica 8, lies wholly under the region (x 110..195, y 110..190); KEEP-BETA in the page content',
      { regions: [region(0, [110, 110, 195, 190])] }
    )
  )
}

/** A redact-text page whose dictionary has `entries` and whose boxes are `boxes`. */
function textPage(entries: string, boxes = `/MediaBox [0 0 ${WIDTH} ${HEIGHT}]`) {
  const o = new Objects()
  const font = o.add(HELVETICA)
  const contents = o.add(stream('', SECRET_LINE))
  const pageObject = o.add(
    `<< /Type /Page /Parent 2 0 R ${boxes} /Contents ${contents} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> ${entries}>>`
  )
  return o.pdf([pageObject])
}

function redactPages() {
  for (const turn of [90, 270] as const)
    write(
      `redact-page-rotate-${turn}`,
      textPage(`/Rotate ${turn} `),
      textRow(`redact-text on a page with /Rotate ${turn}; the region is in user space`)
    )
  write(
    'redact-page-userunit',
    textPage('/UserUnit 2 '),
    textRow('redact-text on a page with /UserUnit 2')
  )
  const o = new Objects()
  const font = o.add(HELVETICA)
  const contents = o.add(
    stream('', line(150, 300, 'SECRET-ALPHA') + line(350, 300, 'KEEP-BETA'))
  )
  const cropped = o.add(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 500] /CropBox [100 100 500 400] /Contents ${contents} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`
  )
  write(
    'redact-page-cropbox',
    o.pdf([cropped]),
    textRow(
      'A 600 by 500 page cropped to x 100..500, y 100..400, with SECRET-ALPHA at (150, 300) under the region and KEEP-BETA at (350, 300)',
      { regions: [region(0, [145, 290, 315, 325])] }
    )
  )
  const n = new Objects()
  const nFont = n.add(HELVETICA)
  const appearance = n.add(
    stream(
      `/Type /XObject /Subtype /Form /BBox [0 0 150 40] /Resources << /Font << /F1 ${nFont} 0 R >> >>`,
      '0.9 g 0 0 150 40 re f 0 g BT /F1 12 Tf 6 14 Td (SECRET-STAMP) Tj ET'
    )
  )
  const pageNumber = n.reserve()
  const stamp = n.add(
    `<< /Type /Annot /Subtype /Stamp /Rect [60 180 210 220] /F 4 /NM <${hex('stamp')}> /AP << /N ${appearance} 0 R >> /P ${pageNumber} 0 R >>`
  )
  n.set(
    pageNumber,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] /Resources << >> /Annots [${stamp} 0 R] >>`
  )
  write('redact-page-no-contents', n.pdf([pageNumber]), {
    pages: 1,
    opens: true,
    describes:
      'A page with no /Contents and one stamp, at x 60..210, y 180..220, whose appearance draws SECRET-STAMP; the region (x 40..240, y 150..250) covers the stamp',
    annotations: { Stamp: 1 },
    placed: [{ what: "the stamp's appearance, SECRET-STAMP", box: [60, 180, 210, 220] }],
    secrets: ['SECRET', 'STAMP'],
    keeps: [],
    regions: [region(0, [40, 150, 240, 250])],
  })
}

/** An XMP packet whose xmp:Thumbnails holds `preview`, base64 as XMP stores it. */
const xmpWithPreview = (preview: string) =>
  [
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:xmpGImg="http://ns.adobe.com/xap/1.0/g/img/">',
    '<xmp:Thumbnails><rdf:Alt><rdf:li rdf:parseType="Resource"><xmpGImg:format>JPEG</xmpGImg:format>',
    `<xmpGImg:width>64</xmpGImg:width><xmpGImg:height>32</xmpGImg:height><xmpGImg:image>${preview}</xmpGImg:image>`,
    '</rdf:li></rdf:Alt></xmp:Thumbnails></rdf:Description></rdf:RDF></x:xmpmeta>',
    '<?xpacket end="w"?>',
  ].join('\n')

/** Three white samples, which come before the secret's samples in the thumbnail's data. */
const THUMB_WHITE = '\xff\xff\xff'

/**
 * redact-text's page at a tenth of its size, 40 by 30 grey samples: white, except on row 10 (the
 * line at y 200), where SECRET-ALPHA (x 50..203) is drawn from sample 5 and KEEP-BETA (x 300..412)
 * from sample 30, each by the bytes of its letters: greys dark enough to read as text.
 */
function thumbnail(): Buffer {
  const samples = Buffer.alloc(40 * 30, 0xff)
  samples.write('SECRET-ALPHA', 10 * 40 + 5, 'latin1')
  samples.write('KEEP-BETA', 10 * 40 + 30, 'latin1')
  return samples
}

function redactCopies() {
  write(
    'redact-copy-thumbnail',
    (() => {
      const o = new Objects()
      const font = o.add(HELVETICA)
      const contents = o.add(stream('', SECRET_LINE))
      const thumb = o.add(
        stream(
          '/Width 40 /Height 30 /ColorSpace /DeviceGray /BitsPerComponent 8',
          thumbnail()
        )
      )
      // An image nothing refers to, for the image reader's own test.
      o.add(stream(COLOUR_IMAGE, colourPixels()))
      const pageObject = o.add(
        plainPage(contents, `/Font << /F1 ${font} 0 R >>`, `/Thumb ${thumb} 0 R `)
      )
      return o.pdf([pageObject])
    })(),
    textRow(
      'redact-text whose page has a /Thumb image of it at a tenth of its size: on the row of the line, the samples where each word lies are the bytes of the word, on white. The file also holds an image XObject that nothing refers to',
      { gone: ['/Thumb', `${THUMB_WHITE}SECRET-ALPHA`] }
    )
  )
  write(
    'redact-copy-pieceinfo',
    textPage(
      `/PieceInfo << /InkbarFixtures << /LastModified <${hex('D:20261118000000Z')}> /Private <${hex('SECRET-OMEGA')}> >> >> /LastModified <${hex('D:20261118000000Z')}> `
    ),
    textRow(
      'redact-text whose page has /PieceInfo, private application data holding SECRET-OMEGA',
      { secrets: ['SECRET', 'ALPHA', 'OMEGA'], gone: ['/PieceInfo'] }
    )
  )
  const preview = sample('pattern.jpg').toString('base64')
  write(
    'redact-copy-xmp',
    (() => {
      const o = new Objects()
      const font = o.add(HELVETICA)
      const contents = o.add(stream('', SECRET_LINE))
      const xmp = (who: string) =>
        o.add(stream('/Type /Metadata /Subtype /XML', xmpWithPreview(`${who}${preview}`)))
      const pageObject = o.add(
        plainPage(contents, `/Font << /F1 ${font} 0 R >>`, `/Metadata ${xmp('')} 0 R `)
      )
      return o.pdf([pageObject], `/Metadata ${xmp('')} 0 R `)
    })(),
    textRow(
      'redact-text with XMP metadata on the catalog and on the page, each holding a JPEG preview in xmp:Thumbnails',
      { gone: ['xmp:Thumbnails', 'xmpGImg', preview.slice(0, 40)] }
    )
  )
}

/** A five-pointed star around (cx, cy), `outer` to its points and `inner` to its notches. */
function starPath(cx: number, cy: number, outer: number, inner: number): string {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? outer : inner
    const angle = Math.PI / 2 + (i * Math.PI) / 5
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)].map(
      (n) => Math.round(n * 100) / 100
    )
  })
  return `${points.map(([x, y], i) => `${x} ${y} ${i === 0 ? 'm' : 'l'}`).join(' ')} h`
}

/**
 * The page of the loupe drawing rows: a pink star (0.9 0.1 0.6) wholly inside the region (x and
 * y 110..190), a blue square at x 260..320, y 120..180, and KEEP-BETA at (100, 50).
 */
const STAR_PAGE = `0.9 0.1 0.6 rg ${starPath(150, 150, 30, 12)} f\n${BLUE_SQUARE}\n${line(100, 50, 'KEEP-BETA')}`

/**
 * A page drawing STAR_PAGE, with a locked loupe: a stamp at x 220..310, y 200..290 whose appearance
 * draws a copy of the page (tagged /INKB_PageCopy, its content written before any apply) through
 * `lens`, a matrix from the page to the 90 by 90 lens.
 */
function lockedLoupePage(lens: string) {
  const o = new Objects()
  const font = o.add(HELVETICA)
  const contents = o.add(stream('', STAR_PAGE))
  const copy = o.add(
    stream(
      `/Type /XObject /Subtype /Form /BBox [0 0 ${WIDTH} ${HEIGHT}] /INKB_PageCopy true /Resources << /Font << /F1 ${font} 0 R >> >>`,
      STAR_PAGE
    )
  )
  const appearance = o.add(
    stream(
      `/Type /XObject /Subtype /Form /BBox [0 0 90 90] /Resources << /XObject << /Pg ${copy} 0 R >> >>`,
      `q 0 0 90 90 re W n ${lens} cm /Pg Do Q 0 0 1 RG 2 w 1 1 88 88 re S`
    )
  )
  const pageNumber = o.reserve()
  const loupe = o.add(
    `<< /Type /Annot /Subtype /Stamp /Rect [220 200 310 290] /F 4 /NM <${hex('loupe')}> /AP << /N ${appearance} 0 R >> /P ${pageNumber} 0 R >>`
  )
  o.set(
    pageNumber,
    plainPage(contents, `/Font << /F1 ${font} 0 R >>`, `/Annots [${loupe} 0 R] `)
  )
  return o.pdf([pageNumber])
}

function redactLoupeDrawing() {
  write(
    'redact-annotation-loupe-drawing',
    lockedLoupePage('1.125 0 0 1.125 -123.75 -123.75'),
    drawingRow(
      'A pink star wholly inside the region (x and y 110..190), a blue square beside it, and a locked loupe (a stamp at x 220..310, y 200..290) whose lens shows the region at 1.125 times its size from a copy of the page made before any apply',
      {
        annotations: { Stamp: 1 },
        refused: {
          need: 'shown',
          why: 'the loupe stays locked, so its copy of the page, made before the apply, still holds the star; the strict check after the apply reads the copy',
        },
      }
    )
  )
  write(
    'redact-annotation-loupe-elsewhere',
    lockedLoupePage('1 0 0 1 -200 -15'),
    drawingRow(
      'As redact-annotation-loupe-drawing, with the lens showing page x 200..290, y 15..105 at its own size: clear of the region (x and y 110..190) and of the star (about x 121..179, y 126..180). The copy holds the whole page, the star included, whatever part the lens shows',
      {
        annotations: { Stamp: 1 },
        refused: {
          need: 'shown',
          why: 'the loupe stays locked, so its copy of the page, made before the apply, still holds the star, though the lens shows neither the star nor the region; the strict check after the apply reads the whole copy',
        },
      }
    )
  )
  write(
    'redact-annotation-loupe-rewritten',
    onePage(STAR_PAGE),
    drawingRow(
      'The page of redact-annotation-loupe-drawing with no loupe in the file: the loupe test passes a loupe in `annotations`, so its copy of the page is taken after the apply'
    )
  )
}

/** The star with a negative line width, and a black square beside it. */
function redactStrokeBoxes() {
  write(
    'redact-drawing-negative-width',
    onePage(
      `0 g -4 w ${starPath(150, 150, 30, 12)} f\n0 g 260 120 60 60 re f\n${line(100, 50, 'KEEP-BETA')}`
    ),
    drawingRow(
      'A black star with a line width of -4, filled, wholly inside the region (x and y 110..190), and a black square at x 260..320, y 120..180 beside it'
    )
  )
  write(
    'redact-drawing-miter-reach',
    onePage(
      `0 G 6 w 0 j 195 150 m 260 140 l 260 160 l h S\n0 g 260 40 40 40 re f\n${line(100, 50, 'KEEP-BETA')}`
    ),
    drawingRow(
      'A black closed triangle (195, 150), (260, 140), (260, 160) stroked 6 pt wide with mitred joins, and a black square at x 260..300, y 40..80. Its points and its stroke box (x 192..263) lie beside the region (x and y 110..190), but the corner at (195, 150), 17.5 degrees wide, has a miter 6.6 times the line width, whose tip reaches x 175.3, under the region'
    )
  )
}

function redactAnnotationLoupe() {
  const o = new Objects()
  const font = o.add(HELVETICA)
  const contents = o.add(stream('', SECRET_LINE))
  // The page as a form, as INK_Appearance_AddPage copies it for a loupe.
  const copy = o.add(
    stream(
      `/Type /XObject /Subtype /Form /BBox [0 0 ${WIDTH} ${HEIGHT}] /INKB_PageCopy true /Resources << /Font << /F1 ${font} 0 R >> >>`,
      SECRET_LINE
    )
  )
  // Shows x 40..120, y 180..240 of the page at twice its size.
  const appearance = o.add(
    stream(
      `/Type /XObject /Subtype /Form /BBox [0 0 160 120] /Resources << /XObject << /Pg ${copy} 0 R >> >>`,
      'q 0 0 160 120 re W n 2 0 0 2 -80 -360 cm /Pg Do Q 0 0 1 RG 2 w 1 1 158 118 re S'
    )
  )
  const pageNumber = o.reserve()
  const loupe = o.add(
    `<< /Type /Annot /Subtype /Square /Rect [220 40 380 160] /F 4 /NM <${hex('loupe')}> /C [0 0 1] /AP << /N ${appearance} 0 R >> /P ${pageNumber} 0 R >>`
  )
  o.set(
    pageNumber,
    plainPage(contents, `/Font << /F1 ${font} 0 R >>`, `/Annots [${loupe} 0 R] `)
  )
  write(
    'redact-annotation-loupe',
    o.pdf([pageNumber]),
    textRow(
      'redact-text with a loupe beside the region: a square annotation at x 220..380, y 40..160 whose appearance draws a copy of the page (tagged /INKB_PageCopy) at twice its size, centred on the start of SECRET-ALPHA',
      {
        annotations: { Square: 1 },
        refused: {
          need: 'shown',
          why: "the loupe's appearance holds a copy of the page as it was, which the apply does not change, and the strict check after the apply reads it; Inkbar writes its own loupes again after the apply",
        },
      }
    )
  )
}

/**
 * Encrypts `plain` into fixture `name` with qpdf (AES-128, user and owner password "inkbar"),
 * keeping objects nothing refers to. qpdf
 * writes random salts and an /ID on every run, so an existing fixture that decrypts to the same
 * content is kept.
 */
function writeEncrypted(
  name: FixtureName,
  plain: Buffer,
  meta: Omit<FixtureMeta, 'file'>
) {
  const target = join(out, `${name}.pdf`)
  const plainFile = join(out, `${name}.plain.pdf`)
  const fresh = join(out, `${name}.new.pdf`)
  const decrypted = (file: string) =>
    execFileSync(
      'qpdf',
      [
        '--password=inkbar',
        '--decrypt',
        '--stream-data=uncompress',
        '--preserve-unreferenced',
        file,
        '-',
      ],
      {
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    )
      .toString('latin1')
      .replace(/\/ID \[<[0-9a-f]*><[0-9a-f]*>\]/, '')
      // The old encryption dictionary, kept as an object nothing refers to, has a /U that
      // depends on the random /ID.
      .replace(/\/U <[0-9a-f]*>/, '')
  try {
    writeFileSync(plainFile, plain)
    execFileSync('qpdf', [
      '--preserve-unreferenced',
      '--encrypt',
      'inkbar',
      'inkbar',
      '128',
      '--use-aes=y',
      '--',
      plainFile,
      fresh,
    ])
    let same = false
    try {
      same = decrypted(target) === decrypted(fresh)
    } catch {
      // No fixture yet, or one that does not open: replace it.
    }
    if (!same) renameSync(fresh, target)
  } finally {
    rmSync(plainFile, { force: true })
    rmSync(fresh, { force: true })
  }
  entries[name] = { file: `${name}.pdf`, ...meta }
}

function redactFiles() {
  writeEncrypted(
    'redact-file-encrypted',
    // An object nothing refers to: an earlier page content an editor left behind.
    onePage(SECRET_LINE, (o) => {
      o.add(stream('', line(50, 100, 'ORPHAN-OMEGA')))
      return ''
    }),
    textRow(
      'redact-text encrypted with AES-128; the user password is "inkbar". It also holds a content stream nothing refers to, drawing ORPHAN-OMEGA',
      { password: 'inkbar', secrets: ['SECRET', 'ALPHA', 'ORPHAN', 'OMEGA'] }
    )
  )

  const [l, b, r, t] = OVER_WORD
  const m = new Objects()
  const mFont = m.add(HELVETICA)
  const mContents = m.add(stream('', line(50, 200, 'SECRET-GAMMA')))
  const mPage = m.reserve()
  const mark = m.add(
    `<< /Type /Annot /Subtype /Redact /Rect [${l} ${b} ${r} ${t}] /QuadPoints [${l} ${t} ${r} ${t} ${l} ${b} ${r} ${b}] /IC [0 0 0] /F 4 /NM (other-mark) /T (Another program) /P ${mPage} 0 R >>`
  )
  m.set(
    mPage,
    plainPage(mContents, `/Font << /F1 ${mFont} 0 R >>`, `/Annots [${mark} 0 R] `)
  )
  writeEncrypted('redact-foreign-encrypted', m.pdf([mPage]), {
    pages: 1,
    opens: true,
    password: 'inkbar',
    describes:
      'The second page of redact-foreign-mark as a one-page file, encrypted with AES-128; the user password is "inkbar". SECRET-GAMMA lies under an unapplied Redact annotation from another program',
    annotations: { Redact: 1 },
    secrets: [],
    keeps: ['SECRET-GAMMA'],
  })

  const s = new Objects()
  const sFont = s.add(HELVETICA)
  const sContents = s.add(stream('', SECRET_LINE))
  const sPage = s.reserve()
  const signature = s.add(
    `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 1000 9000 1000] /Contents <${'0'.repeat(512)}> /M <${hex('D:20261118000000Z')}> >>`
  )
  const field = s.add(
    `<< /Type /Annot /Subtype /Widget /FT /Sig /T <${hex('sig')}> /V ${signature} 0 R /Rect [300 40 380 80] /F 4 /P ${sPage} 0 R >>`
  )
  s.set(
    sPage,
    plainPage(sContents, `/Font << /F1 ${sFont} 0 R >>`, `/Annots [${field} 0 R] `)
  )
  write(
    'redact-file-signed',
    s.pdf([sPage], `/AcroForm << /Fields [${field} 0 R] /SigFlags 3 >> `),
    textRow(
      'redact-text with a signature field (widget at x 300..380, y 40..80) holding a signature dictionary whose /Contents is zeros: it looks signed and verifies against nothing',
      { annotations: { Widget: 1 } }
    )
  )

  const original = onePage(line(50, 200, 'SECRET-ZETA') + line(300, 200, 'KEEP-BETA'))
  const previous = /startxref\n(\d+)\n%%EOF\n$/.exec(original.toString('latin1'))?.[1]
  if (previous === undefined) throw new Error('no startxref in the first revision')
  // onePage writes the font as object 3, the content as 4 and the page as 5.
  const contentObject = Buffer.concat([
    Buffer.from('4 0 obj\n'),
    stream('', SECRET_LINE),
    Buffer.from('\nendobj\n'),
  ])
  const xrefAt = original.length + contentObject.length
  write(
    'redact-file-revisions',
    Buffer.concat([
      original,
      contentObject,
      Buffer.from(
        `xref\n0 1\n0000000000 65535 f \n4 1\n${String(original.length).padStart(10, '0')} 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R /Prev ${previous} >>\nstartxref\n${xrefAt}\n%%EOF\n`,
        'latin1'
      ),
    ]),
    textRow(
      'Two revisions: the first draws SECRET-ZETA and KEEP-BETA, the appended second draws SECRET-ALPHA under the region and KEEP-BETA; the first content stream stays in the bytes',
      { secrets: ['SECRET', 'ALPHA', 'ZETA'] }
    )
  )

  write(
    'redact-file-hidden-layer',
    onePage(
      `${SECRET_LINE}/OC /L0 BDC\n${line(50, 170, 'HIDDEN-OMEGA')}EMC\n`,
      (o) =>
        `/Properties << /L0 ${o.add('<< /Type /OCG /Name (Hidden layer) >>')} 0 R >>`,
      // onePage writes the font as object 3 and the layer as 4.
      { catalog: '/OCProperties << /OCGs [4 0 R] /D << /OFF [4 0 R] >> >> ' }
    ),
    textRow(
      'redact-text plus HIDDEN-OMEGA at (50, 170) in a layer the default configuration hides; the region (x 45..215, y 160..225) covers both',
      {
        secrets: ['SECRET', 'ALPHA', 'HIDDEN', 'OMEGA'],
        regions: [region(0, [45, 160, 215, 225])],
      }
    )
  )

  const a = new Objects()
  const aFont = a.add(HELVETICA)
  const aContents = a.add(stream('', SECRET_LINE))
  const embedded = (text: string) =>
    a.add(stream('/Type /EmbeddedFile /Subtype /text#2Fplain', text))
  const fileSpec = (name: string, text: string) =>
    a.add(
      `<< /Type /Filespec /F <${hex(name)}> /UF <${hex(name)}> /EF << /F ${embedded(text)} 0 R >> >>`
    )
  const named = fileSpec('notes.txt', 'SECRET-OMEGA')
  const attached = fileSpec('more.txt', 'SECRET-SIGMA')
  const aPage = a.reserve()
  const attachment = a.add(
    `<< /Type /Annot /Subtype /FileAttachment /Rect [340 40 360 60] /F 4 /Name /Paperclip /FS ${attached} 0 R /P ${aPage} 0 R >>`
  )
  a.set(
    aPage,
    plainPage(aContents, `/Font << /F1 ${aFont} 0 R >>`, `/Annots [${attachment} 0 R] `)
  )
  write(
    'redact-file-attachment',
    a.pdf(
      [aPage],
      `/Names << /EmbeddedFiles << /Names [<${hex('notes.txt')}> ${named} 0 R] >> >> `
    ),
    textRow(
      'redact-text with an attached file holding SECRET-OMEGA in /EmbeddedFiles and a file attachment annotation (x 340..360, y 40..60) holding SECRET-SIGMA',
      {
        annotations: { FileAttachment: 1 },
        secrets: ['SECRET', 'ALPHA', 'OMEGA', 'SIGMA'],
        gone: ['/EmbeddedFiles', '/EmbeddedFile', '/EF'],
      }
    )
  )

  write(
    'redact-file-script',
    (() => {
      const o = new Objects()
      const font = o.add(HELVETICA)
      const contents = o.add(stream('', SECRET_LINE))
      const script = (text: string) => o.add(`<< /S /JavaScript /JS <${hex(text)}> >>`)
      const named = script('app.alert("SECRET-OMEGA");')
      const opening = script('app.alert("SECRET-SIGMA");')
      const onPageOpen = script('app.alert("SECRET-KAPPA");')
      const pageObject = o.add(
        plainPage(
          contents,
          `/Font << /F1 ${font} 0 R >>`,
          `/AA << /O ${onPageOpen} 0 R >> `
        )
      )
      return o.pdf(
        [pageObject],
        `/Names << /JavaScript << /Names [<${hex('hello')}> ${named} 0 R] >> >> /OpenAction ${opening} 0 R `
      )
    })(),
    textRow(
      "redact-text with scripts holding SECRET-OMEGA in /Names /JavaScript, SECRET-SIGMA in the /OpenAction and SECRET-KAPPA in the page's /AA",
      {
        secrets: ['SECRET', 'ALPHA', 'OMEGA', 'SIGMA', 'KAPPA'],
        gone: ['/JavaScript', '/JS'],
      }
    )
  )
}

redactText()
redactImageFlate()
redactPath()
redactAnnotations()
redactForeignMark()
redactForeignPopup()
redactHiddenLayer()
checkImage()
checkFormText()
checkInlineImage()
checkPatternText()
badBlackBox()
badUnapplied()
badAppended()
redactTextComposite()
redactTextType3()
redactTextNestedForm()
redactTextSharedForm()
redactTextClip()
redactTextPattern()
redactTextRotated()
redactTextVertical()
redactTextHalfWord()
redactImageEncoded()
redactImageMasks()
redactImagePlacements()
redactDrawing()
redactMaskGroups()
redactTextFade()
redactTextShapedFade()
redactPatternGaps()
redactTextBesideCarriers()
redactUnderMark()
redactPages()
redactCopies()
redactAnnotationLoupe()
redactLoupeDrawing()
redactStrokeBoxes()
redactFiles()

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
  string,
  FixtureMeta
>
writeFileSync(
  manifestPath,
  await format(JSON.stringify({ ...manifest, ...entries }, null, 2), {
    ...(await resolveConfig(manifestPath)),
    filepath: manifestPath,
  })
)
console.log(`wrote ${Object.keys(entries).length} redaction fixtures`)
