// Helpers for `*.browser.test.ts` files. Not exported from the package.
import { browserAssets, fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'

import { openDocument, type InkDocument, type OpenOptions } from '../model/document'

/** Appends a fixed-size, positioned div to the body. The caller removes it. */
export function mountContainer(width = 800, height = 600): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = `width:${width}px;height:${height}px;position:relative;`
  document.body.append(el)
  return el
}

/** Opens a fixture served by `serveFixtures()` and waits until it is ready. */
export async function openFixtureInBrowser(
  name: FixtureName,
  opts: Partial<OpenOptions> = {}
): Promise<InkDocument> {
  const doc = await openDocument(fixtureUrl(name), { assets: browserAssets(), ...opts })
  await doc.ready
  return doc
}

export const nextFrame = (): Promise<void> =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

export const settle = (ms = 50): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Resolves once `pred` holds, checking every frame; rejects after `timeout` ms. The timeout
 * runs on its own timer, so it still fires when animation frames are paused (a hidden tab).
 */
export async function until(pred: () => boolean, timeout = 5000): Promise<void> {
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      reject(new Error('until(): timed out'))
    }, timeout)
  })
  const poll = async (): Promise<void> => {
    while (!timedOut && !pred()) await nextFrame()
  }
  try {
    await Promise.race([poll(), expired])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Test-only stand-in for the theme's text layer CSS (the theme ships it later). Copied from
 * `pdfjs-dist/web/pdf_viewer.css`: the `.pdfViewer .page` scale-rounding variables, the
 * `.textLayer` container rules (line-height, transform-origin, text-scale variables), its
 * `:is(span, br)` and `> :not(.markedContent)` span rules, and the `[data-main-rotation]`
 * transforms. Cosmetic rules (highlights, selection colours) are left out.
 */
export const TEXT_LAYER_CSS = `
.ink-text-layer {
  --scale-round-x: 1px;
  --scale-round-y: 1px;
  text-align: initial;
  line-height: 1;
  letter-spacing: normal;
  word-spacing: normal;
  text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0 0;
  --min-font-size: 1;
  --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
  --min-font-size-inv: calc(1 / var(--min-font-size));
}
.ink-text-layer :is(span, br) {
  color: transparent;
  position: absolute;
  white-space: pre;
  transform-origin: 0% 0%;
}
.ink-text-layer > :not(.markedContent),
.ink-text-layer .markedContent span:not(.markedContent) {
  --font-height: 0;
  font-size: calc(var(--text-scale-factor) * var(--font-height));
  --scale-x: 1;
  --rotate: 0deg;
  transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}
.ink-text-layer .markedContent { display: contents; }
.ink-text-layer[data-main-rotation="90"] { transform: rotate(90deg) translateY(-100%); }
.ink-text-layer[data-main-rotation="180"] { transform: rotate(180deg) translate(-100%, -100%); }
.ink-text-layer[data-main-rotation="270"] { transform: rotate(270deg) translateX(-100%); }
`
