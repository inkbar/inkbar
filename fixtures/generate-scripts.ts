/*
 * Writes the fixtures for text that does not run left to right in horizontal lines into pdf/, and
 * their entries into manifest.json, keeping every other entry. Each file is written byte by byte
 * (no timestamp, no random id, no compression), so running it again writes the same bytes.
 *
 *   pnpm --filter @inkbar/fixtures generate:scripts
 *
 * `text-rtl` embeds Noto Sans Hebrew (fonts/NotoSansHebrew-Regular.ttf, see fonts/README.md) and
 * `text-vertical` embeds the Ahem subset the redaction fixtures use (redaction-samples/).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { format, resolveConfig } from 'prettier'

import { here, manifestPath, out } from './generate-paths'

import type { FixtureMeta } from './index'
import type { FixtureName } from './urls'

/** A PDF of `bodies`, object n at bodies[n - 1], object 1 the catalog and `info` the info dict. */
function buildPdf(bodies: (string | Buffer)[], info: number): Buffer {
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
    `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${length}\n%%EOF\n`
  )
  parts.push(Buffer.from(xref.join('')))
  return Buffer.concat(parts)
}

/** A stream object stored as `data`, with `dict` entries. */
function stream(dict: string, data: string | Buffer): Buffer {
  const body = typeof data === 'string' ? Buffer.from(data, 'latin1') : data
  return Buffer.concat([
    Buffer.from(`<< ${dict} /Length ${body.length} >>\nstream\n`),
    body,
    Buffer.from('\nendstream'),
  ])
}

const HELVETICA =
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'

/** Two-byte codes as one hex string. */
const codes = (list: number[]) =>
  `<${list.map((c) => c.toString(16).padStart(4, '0')).join('')}>`

/** A ToUnicode CMap sending each code in `map` to its character. */
function toUnicode(map: [number, string][]): string {
  const hex4 = (n: number) => n.toString(16).padStart(4, '0')
  return [
    '/CIDInit /ProcSet findresource begin 12 dict begin begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def /CMapType 2 def',
    '1 begincodespacerange <0000> <FFFF> endcodespacerange',
    `${map.length} beginbfchar`,
    ...map.map(
      ([code, char]) => `<${hex4(code)}> <${hex4(char.codePointAt(0) as number)}>`
    ),
    'endbfchar',
    'endcmap CMapName currentdict /CMap defineresource pop end end',
  ].join('\n')
}

const entries: Partial<Record<FixtureName, FixtureMeta>> = {}

function write(name: FixtureName, bytes: Buffer, meta: Omit<FixtureMeta, 'file'>) {
  writeFileSync(join(out, `${name}.pdf`), bytes)
  entries[name] = { file: `${name}.pdf`, ...meta }
}

const page = (fonts: string) =>
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << ${fonts} >> >> >>`

const INFO = '<< /Title (Script fixture) /Producer (Inkbar fixtures) >>'

/*
 * Noto Sans Hebrew Regular, unhinted: its glyph numbers and advance widths (1000 units an em) for
 * the letters the page needs and the space. The font has no Latin letters or digits, so those
 * lines are Helvetica.
 */
const HEBREW: Record<string, [gid: number, width: number]> = {
  ש: [96, 730],
  ל: [55, 522],
  ו: [124, 301],
  ם: [23, 684],
  ע: [10, 593],
  ' ': [106, 270],
}

function writeRtl() {
  const file = readFileSync(join(here, 'fonts', 'NotoSansHebrew-Regular.ttf'))
  /** The glyph codes of Hebrew `text` given in reading order, drawn in visual order. */
  const visual = (text: string) =>
    codes([...text].reverse().map((c) => (HEBREW[c] as [number, number])[0]))
  const widths = Object.values(HEBREW)
    .map(([gid, width]) => `${gid} [${width}]`)
    .join(' ')
  const contents =
    `BT /F2 32 Tf 72 740 Td ${visual('שלום עולם')} Tj ET\n` +
    `BT /F1 32 Tf 72 660 Td (abc ) Tj /F2 32 Tf ${visual('שלום')} Tj /F1 32 Tf ( 123) Tj ET\n` +
    'BT /F1 32 Tf 72 580 Td (Latin line in Helvetica) Tj ET\n'
  write(
    'text-rtl',
    buildPdf(
      [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        page('/F1 5 0 R /F2 6 0 R'),
        stream('', contents),
        HELVETICA,
        '<< /Type /Font /Subtype /Type0 /BaseFont /NotoSansHebrew-Regular /Encoding /Identity-H /DescendantFonts [7 0 R] /ToUnicode 10 0 R >>',
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /NotoSansHebrew-Regular /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 8 0 R /DW 1000 /W [${widths}] /CIDToGIDMap /Identity >>`,
        '<< /Type /FontDescriptor /FontName /NotoSansHebrew-Regular /Flags 4 /FontBBox [-210 -292 814 1068] /ItalicAngle 0 /Ascent 1068 /Descent -292 /CapHeight 714 /StemV 80 /FontFile2 9 0 R >>',
        stream(`/Length1 ${file.length}`, file),
        stream('', toUnicode(Object.entries(HEBREW).map(([char, [gid]]) => [gid, char]))),
        INFO,
      ],
      11
    ),
    {
      pages: 1,
      opens: true,
      describes:
        'A4 page, three lines at 32 pt. A Hebrew line (שלום עולם) in embedded Noto Sans Hebrew Regular (Type 0, Identity-H, a ToUnicode CMap), a mixed line (abc שלום 123) with abc and 123 in Helvetica and the Hebrew word in Noto Sans Hebrew, and a Latin line in Helvetica. The Hebrew glyphs are written in visual order, the last letter first, as a producer lays out a right-to-left line, so the codes run opposite to reading order',
    }
  )
}

// The Japanese column: each character has a code (a CID) of its own, and every code draws the
// same square glyph of the Ahem subset the redaction fixtures use (glyph 35, the letter A, a square
// one em wide), so the page is drawn without a Japanese font while its text is Japanese.
const COLUMN = '日本語のテキスト'

function writeVertical() {
  const file = readFileSync(join(here, 'redaction-samples', 'ahem-subset.ttf'))
  const characters = [...COLUMN]
  const map = Buffer.alloc((characters.length + 1) * 2)
  characters.forEach((_, i) => map.writeUInt16BE(35, (i + 1) * 2))
  const contents =
    `BT /F2 28 Tf 400 760 Td ${codes(characters.map((_, i) => i + 1))} Tj ET\n` +
    'BT /F1 20 Tf 72 700 Td (Horizontal line beside the column) Tj ET\n'
  write(
    'text-vertical',
    buildPdf(
      [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        page('/F1 5 0 R /F2 6 0 R'),
        stream('', contents),
        HELVETICA,
        '<< /Type /Font /Subtype /Type0 /BaseFont /Ahem /Encoding /Identity-V /DescendantFonts [7 0 R] /ToUnicode 11 0 R >>',
        '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Ahem /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 8 0 R /DW 1000 /CIDToGIDMap 10 0 R >>',
        '<< /Type /FontDescriptor /FontName /Ahem /Flags 4 /FontBBox [0 -200 1000 800] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 800 /StemV 80 /FontFile2 9 0 R >>',
        stream(`/Length1 ${file.length}`, file),
        stream('', map),
        stream(
          '',
          toUnicode(characters.map((char, i): [number, string] => [i + 1, char]))
        ),
        INFO,
      ],
      12
    ),
    {
      pages: 1,
      opens: true,
      describes:
        'A4 page: a column of Japanese (日本語のテキスト) written top to bottom at 28 pt from x 400, y 760, in a Type 0 font with /Identity-V (the Ahem subset the redaction fixtures use, every character drawn as a square one em wide, with a ToUnicode CMap giving the Japanese text), beside one horizontal Helvetica line at 20 pt',
    }
  )
}

writeRtl()
writeVertical()

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
console.log(`wrote ${Object.keys(entries).length} script fixtures`)
