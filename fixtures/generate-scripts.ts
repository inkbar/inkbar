/*
 * Writes the fixtures for text that does not run left to right in horizontal lines into pdf/, and
 * their entries into manifest.json, keeping every other entry. Each file is written byte by byte
 * (no timestamp, no random id, no compression), so running it again writes the same bytes.
 *
 *   pnpm --filter @inkbar/fixtures generate:scripts
 *
 * `text-rtl` embeds Noto Sans Hebrew (fonts/NotoSansHebrew-Regular.ttf, see fonts/README.md) and
 * `text-vertical` embeds a subset of Noto Sans JP (fonts/NotoSansJP-subset.otf).
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

/** The offset of the table `tag` of an OpenType font. */
function otfTable(font: Buffer, tag: string): number {
  for (let i = 0; i < font.readUInt16BE(4); i++) {
    const at = 12 + 16 * i
    if (font.toString('latin1', at, at + 4) === tag) return font.readUInt32BE(at + 8)
  }
  throw new Error(`the font has no ${tag} table`)
}

/** The glyph a format 4 subtable of the font's cmap gives `char`, or 0. */
function glyphOf(font: Buffer, char: string): number {
  const cmap = otfTable(font, 'cmap')
  const code = char.codePointAt(0) as number
  for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
    const sub = cmap + font.readUInt32BE(cmap + 8 + 8 * i)
    if (font.readUInt16BE(sub) !== 4) continue
    const segments = font.readUInt16BE(sub + 6) / 2
    const ends = sub + 14
    const starts = ends + 2 * segments + 2
    const deltas = starts + 2 * segments
    const ranges = deltas + 2 * segments
    for (let s = 0; s < segments; s++) {
      if (code > font.readUInt16BE(ends + 2 * s)) continue
      if (code < font.readUInt16BE(starts + 2 * s)) return 0
      const delta = font.readUInt16BE(deltas + 2 * s)
      const range = font.readUInt16BE(ranges + 2 * s)
      if (range === 0) return (code + delta) & 0xffff
      const at = ranges + 2 * s + range + 2 * (code - font.readUInt16BE(starts + 2 * s))
      const glyph = font.readUInt16BE(at)
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff
    }
  }
  return 0
}

/**
 * The CID of each glyph of a CID-keyed CFF font wrapped in OpenType, from the charset of its CFF
 * table. A subset renumbers the glyphs and keeps the CIDs, and a PDF names glyphs by CID.
 */
function cidsOf(font: Buffer): number[] {
  const cff = font.subarray(otfTable(font, 'CFF '))
  /** The items of the INDEX at `at`, and where the INDEX ends. */
  const index = (at: number) => {
    const count = cff.readUInt16BE(at)
    if (count === 0) return { items: [] as Buffer[], end: at + 2 }
    const size = cff[at + 2] as number
    const offset = (k: number) => cff.readUIntBE(at + 3 + k * size, size)
    const base = at + 2 + (count + 1) * size
    const items = Array.from({ length: count }, (_, k) =>
      cff.subarray(base + offset(k), base + offset(k + 1))
    )
    return { items, end: base + offset(count) }
  }
  /** The operands of each operator of a DICT, by operator (12 x is 1200 + x). */
  const dict = (data: Buffer) => {
    const ops = new Map<number, number[]>()
    let operands: number[] = []
    let i = 0
    while (i < data.length) {
      const b0 = data[i] as number
      if (b0 <= 21) {
        const op = b0 === 12 ? 1200 + (data[i + 1] as number) : b0
        i += b0 === 12 ? 2 : 1
        ops.set(op, operands)
        operands = []
      } else if (b0 === 28) {
        operands.push(data.readInt16BE(i + 1))
        i += 3
      } else if (b0 === 29) {
        operands.push(data.readInt32BE(i + 1))
        i += 5
      } else if (b0 === 30) {
        // A real number; no operand this reads is one, so it stands as 0.
        i++
        while (((data[i] as number) & 15) !== 15 && (data[i] as number) >> 4 !== 15) i++
        i++
        operands.push(0)
      } else if (b0 <= 246) {
        operands.push(b0 - 139)
        i++
      } else if (b0 <= 250) {
        operands.push((b0 - 247) * 256 + (data[i + 1] as number) + 108)
        i += 2
      } else {
        operands.push(-(b0 - 251) * 256 - (data[i + 1] as number) - 108)
        i += 2
      }
    }
    return ops
  }
  const names = index(cff[2] as number)
  const top = dict(index(names.end).items[0] as Buffer)
  if (!top.has(1230)) throw new Error('the CFF font is not CID-keyed')
  const glyphs = cff.readUInt16BE((top.get(17) as number[])[0])
  const charset = (top.get(15) as number[])[0] as number
  const format = cff[charset] as number
  const cids = [0]
  let at = charset + 1
  while (cids.length < glyphs) {
    if (format === 0) {
      cids.push(cff.readUInt16BE(at))
      at += 2
      continue
    }
    const first = cff.readUInt16BE(at)
    const left = format === 1 ? (cff[at + 2] as number) : cff.readUInt16BE(at + 2)
    at += format === 1 ? 3 : 4
    for (let k = 0; k <= left; k++) cids.push(first + k)
  }
  return cids
}

// The Japanese column, drawn in a subset of Noto Sans JP Regular (fonts/NotoSansJP-subset.otf,
// see fonts/README.md). Every glyph of the font is one em wide and one em tall, with its vertical
// origin 880 units above the baseline, which is what /DW2 [880 -1000] says.
const COLUMN = '日本語のテキスト'

function writeVertical() {
  const file = readFileSync(join(here, 'fonts', 'NotoSansJP-subset.otf'))
  const cids = cidsOf(file)
  const characters = [...COLUMN]
  const map = characters.map((char): [number, string] => {
    const glyph = glyphOf(file, char)
    if (glyph === 0) throw new Error(`the Noto Sans JP subset has no glyph for ${char}`)
    return [cids[glyph] as number, char]
  })
  const contents =
    `BT /F2 28 Tf 400 760 Td ${codes(map.map(([cid]) => cid))} Tj ET\n` +
    'BT /F1 20 Tf 72 700 Td (Horizontal line beside the column) Tj ET\n'
  const name = 'INKBAR+NotoSansJP-Regular'
  write(
    'text-vertical',
    buildPdf(
      [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        page('/F1 5 0 R /F2 6 0 R'),
        stream('', contents),
        HELVETICA,
        `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-V /DescendantFonts [7 0 R] /ToUnicode 10 0 R >>`,
        `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 8 0 R /DW 1000 /DW2 [880 -1000] >>`,
        `<< /Type /FontDescriptor /FontName /${name} /Flags 4 /FontBBox [-1002 -1048 2928 1808] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 733 /StemV 80 /FontFile3 9 0 R >>`,
        stream('/Subtype /OpenType', file),
        stream('', toUnicode(map)),
        INFO,
      ],
      11
    ),
    {
      pages: 1,
      opens: true,
      describes:
        'A4 page: a column of Japanese (日本語のテキスト) written top to bottom at 28 pt from x 400, y 760, in a Type 0 font with /Identity-V (an embedded subset of Noto Sans JP Regular, CID-keyed CFF in OpenType, every glyph one em square with /DW2 [880 -1000], and a ToUnicode CMap), beside one horizontal Helvetica line at 20 pt',
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
