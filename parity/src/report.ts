// Browser side of the report and the baselines: PNG in and out, and the report page.
import { commands } from 'vitest/browser'

import type { Comparison } from './compare'
import type { TextComparison } from './text'

/** A point in pixels. */
interface Point {
  x: number
  y: number
}

declare module 'vitest/browser' {
  interface BrowserCommands {
    /**
     * Writes `content` to `path`, relative to the package and inside `.report/` or `baselines/`
     * only. `encoding` is how `content` is written: `base64` for a PNG, `utf8` for text.
     */
    writeParityFile: (
      path: string,
      content: string,
      encoding: 'base64' | 'utf8'
    ) => Promise<void>
    /** The file at `path`, relative to the package, in base64; null when there is none. */
    readParityFile: (path: string) => Promise<string | null>
  }
}

declare module 'vitest' {
  interface ProvidedContext {
    /**
     * Set by `PARITY_REPORT`: `differences` (`=1`) writes `.report/index.html` with the pages that
     * are not the same, `all` with every page, and `off` writes nothing.
     */
    parityReport: 'off' | 'differences' | 'all'
    /**
     * Set by `PARITY_BASELINE=<fixture>[,<fixture>…]`: write those fixtures' baselines. Empty when
     * unset.
     */
    parityBaseline: string
  }
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  return bytes
}

/** `img` as PNG bytes, through the browser's own encoder. */
export async function encodePng(img: ImageData): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(img.width, img.height)
  canvas.getContext('2d')!.putImageData(img, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}

/** PNG bytes as pixels, with no colour conversion. */
export async function decodePng(bytes: Uint8Array): Promise<ImageData> {
  const bitmap = await createImageBitmap(
    new Blob([bytes as BlobPart], { type: 'image/png' }),
    {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    }
  )
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

export async function writePng(path: string, img: ImageData): Promise<void> {
  await commands.writeParityFile(path, toBase64(await encodePng(img)), 'base64')
}

/** The pixels of the PNG at `path`, relative to the package; null when there is none. */
export async function readPng(path: string): Promise<ImageData | null> {
  const text = await commands.readParityFile(path)
  return text === null ? null : decodePng(fromBase64(text))
}

/** Where page `page` of `name`'s baseline lives, relative to the package. */
export const baselinePath = (name: string, page: number) =>
  `baselines/${name}-${page}.png`

/** One page, as the report lists it. */
export interface ReportPage {
  fixture: string
  page: number
  /** The recorded verdict's state, or `none`. */
  state: string
  reason: string
  measured: Comparison
  /** Image files, relative to `.report/`. `left` is PDF.js or the baseline. */
  left: string
  leftLabel: string
  right: string
  diff: string
}

const escape = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!
  )

const percent = (n: number) => `${(n * 100).toFixed(2)}%`

/** The report page: the pages given, most different first, under `title`. */
export function reportHtml(
  pages: ReportPage[],
  generated: string,
  title = 'Rendering parity'
): string {
  const sorted = [...pages].sort(
    (a, b) =>
      b.measured.share - a.measured.share ||
      b.measured.worstBlock - a.measured.worstBlock ||
      b.measured.unmatchedRun - a.measured.unmatchedRun ||
      b.measured.flatShare - a.measured.flatShare
  )
  const rows = sorted.map(
    (p) => `<section>
<h2>${escape(p.fixture)}, page ${p.page + 1} <small>${escape(p.state)}</small></h2>
<p>Blurred: ${percent(p.measured.share)} of the page, ${percent(p.measured.worstBlock)} of the worst 16 × 16 block (red). Unmatched: longest run ${p.measured.unmatchedRun} px (blue). Flat areas: ${percent(p.measured.flatShare)} of the page, ${percent(p.measured.flatBlock)} of the worst block (orange).</p>
<p>${p.reason === '' ? '<em>No reason recorded.</em>' : escape(p.reason)}</p>
<div class="row">
<figure><img src="${escape(p.left)}" loading="lazy"><figcaption>${escape(p.leftLabel)}</figcaption></figure>
<figure><img src="${escape(p.right)}" loading="lazy"><figcaption>Engine</figcaption></figure>
<figure><img src="${escape(p.diff)}" loading="lazy"><figcaption>Difference</figcaption></figure>
</div>
</section>`
  )
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>${escape(title)}</title>
<style>
body { font: 14px/1.4 system-ui, sans-serif; margin: 16px; background: #fff; color: #111; }
.row { display: flex; gap: 8px; }
figure { margin: 0; flex: 1; min-width: 0; }
img { width: 100%; border: 1px solid #ccc; }
section { border-top: 1px solid #ddd; padding-top: 8px; margin-top: 16px; }
small { color: #666; font-weight: normal; }
</style>
<h1>${escape(title)}</h1>
<p>${sorted.length} pages listed, ${escape(generated)}.</p>
${rows.join('\n')}
</html>
`
}

export async function writeText(path: string, text: string): Promise<void> {
  await commands.writeParityFile(path, text, 'utf8')
}

/** Writes the report page of `pages` to `path`, under `title`. */
export async function writeReport(
  pages: ReportPage[],
  path = '.report/index.html',
  title?: string
): Promise<void> {
  await writeText(path, reportHtml(pages, new Date().toISOString(), title))
}

/** One page's text, as the text report lists it. Points are pixels of `image`. */
export interface TextReportPage {
  fixture: string
  page: number
  state: string
  reason: string
  measured: TextComparison
  /** The joined text: PDF.js, then the engine. */
  strings: [string, string]
  /** The engine's drawing of the page, relative to `.report/`, and its size. */
  image: string
  width: number
  height: number
  /** Each reader's item boxes (corners in drawing order) and character centres. */
  pdfjs: { quads: Point[][]; centres: Point[] }
  engine: { quads: Point[][]; centres: Point[] }
}

/** `s` escaped, with the character at `at` (if any) marked. */
function marked(s: string, at: number | undefined): string {
  if (at === undefined || at > s.length) return escape(s)
  const mark = s.slice(at, at + 1)
  return `${escape(s.slice(0, at))}<mark>${mark === '' ? '&nbsp;' : escape(mark)}</mark>${escape(s.slice(at + 1))}`
}

const COLOURS = { pdfjs: '#0060df', engine: '#d70022' }

function overlay(p: TextReportPage): string {
  const shapes = (['pdfjs', 'engine'] as const).map((who) => {
    const colour = COLOURS[who]
    const quads = p[who].quads
      .map(
        (q) =>
          `<polygon points="${q.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')}" fill="none" stroke="${colour}" stroke-width="1"/>`
      )
      .join('')
    const dots = p[who].centres
      .map(
        (c) =>
          `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="1.5" fill="${colour}"/>`
      )
      .join('')
    return quads + dots
  })
  return `<svg viewBox="0 0 ${p.width} ${p.height}" preserveAspectRatio="none">${shapes.join('')}</svg>`
}

/**
 * The text report: each page's two strings, the first difference marked, and both readers'
 * boxes.
 */
export function textReportHtml(pages: TextReportPage[], generated: string): string {
  // Pages whose strings differ first, then the largest offset (NaN counts as the largest), then by
  // fixture and page, so the order is always defined.
  const offset = (p: TextReportPage) =>
    Number.isNaN(p.measured.worstOffset) ? Infinity : p.measured.worstOffset
  const sorted = [...pages].sort(
    (a, b) =>
      Number(b.measured.firstDifference !== undefined) -
        Number(a.measured.firstDifference !== undefined) ||
      (offset(a) === offset(b) ? 0 : offset(a) < offset(b) ? 1 : -1) ||
      a.fixture.localeCompare(b.fixture) ||
      a.page - b.page
  )
  const rows = sorted.map((p) => {
    const m = p.measured
    const at = m.firstDifference ?? m.worstAt
    const summary =
      m.firstDifference !== undefined
        ? `The text differs from character ${m.firstDifference}.`
        : `Worst character at ${m.worstAt ?? '-'}, ${m.worstOffset.toFixed(3)} of the font size apart (characters ${m.charOffset.toFixed(3)}, compared at item boundaries ${m.itemOffset.toFixed(3)}).`
    return `<section>
<h2>${escape(p.fixture)}, page ${p.page + 1} <small>${escape(p.state)}</small></h2>
<p>${summary}</p>
<p>${p.reason === '' ? '<em>No reason recorded.</em>' : escape(p.reason)}</p>
<p class="text"><b>PDF.js</b> ${marked(p.strings[0], at)}</p>
<p class="text"><b>Engine</b> ${marked(p.strings[1], at)}</p>
<figure class="page"><div class="frame"><img src="${escape(p.image)}" loading="lazy">${overlay(p)}</div><figcaption>The engine's drawing: PDF.js's boxes and character centres in blue, the engine's in red</figcaption></figure>
</section>`
  })
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Text parity</title>
<style>
body { font: 14px/1.4 system-ui, sans-serif; margin: 16px; background: #fff; color: #111; }
section { border-top: 1px solid #ddd; padding-top: 8px; margin-top: 16px; }
small { color: #666; font-weight: normal; }
.text { font-family: ui-monospace, monospace; white-space: pre-wrap; word-break: break-all; }
mark { background: #ffd400; }
.page { margin: 0; max-width: 900px; }
.frame { position: relative; }
.frame img { width: 100%; display: block; }
.frame svg { position: absolute; inset: 0; width: 100%; height: 100%; }
</style>
<h1>Text parity</h1>
<p>${sorted.length} pages listed, ${escape(generated)}.</p>
${rows.join('\n')}
</html>
`
}

/** One fixture's links and outline, as the links report lists them. */
export interface LinksReportEntry {
  fixture: string
  /** `links` or `outline`. */
  part: string
  /** 0-based; absent for the outline. */
  page?: number
  state: string
  reason: string
  lines: string[]
}

/** The links report: each page's link differences and each outline's, one line each. */
export function linksReportHtml(entries: LinksReportEntry[], generated: string): string {
  const rows = entries.map(
    (e) => `<section>
<h2>${escape(e.fixture)}, ${e.page === undefined ? 'outline' : `links on page ${e.page + 1}`} <small>${escape(e.state)}</small></h2>
<p>${e.reason === '' ? '<em>No reason recorded.</em>' : escape(e.reason)}</p>
${e.lines.length === 0 ? '<p>The same.</p>' : `<ul>${e.lines.map((l) => `<li>${escape(l)}</li>`).join('')}</ul>`}
</section>`
  )
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Link and outline parity</title>
<style>
body { font: 14px/1.4 system-ui, sans-serif; margin: 16px; background: #fff; color: #111; }
section { border-top: 1px solid #ddd; padding-top: 8px; margin-top: 16px; }
small { color: #666; font-weight: normal; }
li { font-family: ui-monospace, monospace; word-break: break-all; }
</style>
<h1>Link and outline parity</h1>
<p>${entries.length} listed, ${escape(generated)}.</p>
${rows.join('\n')}
</html>
`
}

/** One fixture's differences in one part read from the file, as the data report lists them. */
export interface DataReportEntry {
  fixture: string
  /** `facts`, `form`, `annotations`, `scripts`. */
  part: string
  /** 0-based; absent for a part read once for the whole file. */
  page?: number
  state: string
  reason: string
  lines: string[]
}

/** A table of the differences in what the readers read from the file, one row per difference. */
export function dataReportHtml(
  entries: DataReportEntry[],
  generated: string,
  title: string
): string {
  const rows = entries.flatMap((e) =>
    (e.lines.length === 0 ? ['The same.'] : e.lines).map(
      (line) => `<tr>
<td>${escape(e.fixture)}</td><td>${escape(e.part)}</td><td>${e.page === undefined ? '' : e.page + 1}</td><td>${escape(e.state)}</td><td>${e.reason === '' ? '<em>No reason recorded.</em>' : escape(e.reason)}</td><td class="line">${escape(line)}</td>
</tr>`
    )
  )
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>${escape(title)}</title>
<style>
body { font: 14px/1.4 system-ui, sans-serif; margin: 16px; background: #fff; color: #111; }
table { border-collapse: collapse; width: 100%; }
th, td { border-top: 1px solid #ddd; padding: 4px 8px; text-align: left; vertical-align: top; }
.line { font-family: ui-monospace, monospace; word-break: break-all; }
</style>
<h1>${escape(title)}</h1>
<p>${entries.length} listed, ${escape(generated)}.</p>
<table>
<thead><tr><th>Fixture</th><th>Part</th><th>Page</th><th>Verdict</th><th>Reason</th><th>Difference</th></tr></thead>
<tbody>
${rows.join('\n')}
</tbody>
</table>
</html>
`
}
