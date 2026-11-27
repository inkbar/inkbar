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
import { join } from 'node:path'

import { format, resolveConfig } from 'prettier'

import { manifestPath, out } from './generate-paths'

import type { FixtureMeta } from './index'
import type { FixtureName } from './urls'

/** An object's body, and its generation when that is not 0. */
type Body = string | { body: string; generation: number }

/** A PDF of `bodies`, object n at bodies[n - 1], object 1 the catalog. */
function buildPdf(bodies: Body[]): Buffer {
  let text = '%PDF-1.7\n'
  const offsets: number[] = []
  const generations: number[] = []
  bodies.forEach((entry, i) => {
    const { body, generation } =
      typeof entry === 'string' ? { body: entry, generation: 0 } : entry
    offsets.push(text.length)
    generations.push(generation)
    text += `${i + 1} ${generation} obj\n${body}\nendobj\n`
  })
  const xref = text.length
  text += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`
  offsets.forEach((offset, i) => {
    const generation = String(generations[i]).padStart(5, '0')
    text += `${String(offset).padStart(10, '0')} ${generation} n \n`
  })
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
  /** The /A, /AA or /Dest entries of the Link. `NUMBER_REF` stands for the number object. */
  entries: string
  /** What core's reader reports in `doc.links(0)` for the Link. */
  reported: string
  /** The generation of the Link's object, when not 0. */
  generation?: number
  /** An annotation written into /Annots just before the Link, beside it on the page. */
  before?: string
}

/** Stands in a case's entries for a reference to an object holding the number 500. */
const NUMBER_REF = '{number}'

/** `text` as a UTF-16BE text string with its byte-order mark. */
const utf16 = (text: string) => [0xfe, 0xff, ...Buffer.from(text, 'utf16le').swap16()]

const UTF8_E_ACUTE = [...Buffer.from('https://example.com/é', 'utf8')]

/** `résumé` as a UTF-16BE text string with its byte-order mark, as a named destination. */
const UTF16_RESUME = utf16('résumé')

const CASES: Case[] = [
  {
    name: 'a-and-dest',
    entries: `/A ${uri(lit('https://example.com/a'))} /Dest [3 0 R /Fit]`,
    reported: 'url https://example.com/a, newWindow false',
  },
  {
    name: 'gotor-absolute',
    entries: `/A << /S /GoToR /F ${lit('https://example.com/doc.pdf')} /NewWindow true >>`,
    reported: 'url https://example.com/doc.pdf, newWindow true',
  },
  {
    name: 'gotor-file',
    entries: `/A << /S /GoToR /F ${lit('other.pdf')} /D ${lit('ch1')} >>`,
    reported: 'unsupported, reason remote',
  },
  {
    name: 'launch-absolute',
    entries: `/A << /S /Launch /F ${lit('https://example.com/run')} >>`,
    reported: 'url https://example.com/run, newWindow false',
  },
  {
    name: 'launch-file',
    entries: `/A << /S /Launch /F ${lit('app.exe')} >>`,
    reported: 'unsupported, reason launch',
  },
  {
    name: 'js-launch-url',
    entries: `/A ${js("app.launchURL('https://example.com/js', true)")}`,
    reported: 'url https://example.com/js, newWindow true',
  },
  {
    name: 'js-window-open',
    entries: `/A ${js("window.open('https://example.com/open')")}`,
    reported: 'url https://example.com/open, newWindow false',
  },
  {
    name: 'js-other',
    entries: `/A ${js("app.alert('x')")}`,
    reported: 'unsupported, reason unknown',
  },
  {
    name: 'aa-only',
    entries: `/AA << /U ${uri(lit('https://example.com/aa'))} >>`,
    reported: 'url https://example.com/aa, newWindow false',
  },
  {
    name: 'uri-www',
    entries: `/A ${uri(lit('www.example.com/path'))}`,
    reported: 'url http://www.example.com/path, newWindow false',
  },
  {
    name: 'uri-utf8',
    entries: `/A ${uri(hex(UTF8_E_ACUTE))}`,
    reported: 'url https://example.com/%C3%A9, newWindow false',
  },
  {
    name: 'uri-javascript',
    entries: `/A ${uri(lit('javascript:alert(1)'))}`,
    reported: 'unsupported, reason unsafe-url',
  },
  {
    name: 'uri-file',
    entries: `/A ${uri(lit('file:///etc/passwd'))}`,
    reported: 'unsupported, reason unsafe-url',
  },
  {
    name: 'uri-data',
    entries: `/A ${uri(lit('data:text/html,x'))}`,
    reported: 'unsupported, reason unsafe-url',
  },
  {
    name: 'uri-bytes',
    entries: `/A ${uri(hex([0xff, 0xfe]))}`,
    reported: 'unsupported, reason launch',
  },
  {
    name: 'js-launch-javascript',
    entries: `/A ${js("app.launchURL('javascript:alert(1)')")}`,
    reported: 'unsupported, reason unsafe-url',
  },
  {
    name: 'named-next',
    entries: '/A << /S /Named /N /NextPage >>',
    reported: 'named, action NextPage',
  },
  {
    name: 'named-other',
    entries: '/A << /S /Named /N /Print >>',
    reported: 'unsupported, reason unknown',
  },
  {
    name: 'dest-catalog',
    entries: '/Dest [1 0 R /Fit]',
    reported: 'dest, raw [ref 1 0, name Fit]',
  },
  {
    name: 'dest-named-utf16',
    entries: `/A << /S /GoTo /D ${hex(UTF16_RESUME)} >>`,
    reported: 'dest, raw résumé',
  },
  // Explicit destinations PDF.js refuses (`isValidExplicitDest`): the Link goes nowhere.
  {
    name: 'dest-fit-argument',
    entries: '/Dest [3 0 R /Fit 72]',
    reported: 'unsupported, reason unknown',
  },
  {
    name: 'dest-fith-two-arguments',
    entries: '/Dest [3 0 R /FitH 600 72]',
    reported: 'unsupported, reason unknown',
  },
  {
    name: 'dest-xyz-four-arguments',
    entries: '/A << /S /GoTo /D [3 0 R /XYZ 72 600 0 5] >>',
    reported: 'unsupported, reason unknown',
  },
  {
    name: 'link-generation',
    entries: `/A ${uri(lit('https://example.com/generation'))}`,
    generation: 1,
    reported:
      'url https://example.com/generation, newWindow false, its id the object number, R and the generation 1',
  },
  {
    name: 'dest-invalid-beside-aa',
    entries: `/Dest 5 /AA << /U ${uri(lit('https://example.com/aa-unused'))} >>`,
    reported: 'unsupported, reason unknown',
  },
  {
    name: 'launch-string-bom',
    entries: `/A << /S /Launch /F ${hex(utf16('https://example.com/bom'))} >>`,
    reported: 'unsupported, reason launch',
  },
  {
    name: 'launch-spec-utf16',
    entries: `/A << /S /Launch /F << /Type /Filespec /UF ${hex(utf16('https://example.com/spec'))} >> >>`,
    reported: 'url https://example.com/spec, newWindow false',
  },
  {
    name: 'uri-name',
    entries: '/A << /S /URI /URI /https:#2F#2Fexample.com#2Fname >>',
    reported: 'unsupported, reason launch',
  },
  {
    name: 'dest-xyz-one-argument',
    entries: '/Dest [3 0 R /XYZ 72]',
    reported: 'unsupported, reason unknown',
  },
  {
    name: 'dest-indirect-argument',
    entries: `/Dest [3 0 R /FitH ${NUMBER_REF}]`,
    reported: 'unsupported, reason unknown',
  },
  {
    name: 'dest-fit-string',
    entries: '/Dest [3 0 R (Fit)]',
    reported: 'unsupported, reason unknown',
  },
  {
    name: 'dest-page-number',
    entries: '/Dest [0 /FitH 500]',
    reported: 'dest, raw [0, name FitH, 500]',
  },
  {
    name: 'dest-page-real',
    entries: '/Dest [0.5 /Fit]',
    reported: 'unsupported, reason unknown',
  },
  {
    name: 'after-markup-no-quads',
    entries: `/A ${uri(lit('https://example.com/after-markup'))}`,
    before: '/Subtype /Highlight /F 4 /C [1 1 0]',
    reported:
      'url https://example.com/after-markup, newWindow false, its order not counting the Highlight with no /QuadPoints before it',
  },
]

/** The catalog's name tree: `résumé`, written as `UTF16_RESUME`, goes to the page. */
const NAMED_DESTS = `/Names << /Dests << /Names [${hex(UTF16_RESUME)} [3 0 R /Fit]] >> >> `

/**
 * A one-page document with `annots` as objects 7 on, then `direct` written into /Annots itself,
 * and `catalog` entries in the catalog. `more` follows the annotations as further objects.
 */
function onePage(
  contents: string,
  annots: Body[],
  catalog = '',
  direct: string[] = [],
  more: Body[] = []
): Buffer {
  const gen = (a: Body) => (typeof a === 'string' ? 0 : a.generation)
  const refs = [
    ...annots.map((a, i) => `${FIRST_ANNOT + i} ${gen(a)} R`),
    ...direct,
  ].join(' ')
  return buildPdf([
    `<< /Type /Catalog /Pages 2 0 R ${catalog}>>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> /Annots [${refs}] >>`,
    stream(contents),
    HELVETICA,
    '<< /Title (Link fixture) /Producer (Inkbar fixtures) >>',
    ...annots,
    ...more,
  ])
}

const label = (x: number, y: number, text: string) =>
  `BT /F1 14 Tf ${x} ${y} Td ${lit(text)} Tj ET\n`

const entries: Partial<Record<FixtureName, FixtureMeta>> = {}

function write(name: FixtureName, bytes: Buffer, meta: Omit<FixtureMeta, 'file'>) {
  writeFileSync(join(out, `${name}.pdf`), bytes)
  entries[name] = { file: `${name}.pdf`, ...meta }
}

/**
 * The Link boxes and their labels, one row for each case, from the top of the page, then the
 * number object `NUMBER_REF` names.
 */
function linkTargets(describes: string) {
  let contents = ''
  const annots: Body[] = []
  CASES.forEach((c, i) => {
    const y = 750 - i * 21
    contents += label(72, y + 3, c.name)
    if (c.before)
      annots.push(
        `<< /Type /Annot ${c.before} /Rect [440 ${y} 560 ${y + 16}] /P 3 0 R >>`
      )
    const body = `<< /Type /Annot /Subtype /Link /Rect [300 ${y} 420 ${y + 16}] /F 4 /Border [0 0 0] /P 3 0 R ${c.entries} >>`
    annots.push(c.generation ? { body, generation: c.generation } : body)
  })
  const numberRef = `${FIRST_ANNOT + annots.length} 0 R`
  const filled = annots.map((a) =>
    typeof a === 'string'
      ? a.replace(NUMBER_REF, numberRef)
      : { ...a, body: a.body.replace(NUMBER_REF, numberRef) }
  )
  write('link-targets', onePage(contents, filled, NAMED_DESTS, [], ['500']), {
    pages: 1,
    opens: true,
    describes,
    annotations: { Link: CASES.length, Highlight: 1 },
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
  `One page with ${CASES.length} Link annotations, each beside a label of its case name, and a ` +
  'Highlight with no /QuadPoints in /Annots just before the last Link. ' +
  "For each case, in /Annots order, the target core's reader reports in doc.links(0): " +
  CASES.map((c) => `${c.name}: ${c.reported}`).join('; ') +
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
