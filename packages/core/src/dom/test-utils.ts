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

/** Resolves once `pred` holds, checking every frame; rejects after `timeout` ms. */
export async function until(pred: () => boolean, timeout = 5000): Promise<void> {
  const start = performance.now()
  while (!pred()) {
    if (performance.now() - start > timeout) throw new Error('until(): timed out')
    await nextFrame()
  }
}
