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
  /** The intent (`/IT`), a PDF name. PDF.js 6.4 does not pass FreeText `/CL`, `/RD` or `/LE`. */
  it?: string
  lineCoordinates?: [number, number, number, number]
  vertices?: Float32Array | number[]
  inkLists?: Array<Float32Array | number[]>
  lineEndings?: string[]
  /** Text under a markup annotation, not a redaction's overlay text. */
  overlaidText?: string
  defaultAppearanceData?: {
    fontSize: number
    fontName?: string
    fontColor?: Uint8ClampedArray | number[] | { [index: number]: number }
  }
  hasAppearance?: boolean
  hidden?: boolean
  noView?: boolean
  /** `/F`, the annotation flags. */
  annotationFlags?: number
  // Widget keys, as PDF.js 6.4's WidgetAnnotation and its subclasses set them.
  fieldName?: string
  fieldType?: string | null
  fieldValue?: string | string[] | null
  defaultFieldValue?: string | string[] | null
  fieldFlags?: number
  checkBox?: boolean
  radioButton?: boolean
  pushButton?: boolean
  /** A checkbox's on value, mapped through `/Opt`. */
  exportValue?: string | null
  /** A radio widget's on value, mapped through `/Opt`. */
  buttonValue?: string | null
  options?: { exportValue: string; displayValue: string }[]
  combo?: boolean
  multiSelect?: boolean
  multiLine?: boolean
  password?: boolean
  comb?: boolean
  maxLen?: number | null
  /** `/Q`: 0 left, 1 centre, 2 right. */
  textAlignment?: number | null
  borderStyle?: { width: number; style?: number } | null
  borderColor?: Uint8ClampedArray | null
  backgroundColor?: Uint8ClampedArray | null
  /** `/TU`. */
  alternativeText?: string
  /** `/MK /R`. */
  rotation?: number
  /** JavaScript actions by event name; null when there are none. */
  actions?: Map<string, string[]> | Record<string, string[]> | null
  resetForm?: { fields: string[]; refs: string[]; include: boolean }
  url?: string
  /** A Named action's name. */
  action?: string
  dest?: string | unknown[]
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
