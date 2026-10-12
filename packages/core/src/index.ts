export const version = '0.0.0'

export * from './model/errors'
export * from './model/events'
export * from './model/geometry'
export * from './model/readable'

export { openDocument } from './model/document'
export type {
  DocumentInfo,
  DocumentStatus,
  InkDocument,
  OpenOptions,
} from './model/document'
export type { DocumentSource } from './model/source'
export type { PageInfo, PageRotation } from './model/pages'
export type { TextContent, TextItem } from './model/text'
export type { PdfAssets } from './pdfjs/types'
export * from './model/annotations/types'
export * from './model/annotations/defaults'
export * from './model/annotations/store'
