// The document reader over PDF.js: page facts from each page proxy, and pixels from
// `PDFPageProxy.render`.
import { omitAppearances } from './widget-appearance'

import type { PdfjsPage } from './types'
import type { InkDocument } from '../model/document'
import type { Rect } from '../model/geometry'
import type { PageInfo, PageRotation } from '../model/pages'
import type { DocumentReader, DrawRequest } from '../reader/types'

const isCancellation = (error: unknown): boolean =>
  (error as { name?: unknown } | null)?.name === 'RenderingCancelledException'

/**
 * A reader over the document's PDF.js handles. It owns nothing: the document destroys the
 * PDF.js loading task itself.
 *
 * @internal
 */
export function createPdfjsReader(handles: InkDocument['_pdfjs']): DocumentReader {
  return {
    kind: 'pdfjs',
    pageCount: handles.proxy.numPages,
    async pageInfo(index) {
      return pageInfoFromProxy(await handles.getPage(index), index)
    },
    draw: (request, canvas, signal) => draw(handles, request, canvas, signal),
    destroy: () => Promise.resolve(),
  }
}

/**
 * The whole page: the viewport at `zoom`, scaled up by the pixel ratio through the render
 * transform. A region: the viewport at `zoom × pixelRatio`, shifted so the region's top-left
 * corner lands on the canvas origin, so the region fills the canvas. Either way the background
 * is white and annotation appearances are drawn, form widgets included, except those `hide`
 * names.
 */
async function draw(
  handles: InkDocument['_pdfjs'],
  request: DrawRequest,
  canvas: HTMLCanvasElement,
  signal?: AbortSignal
): Promise<void> {
  const { page, rotation, zoom, pixelRatio, region } = request
  signal?.throwIfAborted()
  const pdfPage = await handles.getPage(page)
  signal?.throwIfAborted()
  const viewport = region
    ? regionViewport(pdfPage, region, zoom * pixelRatio, rotation)
    : pdfPage.getViewport({ scale: zoom, rotation })
  canvas.width = request.width
  canvas.height = request.height
  const hidden = new Set(request.hide.map((h) => h.id))
  const task = pdfPage.render({
    canvas,
    viewport,
    // Pages are paper: an opaque white canvas, whatever the theme puts behind it.
    background: '#ffffff',
    // The same operator list the form layer draws widget appearances from.
    annotationMode: handles.module.AnnotationMode.ENABLE,
    ...(hidden.size === 0 ? {} : { operationsFilter: omitAppearances(handles, hidden) }),
    ...(region || pixelRatio === 1
      ? {}
      : { transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] }),
  })
  const cancel = (): void => task.cancel()
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    await task.promise
  } catch (error) {
    if (signal?.aborted && isCancellation(error)) throw signal.reason
    throw error
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
  // Finished just as the signal aborted: the caller has moved on.
  signal?.throwIfAborted()
}

/** The page's viewport at `scale`, shifted so `region`'s top-left corner is its origin. */
function regionViewport(
  pdfPage: PdfjsPage,
  region: Rect,
  scale: number,
  rotation: number
) {
  const full = pdfPage.getViewport({ scale, rotation })
  // The region's corners on the unshifted canvas, in device pixels.
  const [x1, y1] = full.convertToViewportPoint(region.x, region.y) as [number, number]
  const [x2, y2] = full.convertToViewportPoint(
    region.x + region.width,
    region.y + region.height
  ) as [number, number]
  return pdfPage.getViewport({
    scale,
    rotation,
    offsetX: -Math.min(x1, x2),
    offsetY: -Math.min(y1, y2),
  })
}

function pageInfoFromProxy(page: PdfjsPage, index: number): PageInfo {
  const [x1, y1, x2, y2] = page.view as [number, number, number, number]
  const box: Rect = {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
  return {
    index,
    box,
    rotate: normaliseRotation(page.rotate),
    userUnit: page.userUnit > 0 ? page.userUnit : 1,
    width: box.width,
    height: box.height,
  }
}

/** PDF.js already rejects /Rotate values that are not multiples of 90; this also folds negatives. */
function normaliseRotation(rotate: number): PageRotation {
  const r = (((Math.round(rotate / 90) * 90) % 360) + 360) % 360
  return r as PageRotation
}
