/*
 * Writes the fixtures of PDFs that name fonts without embedding them, into pdf/, and their
 * entries into manifest.json, keeping every other entry. Each file is written byte by byte as
 * plain text objects (no font program, no timestamp, no random id), so running it again writes
 * the same bytes.
 *
 *   pnpm --filter @inkbar/fixtures generate:unembedded
 *
 * Every page is A4 and has three kinds of line: the text in the script under test, in a font the
 * file does not carry, and one Latin line in Helvetica as a control. The `unembedded` field of an
 * entry names the fallback fonts a renderer needs to draw the file: `default` for the fallback
 * that covers Latin, Cyrillic and Greek, and `[]` for a Latin font a renderer substitutes from its
 * standard set.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { format, resolveConfig } from 'prettier'

import type { FixtureMeta } from './index'
import type { FixtureName } from './urls'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'pdf')
const manifestPath = join(here, 'manifest.json')

/** A PDF of `bodies`, object n at bodies[n - 1], object 1 the catalog. */
function buildPdf(bodies: string[]): Buffer {
  let text = '%PDF-1.7\n'
  const offsets: number[] = []
  bodies.forEach((body, i) => {
    offsets.push(text.length)
    text += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = text.length
  text += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) text += `${String(offset).padStart(10, '0')} 00000 n \n`
  text += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R /Info 7 0 R >>\n`
  text += `startxref\n${xref}\n%%EOF\n`
  return Buffer.from(text, 'latin1')
}

const stream = (data: string) =>
  `<< /Length ${data.length} >>\nstream\n${data}\nendstream`

const HELVETICA =
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'

/** A `Tj` operand: the big-endian UTF-16 of `text` as hex. */
const utf16 = (text: string) =>
  `<${[...text].map((c) => (c.codePointAt(0) as number).toString(16).padStart(4, '0')).join('')}>`

/** A `Tj` operand of single bytes, as hex. */
const bytes = (codes: number[]) =>
  `<${codes.map((c) => c.toString(16).padStart(2, '0')).join('')}>`

/** `font` 24 at the baseline (72, y), then the string. */
const line = (font: string, y: number, operand: string) =>
  `BT /${font} 24 Tf 72 ${y} Td ${operand} Tj ET\n`

const CONTROL = 'Latin control line in Helvetica'

const entries: Partial<Record<FixtureName, FixtureMeta>> = {}

function write(name: FixtureName, bytesOut: Buffer, meta: Omit<FixtureMeta, 'file'>) {
  writeFileSync(join(out, `${name}.pdf`), bytesOut)
  entries[name] = { file: `${name}.pdf`, ...meta }
}

interface Cjk {
  name: FixtureName
  fallback: 'japanese' | 'simplified-chinese' | 'traditional-chinese' | 'korean'
  language: string
  base: string
  registry: string
  cmap: string
  lines: [string, string]
}

const CJK: Cjk[] = [
  {
    name: 'unembedded-japanese',
    fallback: 'japanese',
    language: 'Japanese',
    base: 'KozMinPr6N-Regular',
    registry: 'Japan1',
    cmap: 'UniJIS-UTF16-H',
    lines: ['日本語のテキスト', 'こんにちは世界'],
  },
  {
    name: 'unembedded-simplified-chinese',
    fallback: 'simplified-chinese',
    language: 'Simplified Chinese',
    base: 'STSong-Light',
    registry: 'GB1',
    cmap: 'UniGB-UTF16-H',
    lines: ['简体中文文本', '你好，世界'],
  },
  {
    name: 'unembedded-traditional-chinese',
    fallback: 'traditional-chinese',
    language: 'Traditional Chinese',
    base: 'MSung-Light',
    registry: 'CNS1',
    cmap: 'UniCNS-UTF16-H',
    lines: ['繁體中文文字', '你好，世界'],
  },
  {
    name: 'unembedded-korean',
    fallback: 'korean',
    language: 'Korean',
    base: 'HYSMyeongJo-Medium',
    registry: 'Korea1',
    cmap: 'UniKS-UTF16-H',
    lines: ['한국어 텍스트', '안녕하세요 세계'],
  },
]

/** The text each fixture draws. */
const TEXTS = {
  ...Object.fromEntries(CJK.map((c) => [c.name, c.lines])),
} as Record<string, string[]>

function writeCjk(c: Cjk) {
  const font = `<< /Type /Font /Subtype /Type0 /BaseFont /${c.base} /Encoding /${c.cmap} /DescendantFonts [8 0 R] >>`
  const contents =
    line('F2', 760, utf16(c.lines[0])) +
    line('F2', 700, utf16(c.lines[1])) +
    line('F1', 640, `(${CONTROL})`)
  write(c.name, withDescendant(contents, font, c), {
    pages: 1,
    opens: true,
    describes: `A4 page: two lines of ${c.language} in a Type 0 font ${c.base} (CIDFontType0, Adobe-${c.registry}-0, ${c.cmap}) with no font file, and one Latin line in Helvetica as a control`,
    unembedded: [c.fallback],
  })
}

/** The CJK document: the shared objects plus the CIDFont (8) and its descriptor (9). */
function withDescendant(contents: string, font: string, c: Cjk): Buffer {
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    stream(contents),
    HELVETICA,
    font,
    '<< /Title (Unembedded font fixture) /Producer (Inkbar fixtures) >>',
    `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /${c.base} /CIDSystemInfo << /Registry (Adobe) /Ordering (${c.registry}) /Supplement 6 >> /FontDescriptor 9 0 R /DW 1000 >>`,
    `<< /Type /FontDescriptor /FontName /${c.base} /Flags 6 /FontBBox [-200 -250 1200 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>`,
  ])
}

/** A simple font's alphabet: Adobe Glyph List names and the codes the font gives them. */
interface Alphabet {
  name: FixtureName
  script: string
  base: string
  /** Code of the first glyph, then the glyph names in code order. */
  first: number
  glyphs: string[]
  lines: [string, string]
  /** The letters of `glyphs`, in the same order: a letter's code is `first` plus its index. */
  characters: string
}

const range = (from: number, to: number, prefix: string) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`)

// Cyrillic capitals A to Ya without Yo (afii10017 to afii10049, Yo is afii10023), then the small
// letters without yo (afii10065 to afii10097, yo is afii10071).
const CYRILLIC_UPPER = range(10017, 10049, 'afii').filter((g) => g !== 'afii10023')
const CYRILLIC_LOWER = range(10065, 10097, 'afii').filter((g) => g !== 'afii10071')
const CYRILLIC_LETTERS =
  'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ' + 'абвгдежзийклмнопрстуфхцчшщъыьэюя'

const GREEK_UPPER = [
  'Alpha',
  'Beta',
  'Gamma',
  'Deltagreek',
  'Epsilon',
  'Zeta',
  'Eta',
  'Theta',
  'Iota',
  'Kappa',
  'Lambda',
  'Mu',
  'Nu',
  'Xi',
  'Omicron',
  'Pi',
  'Rho',
  'Sigma',
  'Tau',
  'Upsilon',
  'Phi',
  'Chi',
  'Psi',
  'Omegagreek',
]
const GREEK_LOWER = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'zeta',
  'eta',
  'theta',
  'iota',
  'kappa',
  'lambda',
  'mugreek',
  'nu',
  'xi',
  'omicron',
  'pi',
  'rho',
  'sigma',
  'tau',
  'upsilon',
  'phi',
  'chi',
  'psi',
  'omega',
]
const GREEK_LETTERS = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ' + 'αβγδεζηθικλμνξοπρστυφχψω'

const ALPHABETS: Alphabet[] = [
  {
    name: 'unembedded-cyrillic',
    script: 'Cyrillic',
    base: 'PTSans',
    first: 0xc0,
    glyphs: [...CYRILLIC_UPPER, ...CYRILLIC_LOWER],
    characters: CYRILLIC_LETTERS,
    lines: ['Привет мир', 'Быстрая коричневая лиса'],
  },
  {
    name: 'unembedded-greek',
    script: 'Greek',
    base: 'PTSans',
    first: 0xc0,
    glyphs: [...GREEK_UPPER, ...GREEK_LOWER],
    characters: GREEK_LETTERS,
    lines: ['Γεια σου κοσμε', 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ'],
  },
]

Object.assign(TEXTS, Object.fromEntries(ALPHABETS.map((a) => [a.name, a.lines])), {
  'unembedded-arial': ['Arial is named, not embedded'],
})

/**
 * `text` as the codes of a font with `glyphs` from `first`; a space is code 32 and anything else
 * outside the alphabet is a mistake.
 */
function codes(a: Alphabet, text: string): number[] {
  return [...text].map((c) => {
    if (c === ' ') return 32
    const at = a.characters.indexOf(c)
    if (at < 0) throw new Error(`${c} is not in the ${a.script} alphabet`)
    return a.first + at
  })
}

/** A glyph is about 560 units wide, a space 250: enough for a renderer that has no program. */
const widths = (first: number, last: number) =>
  Array.from({ length: last - first + 1 }, (_, i) => (first + i === 32 ? 250 : 560)).join(
    ' '
  )

function writeAlphabet(a: Alphabet) {
  const last = a.first + a.glyphs.length - 1
  const font =
    `<< /Type /Font /Subtype /TrueType /BaseFont /${a.base} /FirstChar 32 /LastChar ${last} ` +
    `/Widths [${widths(32, last)}] /FontDescriptor 8 0 R ` +
    `/Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [${a.first} ${a.glyphs.map((g) => `/${g}`).join(' ')}] >> >>`
  const contents =
    line('F2', 760, bytes(codes(a, a.lines[0]))) +
    line('F2', 700, bytes(codes(a, a.lines[1]))) +
    line('F1', 640, `(${CONTROL})`)
  write(a.name, withDescriptor(contents, font, a.base, 32), {
    pages: 1,
    opens: true,
    describes: `A4 page: two lines of ${a.script} in a simple TrueType font ${a.base} with no font file and a /Differences array of Adobe Glyph List names (${a.glyphs[0]} to ${a.glyphs[a.glyphs.length - 1]}), and one Latin line in Helvetica as a control`,
    unembedded: ['default'],
  })
}

/** A document whose font under test (6) has the descriptor (8) given by `name`. */
function withDescriptor(
  contents: string,
  font: string,
  name: string,
  flags: number
): Buffer {
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    stream(contents),
    HELVETICA,
    font,
    '<< /Title (Unembedded font fixture) /Producer (Inkbar fixtures) >>',
    `<< /Type /FontDescriptor /FontName /${name} /Flags ${flags} /FontBBox [-200 -250 1100 950] /ItalicAngle 0 /Ascent 900 /Descent -250 /CapHeight 700 /StemV 80 >>`,
  ])
}

function writeArial() {
  const font =
    '<< /Type /Font /Subtype /TrueType /BaseFont /Arial /FirstChar 32 /LastChar 126 ' +
    `/Widths [${widths(32, 126)}] /FontDescriptor 8 0 R /Encoding /WinAnsiEncoding >>`
  const contents =
    line('F2', 760, `(${(TEXTS['unembedded-arial'] as string[])[0]})`) +
    line('F1', 700, `(${CONTROL})`)
  write('unembedded-arial', withDescriptor(contents, font, 'Arial', 32), {
    pages: 1,
    opens: true,
    describes:
      'A4 page: one line in a simple TrueType font Arial (WinAnsiEncoding) with no font file, and one Latin line in Helvetica as a control',
    unembedded: [],
  })
}

for (const c of CJK) writeCjk(c)
for (const a of ALPHABETS) writeAlphabet(a)
writeArial()

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
console.log(`wrote ${Object.keys(entries).length} unembedded-font fixtures`)
