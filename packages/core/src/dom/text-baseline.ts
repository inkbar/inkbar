import { cssFont } from './text-fonts'

import type { TextFont } from '../model/annotations/drawing/types'

/** How many measured sizes are kept. */
const CACHE_SIZE = 200
/** Per document: another document (a frame) can have other fonts, and so other metrics. */
const caches = new WeakMap<Document, Map<string, number>>()

/**
 * Distance from the top of an HTML text box's content to the baseline of its first line, in CSS
 * px, as the browser sets it for `font` at `size` CSS px with `line-height: 1.2`. Blink rounds a
 * font's ascent and descent to whole pixels, so this can differ by up to a pixel from the
 * fractional baseline the layout gives. The in-place editor is HTML, so it measures the
 * difference to sit where the drawn text sits.
 */
export function htmlBaseline(doc: Document, font: TextFont, size: number): number {
  const css = cssFont(font, size)
  let cache = caches.get(doc)
  if (!cache) caches.set(doc, (cache = new Map<string, number>()))
  const known = cache.get(css)
  if (known !== undefined) return known
  const box = doc.createElement('div')
  box.style.cssText = `position:absolute;left:0;top:0;width:5000px;visibility:hidden;font:${css};line-height:1.2;white-space:pre-wrap;overflow-wrap:break-word;margin:0;padding:0;border:0;`
  box.append('Hxg ')
  // A zero-size inline-block sits on the baseline, so its bottom edge is the baseline.
  const probe = doc.createElement('span')
  probe.style.cssText = 'display:inline-block;width:0;height:0'
  box.append(probe)
  doc.body.append(box)
  const baseline = probe.getBoundingClientRect().bottom - box.getBoundingClientRect().top
  box.remove()
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!)
  cache.set(css, baseline)
  return baseline
}
