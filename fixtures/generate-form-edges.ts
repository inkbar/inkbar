/*
 * Writes the fixtures for form and annotation shapes the other fixtures leave untested into pdf/,
 * and their entries into manifest.json, keeping every other entry. Each file is written byte by
 * byte as plain text objects (no timestamp, no random id), so running it again writes the same
 * bytes.
 *
 *   pnpm --filter @inkbar/fixtures generate:form-edges
 *
 * `annot-direct` writes annotations as direct objects in /Annots, `form-tree` inherits a field's
 * attributes from a non-terminal ancestor, `form-rollover` has appearances with no normal state,
 * and `script-page-only` runs JavaScript from a page's /AA and nowhere else.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { format, resolveConfig } from 'prettier'

import { manifestPath, out } from './generate-paths'

import type { FixtureMeta } from './index'
import type { FixtureName } from './urls'

/** A PDF of `bodies`, object n at bodies[n - 1], object 1 the catalog and object 2 the info. */
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
  text += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R /Info 2 0 R >>\n`
  text += `startxref\n${xref}\n%%EOF\n`
  return Buffer.from(text, 'latin1')
}

const stream = (data: string, dict = '') =>
  `<< ${dict} /Length ${data.length} >>\nstream\n${data}\nendstream`

const HELVETICA =
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'

const INFO = '<< /Title (Form edge fixture) /Producer (Inkbar fixtures) >>'

const entries: Partial<Record<FixtureName, FixtureMeta>> = {}

function write(name: FixtureName, bytes: Buffer, meta: Omit<FixtureMeta, 'file'>) {
  writeFileSync(join(out, `${name}.pdf`), bytes)
  entries[name] = { file: `${name}.pdf`, ...meta }
}

/** The text of the page: one Helvetica line per entry, from the top down. */
const label = (lines: string[]) =>
  lines
    .map((line, i) => `BT /F1 12 Tf 72 ${760 - i * 20} Td (${line}) Tj ET`)
    .join('\n') + '\n'

/*
 * Object numbers in every file: 1 catalog, 2 info, 3 page tree, 4 page, 5 contents, 6 Helvetica,
 * then the rest.
 */
const page = (extra: string) =>
  `<< /Type /Page /Parent 3 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 6 0 R >> >> ${extra} >>`
const PAGES = '<< /Type /Pages /Kids [4 0 R] /Count 1 >>'

function writeAnnotDirect() {
  write(
    'annot-direct',
    buildPdf([
      '<< /Type /Catalog /Pages 3 0 R >>',
      INFO,
      PAGES,
      page(
        '/Annots [7 0 R << /Type /Annot /Subtype /Square /NM (direct-square) /Rect [72 600 172 650] /C [0 0 1] /Contents (A Square written inline) /F 4 /AP << /N 9 0 R >> >> << /Type /Annot /Subtype /Highlight /NM (direct-highlight) /Rect [72 540 272 560] /QuadPoints [72 560 272 560 72 540 272 540] /C [1 1 0] /Contents (A Highlight written inline) /F 4 /AP << /N 10 0 R >> >>]'
      ),
      stream(label(['Indirect Square above, direct Square and direct Highlight below'])),
      HELVETICA,
      '<< /Type /Annot /Subtype /Square /NM (indirect-square) /Rect [72 700 172 750] /C [1 0 0] /Contents (An indirect Square) /F 4 /AP << /N 8 0 R >> >>',
      stream(
        '1 0 0 RG 1 w 0.5 0.5 99 49 re S',
        '/Type /XObject /Subtype /Form /BBox [0 0 100 50]'
      ),
      stream(
        '0 0 1 RG 1 w 0.5 0.5 99 49 re S',
        '/Type /XObject /Subtype /Form /BBox [0 0 100 50]'
      ),
      stream(
        '1 1 0 rg 0 0 200 20 re f',
        '/Type /XObject /Subtype /Form /BBox [0 0 200 20]'
      ),
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'One page whose /Annots holds three annotations in this order: indirect-square (a Square, an indirect object), direct-square (a Square written as a dictionary inline in the array) and direct-highlight (a Highlight written inline, with /QuadPoints), each with a normal appearance stream',
      annotations: { Square: 2, Highlight: 1 },
    }
  )
}

function writeFormTree() {
  // group (text, multiline, /DA, /V) > sub > a and b. a holds only /T, /Parent and its widget keys;
  // b says its own /V.
  const widget = (title: string, rect: string, ap: number, own = '') =>
    `<< /Type /Annot /Subtype /Widget /T (${title}) /Parent 9 0 R /P 4 0 R /Rect ${rect} /F 4 /AP << /N ${ap} 0 R >> ${own} >>`
  // The look of the value in the inherited /DA (/Helv 12 Tf 0 g), in a 300 by 60 box.
  const look = (text: string) =>
    stream(
      `/Tx BMC q BT /Helv 12 Tf 0 g 2 44 Td (${text}) Tj ET Q EMC`,
      '/Type /XObject /Subtype /Form /BBox [0 0 300 60] /Resources << /Font << /Helv 6 0 R >> >>'
    )
  write(
    'form-tree',
    buildPdf([
      '<< /Type /Catalog /Pages 3 0 R /AcroForm << /Fields [7 0 R] /DR << /Font << /Helv 6 0 R >> >> >> >>',
      INFO,
      PAGES,
      page('/Annots [8 0 R 10 0 R]'),
      stream(
        label(['Two fields inherit their type, flags, default appearance and value'])
      ),
      HELVETICA,
      '<< /T (group) /Kids [9 0 R] /FT /Tx /Ff 4096 /DA (/Helv 12 Tf 0 g) /V (inherited text) >>',
      widget('a', '[72 640 372 700]', 11),
      '<< /T (sub) /Parent 7 0 R /Kids [8 0 R 10 0 R] >>',
      widget('b', '[72 560 372 620]', 12, '/V (its own text)'),
      look('inherited text'),
      look('its own text'),
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'A field tree three levels deep: group (a non-terminal with /FT /Tx, /Ff 4096 for multiline, /DA and /V (inherited text)), its child sub (a non-terminal with only /T and /Kids) and two terminal widgets under sub, a and b, each with a normal appearance stream showing its value. a has none of /FT, /Ff, /DA or /V and inherits all four from group, two levels up; b inherits /FT, /Ff and /DA the same way but has its own /V (its own text). The fields are group.sub.a and group.sub.b',
      annotations: { Widget: 2 },
    }
  )
}

function writeFormRollover() {
  const box = 'BBox [0 0 100 30]'
  const appearance = (draw: string) =>
    stream(draw, `/Type /XObject /Subtype /Form /${box}`)
  write(
    'form-rollover',
    buildPdf([
      '<< /Type /Catalog /Pages 3 0 R /AcroForm << /Fields [7 0 R 8 0 R] /DR << /Font << /Helv 6 0 R >> >> /DA (/Helv 12 Tf 0 g) >> >>',
      INFO,
      PAGES,
      page('/Annots [7 0 R 8 0 R]'),
      stream(
        label([
          'A push button with rollover and down looks only, a checkbox with no Off look',
        ])
      ),
      HELVETICA,
      '<< /Type /Annot /Subtype /Widget /FT /Btn /Ff 65536 /T (go) /P 4 0 R /Rect [72 680 172 710] /F 4 /AP << /R 9 0 R /D 10 0 R >> >>',
      '<< /Type /Annot /Subtype /Widget /FT /Btn /T (agree) /P 4 0 R /Rect [72 620 102 650] /F 4 /V /Yes#20No /AS /Yes#20No /AP << /N << /Yes#20No 11 0 R >> >> >>',
      appearance('0.8 g 0 0 100 30 re f'),
      appearance('0.4 g 0 0 100 30 re f'),
      stream('0 g 4 4 22 22 re f', '/Type /XObject /Subtype /Form /BBox [0 0 30 30]'),
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'Two button widgets. go is a push button (/Ff 65536) whose /AP has /R (rollover) and /D (down) streams and no /N. agree is a checkbox whose /AP /N holds one stream, for the on-state named Yes No (written /Yes#20No) and no Off stream; its /V and /AS are /Yes#20No',
      annotations: { Widget: 2 },
    }
  )
}

function writeScriptPageOnly() {
  write(
    'script-page-only',
    buildPdf([
      '<< /Type /Catalog /Pages 3 0 R >>',
      INFO,
      PAGES,
      page("/AA << /O << /S /JavaScript /JS (app.alert\\('page opened'\\)) >> >>"),
      stream(label(['The only script is the open action of this page'])),
      HELVETICA,
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        "No document-level script, no /OpenAction, no form: the one page's /AA /O holds a JavaScript action (app.alert('page opened')). PDF.js reports no script for a file like this, as its check for scripts ignores page actions",
    }
  )
}

writeAnnotDirect()
writeFormTree()
writeFormRollover()
writeScriptPageOnly()

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
console.log(`wrote ${Object.keys(entries).length} form edge fixtures`)
