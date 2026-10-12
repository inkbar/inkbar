import type * as pdfjs from 'pdfjs-dist'

export type PdfjsModule = typeof pdfjs
export type PdfjsLoadingTask = pdfjs.PDFDocumentLoadingTask
export type PdfjsDocument = pdfjs.PDFDocumentProxy
export type PdfjsPage = pdfjs.PDFPageProxy
export type PdfjsTextContent = Awaited<ReturnType<pdfjs.PDFPageProxy['getTextContent']>>
export type PdfjsTextItem = Extract<PdfjsTextContent['items'][number], { str: string }>
export type PdfjsRenderTask = pdfjs.RenderTask
export type PdfjsViewport = pdfjs.PageViewport

/** The shape of one entry from `PDFPageProxy.getAnnotations()`, limited to the fields Inkbar reads. */
export interface PdfjsAnnotationData {
  id: string
  subtype: string
  annotationType: number
  rect: [number, number, number, number]
  quadPoints?: Float32Array | number[] | null
  color?: Uint8ClampedArray | null
  interiorColor?: Uint8ClampedArray | null
  opacity?: number
  contentsObj?: { str: string; dir: string }
  titleObj?: { str: string; dir: string }
  inReplyTo?: string
  replyType?: string
  creationDate?: string | null
  modificationDate?: string | null
  name?: string
  borderStyle?: { width: number } | null
  lineCoordinates?: [number, number, number, number]
  vertices?: Float32Array | number[]
  inkLists?: Array<Float32Array | number[]>
  overlaidText?: string
  hasAppearance?: boolean
  hidden?: boolean
  noView?: boolean
}

export interface PdfAssets {
  /** URL (or file path in Node) of `pdf.worker(.min).mjs`. */
  worker: string
  /** Directory URL ending in `/` containing the packed CMaps. */
  cMaps: string
  /** Directory URL ending in `/` containing the standard 14 fonts. */
  standardFonts: string
  /** Directory URL ending in `/` containing the image-decoder wasm files. */
  wasm: string
  /** Directory URL ending in `/` containing ICC profiles. Optional. */
  icc?: string
}
