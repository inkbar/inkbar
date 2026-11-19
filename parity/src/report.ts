// Browser side of the report and the baselines: PNG in and out, and the report page.
import { commands } from 'vitest/browser'

import type { Comparison } from './compare'

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

/** The report page: the pages given, most different first. */
export function reportHtml(pages: ReportPage[], generated: string): string {
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
<title>Rendering parity</title>
<style>
body { font: 14px/1.4 system-ui, sans-serif; margin: 16px; background: #fff; color: #111; }
.row { display: flex; gap: 8px; }
figure { margin: 0; flex: 1; min-width: 0; }
img { width: 100%; border: 1px solid #ccc; }
section { border-top: 1px solid #ddd; padding-top: 8px; margin-top: 16px; }
small { color: #666; font-weight: normal; }
</style>
<h1>Rendering parity</h1>
<p>${sorted.length} pages listed, ${escape(generated)}.</p>
${rows.join('\n')}
</html>
`
}

export async function writeText(path: string, text: string): Promise<void> {
  await commands.writeParityFile(path, text, 'utf8')
}

export async function writeReport(pages: ReportPage[]): Promise<void> {
  await writeText('.report/index.html', reportHtml(pages, new Date().toISOString()))
}
