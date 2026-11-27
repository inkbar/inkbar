// The report a run with `PARITY_REPORT=1` writes to `.report/`: each drawing that differs from its
// baseline, with the baseline and the difference beside it, and each data difference.
import { writePng, writeText } from './baselines'
import { describePixels, differenceImage, pixelDifference } from './differences'

/** One drawing that differs from its baseline, as the report lists it. */
interface ReportImage {
  /** What was drawn: `text-simple, page 1`. */
  title: string
  /** What differs, in words. */
  summary: string
  /** Image files, relative to `.report/`; `baseline` and `diff` absent when there is none. */
  now: string
  baseline?: string
  diff?: string
}

/** One part read from a fixture that differs from its baseline. */
interface ReportData {
  title: string
  lines: string[]
}

const escape = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!
  )

const STYLE = `body { font: 14px/1.4 system-ui, sans-serif; margin: 16px; background: #fff; color: #111; }
.row { display: flex; gap: 8px; }
figure { margin: 0; flex: 1; min-width: 0; }
img { width: 100%; border: 1px solid #ccc; image-rendering: pixelated; }
section { border-top: 1px solid #ddd; padding-top: 8px; margin-top: 16px; }
li { font-family: ui-monospace, monospace; word-break: break-all; }`

function page(title: string, count: number, body: string): string {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>${escape(title)}</title>
<style>
${STYLE}
</style>
<h1>${escape(title)}</h1>
<p>${count} listed.</p>
${body}
</html>
`
}

/** A page of the report for one test file, written when the file's tests are done. */
export class Report {
  private readonly images: ReportImage[] = []
  private readonly data: ReportData[] = []

  /** `file` is the page's name under `.report/`; `title` its heading. */
  constructor(
    private readonly file: string,
    private readonly title: string
  ) {}

  /**
   * Writes the drawing `now`, its baseline (when there is one) and their difference under
   * `.report/`, named by `stem`, and lists them under `title`.
   */
  async image(
    title: string,
    stem: string,
    now: ImageData,
    baseline: ImageData | null
  ): Promise<void> {
    const entry: ReportImage = { title, summary: 'No baseline.', now: `${stem}-now.png` }
    await writePng(`.report/${entry.now}`, now)
    if (baseline !== null) {
      entry.baseline = `${stem}-baseline.png`
      await writePng(`.report/${entry.baseline}`, baseline)
      if (baseline.width === now.width && baseline.height === now.height) {
        entry.diff = `${stem}-diff.png`
        await writePng(`.report/${entry.diff}`, differenceImage(baseline, now))
        entry.summary = `${describePixels(pixelDifference(baseline, now))}.`
      } else {
        entry.summary = `The baseline is ${baseline.width} × ${baseline.height} px, the drawing ${now.width} × ${now.height} px.`
      }
    }
    this.images.push(entry)
  }

  /** Lists the differences `lines` of one part under `title`. */
  lines(title: string, lines: string[]): void {
    this.data.push({ title, lines })
  }

  /** Writes the page under `.report/`, when it lists anything. */
  async write(): Promise<void> {
    if (this.images.length + this.data.length === 0) return
    const figure = (src: string | undefined, caption: string) =>
      src === undefined
        ? ''
        : `<figure><a href="${escape(src)}"><img src="${escape(src)}" loading="lazy"></a><figcaption>${caption}</figcaption></figure>`
    const images = this.images.map(
      (e) => `<section>
<h2>${escape(e.title)}</h2>
<p>${escape(e.summary)}</p>
<div class="row">
${figure(e.baseline, 'Baseline')}
${figure(e.now, 'Now')}
${figure(e.diff, 'Difference: red where the pixels differ')}
</div>
</section>`
    )
    const data = this.data.map(
      (e) => `<section>
<h2>${escape(e.title)}</h2>
<ul>${e.lines.map((l) => `<li>${escape(l)}</li>`).join('')}</ul>
</section>`
    )
    await writeText(
      `.report/${this.file}`,
      page(
        this.title,
        this.images.length + this.data.length,
        [...images, ...data].join('\n')
      )
    )
  }
}
