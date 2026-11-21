/*
 * Writes the link fixtures into pdf/, and their entries into manifest.json, keeping every other
 * entry. Each file is written byte by byte as plain text objects (no timestamp, no random id), so
 * running it again writes the same bytes.
 *
 *   pnpm --filter @inkbar/fixtures generate:links
 *
 * `link-targets` holds one Link per kind of action or destination a reader has to turn into a
 * target, each beside a label with its case name, and a name tree for its named destination.
 * `link-order` pins the order of /Annots around the Links: hidden and non-viewable annotations,
 * widgets and a Link with bad /QuadPoints.
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
  text += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R /Info 6 0 R >>\n`
  text += `startxref\n${xref}\n%%EOF\n`
  return Buffer.from(text, 'latin1')
}

const stream = (data: string) =>
  `<< /Length ${data.length} >>\nstream\n${data}\nendstream`

const HELVETICA =
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'

/** A literal string of ASCII text, with the characters that need it escaped. */
const lit = (text: string) => `(${text.replace(/[\\()]/g, (c) => `\\${c}`)})`

/** A string of single bytes, as a hex string. */
const hex = (codes: number[]) =>
  `<${codes.map((c) => c.toString(16).padStart(2, '0')).join('')}>`

const uri = (target: string) => `<< /S /URI /URI ${target} >>`
const js = (script: string) => `<< /S /JavaScript /JS ${lit(script)} >>`

// Object numbers: 1 catalog, 2 page tree, 3 page, 4 contents, 5 Helvetica, 6 info, then the
// annotations from 7.
const FIRST_ANNOT = 7

interface Case {
  name: string
  /** The /A, /AA or /Dest entries of the Link. */
  entries: string
  /** What the PDF.js reader reports in `doc.links(0)` for the Link. */
  pdfjs: string
}

const UTF8_E_ACUTE = [...Buffer.from('https://example.com/é', 'utf8')]

/** `résumé` as a UTF-16BE text string with its byte-order mark, as a named destination. */
const UTF16_RESUME = [0xfe, 0xff, ...Buffer.from('résumé', 'utf16le').swap16()]

const CASES: Case[] = [
  {
    name: 'a-and-dest',
    entries: `/A ${uri(lit('https://example.com/a'))} /Dest [3 0 R /Fit]`,
    pdfjs: 'url https://example.com/a, newWindow false',
  },
  {
    name: 'gotor-absolute',
    entries: `/A << /S /GoToR /F ${lit('https://example.com/doc.pdf')} /NewWindow true >>`,
    pdfjs: 'url https://example.com/doc.pdf, newWindow true',
  },
  {
    name: 'gotor-file',
    entries: `/A << /S /GoToR /F ${lit('other.pdf')} /D ${lit('ch1')} >>`,
    pdfjs: 'unsupported, reason remote',
  },
  {
    name: 'launch-absolute',
    entries: `/A << /S /Launch /F ${lit('https://example.com/run')} >>`,
    pdfjs: 'url https://example.com/run, newWindow false',
  },
  {
    name: 'launch-file',
    entries: `/A << /S /Launch /F ${lit('app.exe')} >>`,
    pdfjs: 'unsupported, reason launch',
  },
  {
    name: 'js-launch-url',
    entries: `/A ${js("app.launchURL('https://example.com/js', true)")}`,
    pdfjs: 'url https://example.com/js, newWindow true',
  },
  {
    name: 'js-window-open',
    entries: `/A ${js("window.open('https://example.com/open')")}`,
    pdfjs: 'url https://example.com/open, newWindow false',
  },
  {
    name: 'js-other',
    entries: `/A ${js("app.alert('x')")}`,
    pdfjs: 'unsupported, reason unknown',
  },
  {
    name: 'aa-only',
    entries: `/AA << /U ${uri(lit('https://example.com/aa'))} >>`,
    pdfjs: 'url https://example.com/aa, newWindow false',
  },
  {
    name: 'uri-www',
    entries: `/A ${uri(lit('www.example.com/path'))}`,
    pdfjs: 'url http://www.example.com/path, newWindow false',
  },
  {
    name: 'uri-utf8',
    entries: `/A ${uri(hex(UTF8_E_ACUTE))}`,
    pdfjs: 'url https://example.com/%C3%A9, newWindow false',
  },
  {
    name: 'uri-javascript',
    entries: `/A ${uri(lit('javascript:alert(1)'))}`,
    pdfjs: 'unsupported, reason unsafe-url',
  },
  {
    name: 'uri-file',
    entries: `/A ${uri(lit('file:///etc/passwd'))}`,
    pdfjs: 'unsupported, reason unsafe-url',
  },
  {
    name: 'uri-data',
    entries: `/A ${uri(lit('data:text/html,x'))}`,
    pdfjs: 'unsupported, reason unsafe-url',
  },
  {
    name: 'uri-bytes',
    entries: `/A ${uri(hex([0xff, 0xfe]))}`,
    pdfjs: 'unsupported, reason launch',
  },
  {
    name: 'js-launch-javascript',
    entries: `/A ${js("app.launchURL('javascript:alert(1)')")}`,
    pdfjs: 'unsupported, reason unsafe-url',
  },
  {
    name: 'named-next',
    entries: '/A << /S /Named /N /NextPage >>',
    pdfjs: 'named, action NextPage',
  },
  {
    name: 'named-other',
    entries: '/A << /S /Named /N /Print >>',
    pdfjs: 'unsupported, reason unknown',
  },
  {
    name: 'dest-catalog',
    entries: '/Dest [1 0 R /Fit]',
    pdfjs: 'dest, raw [ref 1 0, name Fit]',
  },
  {
    name: 'dest-named-utf16',
    entries: `/A << /S /GoTo /D ${hex(UTF16_RESUME)} >>`,
    pdfjs: 'dest, raw résumé',
  },
]

/** The catalog's name tree: `résumé`, written as `UTF16_RESUME`, goes to the page. */
const NAMED_DESTS = `/Names << /Dests << /Names [${hex(UTF16_RESUME)} [3 0 R /Fit]] >> >> `

/**
 * A one-page document with `annots` as objects 7 on, then `direct` written into /Annots itself,
 * and `catalog` entries in the catalog.
 */
function onePage(
  contents: string,
  annots: string[],
  catalog = '',
  direct: string[] = []
): Buffer {
  const refs = [...annots.map((_, i) => `${FIRST_ANNOT + i} 0 R`), ...direct].join(' ')
  return buildPdf([
    `<< /Type /Catalog /Pages 2 0 R ${catalog}>>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> /Annots [${refs}] >>`,
    stream(contents),
    HELVETICA,
    '<< /Title (Link fixture) /Producer (Inkbar fixtures) >>',
    ...annots,
  ])
}

const label = (x: number, y: number, text: string) =>
  `BT /F1 14 Tf ${x} ${y} Td ${lit(text)} Tj ET\n`

const entries: Partial<Record<FixtureName, FixtureMeta>> = {}

function write(name: FixtureName, bytes: Buffer, meta: Omit<FixtureMeta, 'file'>) {
  writeFileSync(join(out, `${name}.pdf`), bytes)
  entries[name] = { file: `${name}.pdf`, ...meta }
}

/** The Link boxes and their labels, one row for each case, from the top of the page. */
function linkTargets(describes: string) {
  let contents = ''
  const annots = CASES.map((c, i) => {
    const y = 740 - i * 36
    contents += label(72, y + 4, c.name)
    return `<< /Type /Annot /Subtype /Link /Rect [300 ${y} 420 ${y + 20}] /F 4 /Border [0 0 0] /P 3 0 R ${c.entries} >>`
  })
  write('link-targets', onePage(contents, annots, NAMED_DESTS), {
    pages: 1,
    opens: true,
    describes,
    annotations: { Link: CASES.length },
  })
}

function linkOrder() {
  const box = (n: number) => `/Rect [72 ${700 - n * 60} 272 ${730 - n * 60}]`
  const link = (n: number, name: string, flags = 4, more = '') =>
    `<< /Type /Annot /Subtype /Link ${box(n)} /F ${flags} /NM ${lit(name)} /Border [0 0 0] /P 3 0 R /A ${uri(lit(`https://example.com/${name}`))} ${more}>>`
  const widget = (n: number, name: string) =>
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T ${lit(name)} ${box(n)} /F 4 /NM ${lit(name)} /P 3 0 R >>`
  const annots = [
    `<< /Type /Annot /Subtype /Square ${box(0)} /F 2 /NM (square-hidden) /C [1 0 0] /P 3 0 R >>`,
    link(1, 'link-one'),
    widget(2, 'field-one'),
    link(3, 'link-no-view', 32),
    link(4, 'link-two'),
    widget(5, 'field-two'),
    link(6, 'link-bad-quads', 4, '/QuadPoints [72 100 272 100 72 80] '),
    link(7, 'link-hidden', 2),
  ]
  // A Link stored as a direct object in /Annots: it has no object number of its own.
  const direct = [link(8, 'link-direct')]
  const ids = [
    'square-hidden',
    'link-one',
    'field-one',
    'link-no-view',
    'link-two',
    'field-two',
    'link-bad-quads',
    'link-hidden',
    'link-direct',
  ]
  const contents = ids.map((id, n) => label(300, 708 - n * 60, id)).join('')
  write(
    'link-order',
    onePage(
      contents,
      annots,
      `/AcroForm << /Fields [9 0 R 12 0 R] /DR << /Font << /Helv 5 0 R >> >> /DA (/Helv 0 Tf 0 g) >> `,
      direct
    ),
    {
      pages: 1,
      opens: true,
      describes:
        'One page whose /Annots holds nine annotations in this order, each named by /NM and labelled beside its box: square-hidden (a Square with the Hidden flag), link-one (a Link), field-one (a text Widget), link-no-view (a Link with the NoView flag), link-two (a Link), field-two (a text Widget), link-bad-quads (a Link whose /QuadPoints holds six numbers, not a multiple of eight), link-hidden (a Link with the Hidden flag) and link-direct (a Link written as a direct object in /Annots)',
      annotations: { Square: 1, Link: 6, Widget: 2 },
    }
  )
}

const TARGETS_DESCRIBES =
  `One page with ${CASES.length} Link annotations, each beside a label of its case name. ` +
  'For each case, in /Annots order, the target the PDF.js reader reports in doc.links(0): ' +
  CASES.map((c) => `${c.name}: ${c.pdfjs}`).join('; ') +
  '.'

linkTargets(TARGETS_DESCRIBES)
linkOrder()

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
console.log(`wrote ${Object.keys(entries).length} link fixtures`)
