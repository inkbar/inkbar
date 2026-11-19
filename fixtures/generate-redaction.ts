/*
 * Writes the fixtures for applying redactions into pdf/, and their entries into manifest.json,
 * keeping every other entry. Each file is written byte by byte, so running it again writes the
 * same bytes. Every content stream is Flate-compressed, so a test that looks for a secret in the
 * raw bytes must inflate them first.
 *
 *   pnpm --filter @inkbar/fixtures exec tsx generate-redaction.ts
 *
 * Each entry records `secrets` (words under a region that must be gone after the apply), `keeps`
 * (page text beside the regions that must survive) and `regions` (where to put the marks).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

import { format, resolveConfig } from 'prettier'

import type { FixtureMeta, RedactionRegion } from './index'
import type { FixtureName } from './urls'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'pdf')
const manifestPath = join(here, 'manifest.json')

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
 * widget of field "hidden" holding SECRET-FIELD, and a note saying SECRET-NOTE with a pop-up
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
      `<< /Type /Annot /Subtype /Widget /FT /Tx /T (hidden) /V <${hex('SECRET-FIELD')}> /DA (/F1 10 Tf 0 g) /Rect [130 160 230 185] /F 4 /AP << /N 12 0 R >> /P 3 0 R >>`,
      `<< /Type /Annot /Subtype /Widget /FT /Tx /T (kept) /V <${hex('KEEP-FIELD')}> /DA (/F1 10 Tf 0 g) /Rect [260 60 360 85] /F 4 /AP << /N 13 0 R >> /P 3 0 R >>`,
      `<< /Type /Annot /Subtype /Text /Rect [60 215 80 235] /F 4 /NM (note) /Name /Comment /Contents <${hex('SECRET-NOTE')}> /Popup 11 0 R /P 3 0 R >>`,
      '<< /Type /Annot /Subtype /Popup /Rect [260 200 380 260] /Parent 10 0 R /Open false >>',
      appearance(100, 25, 'SECRET-FIELD'),
      appearance(100, 25, 'KEEP-FIELD'),
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'Under the region (x 40..240, y 150..250) a stamp drawing SECRET-STAMP, the widget of text field "hidden" holding SECRET-FIELD, and a note saying SECRET-NOTE whose pop-up lies outside it; text field "kept" has its widget below the region',
      annotations: { Stamp: 1, Widget: 2, Text: 1, Popup: 1 },
      secrets: ['SECRET-STAMP', 'SECRET-FIELD', 'SECRET-NOTE'],
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
      keeps: ['KEEP-BETA'],
      regions: [region(0, OVER_WORD)],
    }
  )
}

redactText()
redactImageFlate()
redactPath()
redactAnnotations()
redactForeignMark()
redactHiddenLayer()

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
