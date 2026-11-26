// The document reader over PDF.js: page facts from each page proxy, pixels from
// `PDFPageProxy.render`, and the file's facts, text, links, annotations, form fields, Tab
// order, the outline, destinations and the file's JavaScript as PDF.js reads them.
import { resolveDestination } from './destinations'
import { fileAnnotationFromPdfjs } from './file-annotations'
import { fileFieldsFromPdfjs } from './file-form'
import { fileScriptsFromPdfjs, pageScriptsFromPdfjs } from './file-scripts'
import { pageGlyphs } from './glyphs'
import { linkFromPdfjs } from './links'
import { readOutline } from './outline'
import { structureAnnotationOrder } from './structure'
import { readTextContent } from './text-content'
import { textContentFromPdfjs } from './text-items'
import { omitAppearances, renderAppearances } from './widget-appearance'

import type { PdfjsAnnotationData, PdfjsPage } from './types'
import type { InkDocument } from '../model/document'
import type { Rect } from '../model/geometry'
import type { PageInfo, PageRotation } from '../model/pages'
import type { MeasureChar, TextContent } from '../model/text'
import type { FileFacts } from '../reader/file'
import type { DocumentReader, DrawRequest } from '../reader/types'

const isCancellation = (error: unknown): boolean =>
  (error as { name?: unknown } | null)?.name === 'RenderingCancelledException'

/** @internal What the PDF.js reader takes from the document besides its handles. */
export interface PdfjsReaderDeps {
  measure: MeasureChar | undefined
}

/**
 * @internal The PDF.js reader. Each page's annotations are read from PDF.js once and kept, so the
 * open's reads of annotations, links and the form share them, until `forgetAnnotations`.
 */
export interface PdfjsReader extends DocumentReader {
  /** Stops keeping each page's annotations: the open has read every page. Later reads ask again. */
  forgetAnnotations(): void
}

/** The Info dictionary entries the reader reads. */
interface PdfjsInfoDict {
  Title?: unknown
  Author?: unknown
  EncryptFilterName?: unknown
}

/**
 * A reader over the document's PDF.js handles. It owns nothing: the document destroys the
 * PDF.js loading task itself.
 *
 * @internal
 */
export function createPdfjsReader(
  handles: InkDocument['_pdfjs'],
  deps: PdfjsReaderDeps
): PdfjsReader {
  const annotationsRead = new Map<number, Promise<PdfjsAnnotationData[]>>()
  const pdfjsAnnotations = (index: number): Promise<PdfjsAnnotationData[]> => {
    let read = annotationsRead.get(index)
    if (!read) {
      // A page whose annotations PDF.js cannot parse still renders; it just has none to show.
      const made = handles
        .getPage(index)
        .then((page) => page.getAnnotations().catch((): PdfjsAnnotationData[] => []))
      // A page that could not be had is not kept: the next read asks again.
      made.catch(() => {
        if (annotationsRead.get(index) === made) annotationsRead.delete(index)
      })
      annotationsRead.set(index, made)
      read = made
    }
    return read
  }
  return {
    kind: 'pdfjs',
    pageCount: handles.proxy.numPages,
    facts: () => facts(handles),
    async pageInfo(index) {
      return pageInfoFromProxy(await handles.getPage(index), index)
    },
    draw: (request, canvas, signal) => draw(handles, request, canvas, signal),
    drawFields: (request, canvas, signal) =>
      renderAppearances(handles, request, canvas, signal),
    text: (page, { glyphs, signal }) => text(handles, deps.measure, page, glyphs, signal),
    async links(page) {
      const annotations = await pdfjsAnnotations(page)
      return annotations.flatMap((data, at) => linkFromPdfjs(page, data, at) ?? [])
    },
    async annotations(page) {
      return (await pdfjsAnnotations(page)).map(fileAnnotationFromPdfjs)
    },
    async form() {
      const widgets: { page: number; at: number; data: PdfjsAnnotationData }[] = []
      for (let page = 0; page < handles.proxy.numPages; page++) {
        const annotations = await pdfjsAnnotations(page)
        // Widgets keep their place among the page's annotations, which Tab order shares with links.
        annotations.forEach((data, at) => {
          if (data.subtype === 'Widget') widgets.push({ page, at, data })
        })
      }
      return fileFieldsFromPdfjs(widgets)
    },
    tabOrder: async (page) => structureAnnotationOrder(await handles.getPage(page)),
    scripts: () => fileScriptsFromPdfjs(handles.proxy),
    pageScripts: (page) => pageScriptsFromPdfjs(handles.proxy, page),
    // PDF.js builds these for its own sandbox: handed over as they are.
    sandboxFields: () => handles.proxy.getFieldObjects(),
    forgetAnnotations: () => annotationsRead.clear(),
    outline: () => readOutline(handles.proxy),
    // A lookup PDF.js cannot do gives the same answer every time: it goes nowhere.
    resolveDestination: (raw) => resolveDestination(handles.proxy, raw),
    destroy: () => Promise.resolve(),
  }
}

/** Title and author from the Info dictionary, and whether the file is encrypted. */
async function facts(handles: InkDocument['_pdfjs']): Promise<FileFacts> {
  const meta = await handles.proxy.getMetadata().catch(() => {
    // Metadata is optional: PDF.js throws on malformed Info dictionaries or XMP, and
    // title/author are nice-to-have. The document itself has opened, so carry on without it.
    return undefined
  })
  const info = (meta?.info ?? {}) as PdfjsInfoDict
  const title = nonEmptyString(info.Title)
  const author = nonEmptyString(info.Author)
  return {
    ...(title !== undefined ? { title } : {}),
    ...(author !== undefined ? { author } : {}),
    encrypted: info.EncryptFilterName !== null && info.EncryptFilterName !== undefined,
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * A page's text with item boundaries measured or, with `glyphs`, taken from where the page
 * draws each glyph. Reading the glyphs means reading the page's drawing commands, which also
 * decodes its images. Once `signal` aborts the read rejects with its reason: the text stream is
 * cancelled, and a read of the drawing commands already asked for is left to finish unused.
 */
async function text(
  handles: InkDocument['_pdfjs'],
  measure: MeasureChar | undefined,
  page: number,
  glyphs: boolean,
  signal: AbortSignal | undefined
): Promise<TextContent> {
  signal?.throwIfAborted()
  const p = await handles.getPage(page)
  signal?.throwIfAborted()
  const tc = await readTextContent(p, signal, handles.textReads)
  // A page with no text (a scan) has no glyphs worth reading its drawing commands for.
  const placed =
    glyphs && tc.items.length > 0
      ? await handles.textReads
          .track(() => pageGlyphs(p, handles.module))
          ?.catch(() => undefined)
      : undefined
  signal?.throwIfAborted()
  return textContentFromPdfjs(page, tc, measure, placed)
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
