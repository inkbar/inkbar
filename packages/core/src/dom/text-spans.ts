// The page's transparent text layer, built from a `TextContent`: one span per run, laid out in
// the unrotated page box so the theme's text-layer rules (the ones written for PDF.js's layer)
// size, turn and place it. Nothing here reads PDF.js.
import type { PageTransform } from './transform'
import type { PageInfo } from '../model/pages'
import type { TextContent, TextItem } from '../model/text'

/** @internal */
export interface MountTextSpansOptions {
  content: TextContent
  /** One per item. Absent: `sans-serif` for every item. */
  families?: readonly string[]
  /**
   * One per item: how far its baseline lies from its quad's `p3`-`p4` edge towards `p1`. An item
   * without a finite one has its span centred on its box.
   */
  baselines?: readonly number[]
  info: PageInfo
  container: HTMLElement
  transform: PageTransform
}

const DEGREES = 180 / Math.PI
/**
 * The share of a span's line box, one font size high, that stands above the baseline: the
 * ascent core's PDF.js reader gives a font PDF.js has no figures for.
 */
const LINE_ASCENT = 0.75

/** Below this, in degrees, a run is taken as level and gets no `--rotate`. */
const LEVEL = 1e-6

/** Percentages to four places: well under a CSS pixel on any page at any zoom. */
const percent = (n: number): string => `${Math.round(n * 1e6) / 1e4}%`

/** One context for every mount, to measure strings in a family at a size. Null once it failed. */
let measuring: CanvasRenderingContext2D | null | undefined

function measureContext(doc: Document): CanvasRenderingContext2D | null {
  if (measuring === undefined) measuring = doc.createElement('canvas').getContext('2d')
  return measuring
}

/** The browser's smallest font size, in CSS pixels per pixel asked for, by document. */
const minFontSizes = new WeakMap<Document, number>()

/**
 * How large the browser draws text asked for at 1px: 1 unless it enforces a minimum font size.
 * The theme draws spans this many times larger and scales them back down, so a minimum does not
 * swell small text. Measured with one element laid out once, and kept per document once a
 * measurement succeeds. A document not laid out yet measures 0: 1 stands in, and the next mount
 * measures again. The probe sets its own box inline, so a host's rules for every div do not
 * change its height.
 */
function minFontSize(doc: Document): number {
  const kept = minFontSizes.get(doc)
  if (kept !== undefined) return kept
  const probe = doc.createElement('div')
  probe.style.cssText =
    'position:absolute;opacity:0;pointer-events:none;box-sizing:content-box;' +
    'margin:0;border:0;padding:0;height:auto;min-height:0;max-height:none;' +
    'line-height:1;font-size:1px;'
  probe.textContent = 'X'
  ;(doc.body ?? doc.documentElement).append(probe)
  const height = probe.getBoundingClientRect().height
  probe.remove()
  if (!(height > 0)) return 1
  minFontSizes.set(doc, height)
  return height
}

/** Sizes the layer in the unrotated page box and turns it with the theme's rules. */
function sizeLayer(
  container: HTMLElement,
  info: PageInfo,
  transform: PageTransform
): void {
  container.dataset.mainRotation = String(transform.totalRotation)
  // `--total-scale-factor` is zoom × /UserUnit, so the box is in user-space units here.
  container.style.width = `calc(var(--total-scale-factor) * ${info.box.width}px)`
  container.style.height = `calc(var(--total-scale-factor) * ${info.box.height}px)`
}

/**
 * @internal Fills `container` with one span per item. Synchronous; imports nothing from PDF.js.
 *
 * Each span is placed at its run's top-left corner, as a percentage of the page box, and sized
 * from `--font-height` (the font size) and `--total-scale-factor`, so `update` only sizes and
 * turns the container.
 */
export function mountTextSpans(options: MountTextSpansOptions): {
  update(transform: PageTransform): void
} {
  const { content, families, baselines, info, container, transform } = options
  const doc = container.ownerDocument
  const { box } = info
  const context = measureContext(doc)
  /** Widths measured in this mount, by family, size and string. */
  const widths = new Map<string, number>()
  let font = ''

  const measure = (str: string, family: string, size: number): number => {
    if (!context || !(size > 0)) return 0
    const key = `${family}\u0000${size}\u0000${str}`
    let width = widths.get(key)
    if (width === undefined) {
      const wanted = `${size}px ${family}`
      if (wanted !== font) {
        context.font = wanted
        font = wanted
      }
      width = context.measureText(str).width
      widths.set(key, width)
    }
    return width
  }

  const spanFor = (
    item: TextItem,
    family: string,
    baseline: number | undefined
  ): HTMLSpanElement => {
    const { p1, p3, p4 } = item.quad
    const size = Number.isFinite(item.fontSize) && item.fontSize > 0 ? item.fontSize : 0
    // The run's height runs from the font's descent to its ascent, which need not be one font
    // size. The span's line box, one font size high, stands on the baseline with `LINE_ASCENT`
    // of it above, so the spans of a line in different fonts line up. With no baseline it is
    // centred on the box. Either way its top corner moves down the glyphs' up from `p1`.
    const height = Math.hypot(p1.x - p3.x, p1.y - p3.y)
    let x = p1.x
    let y = p1.y
    if (height > 0) {
      const shift =
        baseline !== undefined && Number.isFinite(baseline)
          ? height - baseline - LINE_ASCENT * size
          : (height - size) / 2
      x -= ((p1.x - p3.x) / height) * shift
      y -= ((p1.y - p3.y) / height) * shift
    }
    const span = doc.createElement('span')
    span.setAttribute('role', 'presentation')
    span.dir = item.dir === 'rtl' ? 'rtl' : 'ltr'
    const { style } = span
    style.left = percent((x - box.x) / box.width)
    style.top = percent((box.y + box.height - y) / box.height)
    style.setProperty('--font-height', `${size}px`)
    style.fontFamily = family
    // CSS turns clockwise with y down, page space anticlockwise with y up. A vertical run's
    // baseline already runs down its column, a quarter turn from its glyphs' own.
    const angle = -Math.atan2(p4.y - p3.y, p4.x - p3.x) * DEGREES
    if (Math.abs(angle) > LEVEL) style.setProperty('--rotate', `${angle}deg`)
    // A run of only spaces keeps its own width, as PDF.js's layer keeps a lone space's:
    // stretched over a gap, it would join the text either side of a column gutter into one
    // selection box.
    if (item.str.trim() !== '') {
      const length = Math.hypot(p4.x - p3.x, p4.y - p3.y)
      const measured = measure(item.str, family, size)
      if (measured > 0 && length > 0)
        style.setProperty('--scale-x', String(length / measured))
    }
    span.textContent = item.str
    return span
  }

  const fragment = doc.createDocumentFragment()
  content.items.forEach((item, i) => {
    // A run of only spaces gets a span too, so text copied across a run boundary keeps its space.
    if (item.str !== '')
      fragment.append(spanFor(item, families?.[i] ?? 'sans-serif', baselines?.[i]))
    if (item.hasEOL) {
      const br = doc.createElement('br')
      br.setAttribute('role', 'presentation')
      fragment.append(br)
    }
  })
  // The widths are only for this mount: `update` measures nothing.
  widths.clear()
  container.style.setProperty('--min-font-size', String(minFontSize(doc)))
  sizeLayer(container, info, transform)
  container.append(fragment)

  return {
    update(next) {
      sizeLayer(container, info, next)
    },
  }
}
