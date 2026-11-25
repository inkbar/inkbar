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
 * `script-page-only` runs JavaScript from a page's /AA and nowhere else, `form-values` holds
 * field values written in ways readers disagree on (/I beside /V, /V null, names in a value list,
 * Launch and GoToR files, an /Opt index as a value), `border-dashes` holds dash arrays a
 * reader may take or refuse, and `form-scripted-kinds` holds JavaScript on fields of every kind
 * and in every place a file holds it.
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

/** A form XObject of `width` by `height` drawing `draw`, with Helvetica as /Helv. */
const look = (width: number, height: number, draw: string) =>
  stream(
    draw,
    `/Type /XObject /Subtype /Form /BBox [0 0 ${width} ${height}] /Resources << /Font << /Helv 6 0 R >> >>`
  )

/** A grey box with a black outline and `text` in it, `width` by `height`. */
const boxLook = (width: number, height: number, text = '') =>
  look(
    width,
    height,
    `0.9 g 0 0 ${width} ${height} re f 0 G 1 w 0.5 0.5 ${width - 1} ${height - 1} re S` +
      (text ? ` BT /Helv 10 Tf 0 g 4 ${height / 2 - 3} Td (${text}) Tj ET` : '')
  )

function writeFormValues() {
  // Objects 7 to 16 are the field widgets, in this order, with their looks at 17 to 26; 27 to 29
  // are a list field with a separate widget kid and its look.
  const widget = (rect: string, ap: number, keys: string) =>
    `<< /Type /Annot /Subtype /Widget /P 4 0 R /Rect ${rect} /F 4 /AP << /N ${ap} 0 R >> ${keys} >>`
  const row = (i: number) => `[72 ${700 - i * 50} 272 ${730 - i * 50}]`
  write(
    'form-values',
    buildPdf([
      '<< /Type /Catalog /Pages 3 0 R /AcroForm << /Fields [7 0 R 8 0 R 9 0 R 10 0 R 11 0 R 12 0 R 13 0 R 14 0 R 15 0 R 27 0 R] /DR << /Font << /Helv 6 0 R >> >> /DA (/Helv 10 Tf 0 g) >> >>',
      INFO,
      PAGES,
      page(
        '/Annots [7 0 R 8 0 R 9 0 R 10 0 R 11 0 R 12 0 R 13 0 R 14 0 R 16 0 R 28 0 R]'
      ),
      stream(label(['Field values written in ways readers disagree on'])),
      HELVETICA,
      // 7: a multi-select list whose /I names b and c while /V says a.
      widget(
        row(0),
        17,
        '/FT /Ch /T (listbox) /Ff 2097152 /Opt [(a) (b) (c)] /V (a) /I [1 2]'
      ),
      // 8: a combo whose /I names z while /V says x.
      widget(
        row(1),
        18,
        '/FT /Ch /T (combo) /Ff 131072 /Opt [(x) (y) (z)] /V (x) /I [2]'
      ),
      // 9 and 10: a /V written as null, and no /V, each beside a /DV.
      widget(row(2), 19, '/FT /Tx /T (nulled) /V null /DV (default text)'),
      widget(row(3), 20, '/FT /Tx /T (unset) /DV (default text)'),
      // 11: a multi-select list whose /V holds a name and a string.
      widget(
        row(4),
        21,
        '/FT /Ch /T (names) /Ff 2097152 /Opt [(Alpha) (beta)] /V [/Alpha (beta)]'
      ),
      // 12 to 14: push buttons that launch a file, open one remotely, and launch a local path.
      widget(
        row(5),
        22,
        '/FT /Btn /Ff 65536 /T (launch) /A << /S /Launch /F (https://example.com/launch.pdf) >>'
      ),
      widget(
        row(6),
        23,
        '/FT /Btn /Ff 65536 /T (remote) /A << /S /GoToR /F << /Type /Filespec /F (other.pdf) /UF (ftp://example.com/other.pdf) >> >>'
      ),
      widget(
        row(7),
        24,
        '/FT /Btn /Ff 65536 /T (local) /A << /S /Launch /F (file:///usr/bin/app) >>'
      ),
      // 15 and 16: a checkbox field with /Opt and one widget; its /DV (2) is an /Opt index.
      '<< /FT /Btn /T (consent) /Opt [(Agreed) (Declined) (Maybe)] /V /Yes /DV (2) /Kids [16 0 R] >>',
      `<< /Type /Annot /Subtype /Widget /Parent 15 0 R /P 4 0 R /Rect [72 300 102 330] /F 4 /AS /Yes /AP << /N << /Yes 25 0 R /Off 26 0 R >> >> >>`,
      boxLook(200, 30, 'b, c'),
      boxLook(200, 30, 'z'),
      boxLook(200, 30),
      boxLook(200, 30, 'default text'),
      boxLook(200, 30, 'Alpha, beta'),
      boxLook(200, 30, 'Launch'),
      boxLook(200, 30, 'Remote'),
      boxLook(200, 30, 'Local'),
      look(30, 30, '0.9 g 0 0 30 30 re f 0 g 6 6 18 18 re f'),
      look(30, 30, '0.9 g 0 0 30 30 re f'),
      // 27 and 28: a multi-select list whose /I [2] is on the field and whose widget is a
      // separate kid without one, while /V says p.
      '<< /FT /Ch /T (kidlist) /Ff 2097152 /Opt [(p) (q) (r)] /V (p) /I [2] /Kids [28 0 R] >>',
      widget('[300 300 500 330]', 29, '/Parent 27 0 R'),
      boxLook(200, 30, 'p'),
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'Fields with explicit normal appearances whose values are written in ways readers disagree on. listbox (multi-select, /Opt a b c) has /V (a) and /I [1 2]; combo (/Opt x y z) has /V (x) and /I [2]. nulled is a text field with /V null and /DV (default text); unset has the same /DV and no /V. names is a multi-select list whose /V is [/Alpha (beta)]. launch is a push button with /A /Launch /F (https://example.com/launch.pdf), remote one with /A /GoToR whose /F is a file specification (/F other.pdf, /UF ftp://example.com/other.pdf), local one with /A /Launch /F (file:///usr/bin/app). consent is a checkbox field with /Opt [Agreed Declined Maybe], /V /Yes, /DV (2) and one widget with Yes and Off states. kidlist is a multi-select list field with /Opt [p q r], /V (p) and /I [2] on the field dictionary, and one widget that is a separate kid with no /I',
      annotations: { Widget: 10 },
    }
  )
}

function writeScriptedKinds() {
  /** A JavaScript action, `rest` its other entries. */
  const js = (source: string, rest = '') => `<< /S /JavaScript /JS (${source}) ${rest}>>`
  const row = (i: number, width = 200) =>
    `[72 ${700 - i * 45} ${72 + width} ${725 - i * 45}]`
  // Objects 7 on are the fields and widgets in this order; the looks of the toggles are 28 and 29,
  // and every other widget shows the box at 30.
  const at = (rect: string, look = '/AP << /N 30 0 R >>') =>
    `/P 4 0 R /Rect ${rect} /F 4 ${look}`
  const on = (state: string) => `/AP << /N << /${state} 28 0 R /Off 29 0 R >> >>`
  write(
    'form-scripted-kinds',
    buildPdf([
      // 1: the catalog, with document scripts (alpha's action has a /Next), an open action with a
      // /Next, and document actions.
      `<< /Type /Catalog /Pages 3 0 R /AcroForm << /Fields [7 0 R 8 0 R 9 0 R 10 0 R 11 0 R 12 0 R 15 0 R 18 0 R 21 0 R 22 0 R 24 0 R 31 0 R 33 0 R 35 0 R 38 0 R] /DR << /Font << /Helv 6 0 R >> >> /DA (/Helv 10 Tf 0 g) /CO [7 0 R 22 0 R 12 0 R] >> /Names << /JavaScript << /Names [(alpha) 25 0 R (beta) 26 0 R] >> >> /OpenAction 27 0 R /AA << /WC ${js('var closing = true;')} /WS ${js('var saving = true;')} /DP ${js('var printed = true;')} >> >>`,
      INFO,
      PAGES,
      page(
        `/Annots [7 0 R 8 0 R 9 0 R 10 0 R 11 0 R 13 0 R 14 0 R 16 0 R 17 0 R 19 0 R 20 0 R 21 0 R 23 0 R 24 0 R 32 0 R 34 0 R 36 0 R 37 0 R 38 0 R] /AA << /O ${js("var pageOpened = 'yes';")} /C ${js('var pageClosed = true;')} >>`
      ),
      stream(label(['Fields of every kind with scripts, and scripts of every place'])),
      HELVETICA,
      // 7: a comb text field with keystroke, format, validate (with white space around it) and
      // calculate scripts.
      `<< /Type /Annot /Subtype /Widget /FT /Tx /T (amount) /Ff 16777216 /MaxLen 6 ${at(row(0))} /AA << /K ${js('AFNumber_Keystroke(0, 0, 0, 0, "", true)')} /F ${js('AFNumber_Format(0, 0, 0, 0, "", true)')} /V ${js('  event.rc = event.value < 1000000;  ')} /C ${js('event.value = 7')} >> >>`,
      // 8: a time field, by the number of a standard format.
      `<< /Type /Annot /Subtype /Widget /FT /Tx /T (start) ${at(row(1))} /AA << /K ${js('AFTime_Keystroke(2);')} /F ${js('AFTime_Format(2);')} >> >>`,
      // 9: a date field with a format script and no keystroke script.
      `<< /Type /Annot /Subtype /Widget /FT /Tx /T (due) ${at(row(2))} /AA << /F ${js('AFDate_FormatEx("mmm d, yyyy");')} >> >>`,
      // 10: a combo box with keystroke and validate scripts.
      `<< /Type /Annot /Subtype /Widget /FT /Ch /T (size) /Ff 131072 /Opt [(S) (M) (L)] /V (M) ${at(row(3))} /AA << /K ${js('event.rc = true')} /V ${js("event.rc = event.value != 'L'")} >> >>`,
      // 11: a multi-select list with export and display values and a focus script.
      `<< /Type /Annot /Subtype /Widget /FT /Ch /T (colours) /Ff 2097152 /Opt [[(r) (Red)] [(g) (Green)] [(b) (Blue)]] /V [(r) (g)] ${at(row(4))} /AA << /Fo ${js('var focused = true')} >> >>`,
      // 12 to 14: a multiline text field with a blur script and two widgets, the second with a
      // focus script of its own.
      `<< /FT /Tx /T (note) /Ff 4096 /V (two places) /Kids [13 0 R 14 0 R] /AA << /Bl ${js('var blurred = true')} >> >>`,
      `<< /Type /Annot /Subtype /Widget /Parent 12 0 R ${at(row(5))} >>`,
      `<< /Type /Annot /Subtype /Widget /Parent 12 0 R ${at('[300 475 400 500]')} /AA << /Fo ${js('var noteFocused = true')} >> >>`,
      // 15 to 17: a radio group whose /Kids lists the b widget before the a widget, which /Annots
      // lists first; b has a mouse-up script.
      `<< /FT /Btn /T (pick) /Ff 49152 /V /b /Kids [17 0 R 16 0 R] >>`,
      `<< /Type /Annot /Subtype /Widget /Parent 15 0 R ${at('[72 430 92 450]', '')} /AS /Off ${on('a')} >>`,
      `<< /Type /Annot /Subtype /Widget /Parent 15 0 R ${at('[102 430 122 450]', '')} /AS /b ${on('b')} /AA << /U ${js('var pickedB = true')} >> >>`,
      // 18 to 20: a checkbox field with two widgets of different on-states, y with a mouse-down
      // script.
      `<< /FT /Btn /T (extras) /V /x /Kids [19 0 R 20 0 R] >>`,
      `<< /Type /Annot /Subtype /Widget /Parent 18 0 R ${at('[72 385 92 405]', '')} /AS /x ${on('x')} >>`,
      `<< /Type /Annot /Subtype /Widget /Parent 18 0 R ${at('[102 385 122 405]', '')} /AS /Off ${on('y')} /AA << /D ${js('var pressedY = true')} >> >>`,
      // 21: a signature field.
      `<< /Type /Annot /Subtype /Widget /FT /Sig /T (sig) ${at(row(7))} >>`,
      // 22 and 23: a non-terminal field over a text field with a keystroke script.
      `<< /T (person) /Kids [23 0 R] >>`,
      `<< /Type /Annot /Subtype /Widget /FT /Tx /T (first) /Parent 22 0 R ${at(row(8))} /AA << /K ${js('event.change = event.change.toUpperCase()')} >> >>`,
      // 24: a push button whose JavaScript action has a /Next, and a page-open script.
      `<< /Type /Annot /Subtype /Widget /FT /Btn /Ff 65536 /T (go) ${at(row(9, 100))} /A ${js("app.alert('go')", `/Next ${js('var went = true')}`)} /AA << /PO ${js('var shown = true')} >> >>`,
      // 25 and 26: the document scripts; alpha's action has a /Next, beta has white space.
      js('var alpha = 1;', `/Next ${js('var alphaNext = 1;')}`),
      js('  var beta = 2;  '),
      // 27: the open action, with a /Next.
      js('var started = true;', `/Next ${js('var startedNext = true;')}`),
      look(20, 20, '0 g 4 4 12 12 re f'),
      look(20, 20, '0 G 0.5 0.5 19 19 re S'),
      boxLook(200, 25),
      // 31 to 34: two fields both named twin, each a dictionary over one widget, with a keystroke
      // and a format script.
      `<< /FT /Tx /T (twin) /Kids [32 0 R] /AA << /K ${js('var firstTwin = true')} >> >>`,
      `<< /Type /Annot /Subtype /Widget /Parent 31 0 R ${at('[300 655 400 680]')} >>`,
      `<< /FT /Tx /T (twin) /Kids [34 0 R] /AA << /F ${js('var secondTwin = true')} >> >>`,
      `<< /Type /Annot /Subtype /Widget /Parent 33 0 R ${at('[300 610 400 635]')} >>`,
      // 35 to 37: a checkbox field (/V q) whose /Kids lists its unchecked widget r before its
      // checked widget q, the other way round from /Annots.
      `<< /FT /Btn /T (flags) /V /q /Kids [37 0 R 36 0 R] >>`,
      `<< /Type /Annot /Subtype /Widget /Parent 35 0 R ${at('[300 385 320 405]', '')} /AS /q ${on('q')} /AA << /U ${js('var flagged = true')} >> >>`,
      `<< /Type /Annot /Subtype /Widget /Parent 35 0 R ${at('[330 385 350 405]', '')} /AS /Off ${on('r')} >>`,
      // 38: a date field whose one Format action has a date /Next, and no keystroke script.
      `<< /Type /Annot /Subtype /Widget /FT /Tx /T (stamp) ${at('[300 565 400 590]')} /AA << /F ${js('AFDate_FormatEx("dd/mm/yyyy");', `/Next ${js('AFDate_FormatEx("mm/dd/yyyy");')}`)} >> >>`,
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'Form fields of every kind with JavaScript, and scripts in every place a file holds them; every widget has a normal appearance stream. amount is a comb text field (/MaxLen 6) with keystroke, format, validate (written with white space around it) and calculate scripts; start a time field with AFTime_Keystroke(2) and AFTime_Format(2); due a date field with only AFDate_FormatEx("mmm d, yyyy"). size is a combo (/Opt S M L, /V M) with keystroke and validate scripts; colours a multi-select list with export and display values, /V [r g] and a focus script. note is a multiline text field with a blur script on the field and two widgets, the second with a focus script of its own. pick is a radio group (/V b) whose /Kids lists its b widget before its a widget, the other way round from /Annots, with a mouse-up script on b; extras a checkbox field (/V x) with widgets of on-states x and y, a mouse-down script on y. sig is a signature field. person is a non-terminal field over person.first, a text field with a keystroke script. go is a push button whose JavaScript action has a JavaScript /Next and whose widget has a page-open script. The document has scripts alpha (its action with a JavaScript /Next) and beta (written with white space around it), an open action with a JavaScript /Next, will-close, will-save and did-print actions, and /CO [amount person note]. The page has open and close scripts. twin is two fields of that one name, each a dictionary over one widget, the first with a keystroke script and the second with a format script. flags is a checkbox field (/V q) whose /Kids lists its unchecked widget (on-state r) before its checked one (q), the other way round from /Annots, with a mouse-up script on q. stamp is a date field whose one Format action has a date /Next and which has no keystroke script',
      annotations: { Widget: 19 },
    }
  )
}

function writeBorderDashes() {
  const square = (y: number, ap: number, keys: string) =>
    `<< /Type /Annot /Subtype /Square /Rect [72 ${y} 172 ${y + 50}] /C [0 0 1] /F 4 /AP << /N ${ap} 0 R >> ${keys} >>`
  const field = (y: number, ap: number, name: string, keys: string) =>
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T (${name}) /P 4 0 R /Rect [300 ${y} 500 ${y + 30}] /F 4 /AP << /N ${ap} 0 R >> ${keys} >>`
  const squareLook = look(100, 50, '0 0 1 RG 1 w 0.5 0.5 99 49 re S')
  write(
    'border-dashes',
    buildPdf([
      '<< /Type /Catalog /Pages 3 0 R /AcroForm << /Fields [11 0 R 12 0 R 13 0 R] /DR << /Font << /Helv 6 0 R >> >> /DA (/Helv 10 Tf 0 g) >> >>',
      INFO,
      PAGES,
      page('/Annots [7 0 R 8 0 R 9 0 R 10 0 R 11 0 R 12 0 R 13 0 R]'),
      stream(
        label(['Squares on the left and text fields on the right, with dashed borders'])
      ),
      HELVETICA,
      // 7 to 10: Squares with a /BS dash, a /Border dash, and two dashes a reader refuses.
      square(650, 14, '/BS << /W 2 /S /D /D [3 2] >>'),
      square(570, 15, '/Border [0 0 1 [4 2]]'),
      square(490, 16, '/BS << /W 2 /S /D /D [-1 2] >>'),
      square(410, 17, '/Border [0 0 1 [0 0]]'),
      // 11 to 13: text fields with the same three kinds of dash.
      field(650, 18, 'bs-dash', '/BS << /W 1 /S /D /D [3 2] >>'),
      field(570, 19, 'border-dash', '/Border [0 0 2 [4 2]]'),
      field(490, 20, 'bad-dash', '/BS << /W 1 /D [-3] >>'),
      squareLook,
      squareLook,
      squareLook,
      squareLook,
      boxLook(200, 30),
      boxLook(200, 30),
      boxLook(200, 30),
    ]),
    {
      pages: 1,
      opens: true,
      describes:
        'Four Squares and three text field widgets, each with a normal appearance stream. The Squares have, from the top, /BS << /W 2 /S /D /D [3 2] >>, /Border [0 0 1 [4 2]], /BS << /W 2 /S /D /D [-1 2] >> (a negative dash) and /Border [0 0 1 [0 0]] (an all-zero dash). The fields are bs-dash (/BS << /W 1 /S /D /D [3 2] >>), border-dash (/Border [0 0 2 [4 2]]) and bad-dash (/BS << /W 1 /D [-3] >>)',
      annotations: { Square: 4, Widget: 3 },
    }
  )
}

writeAnnotDirect()
writeFormTree()
writeFormRollover()
writeScriptPageOnly()
writeFormValues()
writeBorderDashes()
writeScriptedKinds()

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
