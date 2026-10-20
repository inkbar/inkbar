/** Replaced at build time (tsdown) and in tests (vitest) with package.json's version. */
declare const __INKBAR_VERSION__: string

/** The @inkbar/core version, from its package.json. */
export const version: string = __INKBAR_VERSION__

export * from './model/errors'
export * from './model/events'
export * from './model/geometry'
export * from './model/readable'
export { mergeLineRects } from './model/selection'

export { openDocument } from './model/document'
export type {
  DocumentInfo,
  DocumentStatus,
  InkDocument,
  InkStatus,
  OpenOptions,
} from './model/document'
export type { DocumentSource } from './model/source'
export type { PageInfo, PageRotation } from './model/pages'
export type { TextContent, TextItem } from './model/text'
export type { PdfAssets } from './pdfjs/types'
export * from './model/annotations/types'
export * from './model/annotations/pdf-names'
export * from './model/annotations/defaults'
export * from './model/annotations/store'
export * from './model/annotations/history'
export { createToolStyle, STYLE_GROUPS } from './model/annotations/tool-style'
export type {
  CurrentStyle,
  ScopedToolStyle,
  StyleGroup,
  StyleKey,
  StyleProps,
  ToolStyle,
  ToolStyleDeps,
} from './model/annotations/tool-style'
export {
  fromAnnotation,
  styleGroupOf,
  styleGroupOfType,
  styleGroupsOf,
  supportedProps,
  toFields,
  typesInGroup,
} from './model/annotations/style-map'
export { createSnapshotHistory } from './model/annotations/snapshot-history'
export type {
  SnapshotHistory,
  SnapshotHistoryOptions,
} from './model/annotations/snapshot-history'
export { acceptSuggestion } from './model/annotations/suggestions'
export {
  isAbandonedNote,
  isReply,
  isThreadRoot,
  repliesTo,
  threadOf,
  threadRoot,
  withoutReplies,
} from './model/annotations/threads'
export type { ThreadRoot } from './model/annotations/threads'
export * from './model/annotations/embedded'
export { parsePdfDate } from './model/pdf-date'
export { exportAnnotations, importAnnotations } from './model/annotations/json'
export { recogniseStroke, RECOGNISE_THRESHOLD } from './model/recognise'
export type { Recognised } from './model/recognise'
export type { ImportOptions, ImportResult } from './model/annotations/json'
export {
  createImageTemplate,
  createInkTemplate,
  createLocalSignatureStore,
  createMemorySignatureStore,
  createSignatureLibrary,
  DEFAULT_SIGNATURE_WIDTH,
  normaliseInk,
  placeSignature,
  SIGNATURE_INK_WIDTH,
} from './model/signatures'
export type {
  SignatureLibrary,
  SignatureOptions,
  SignatureStore,
  SignatureTemplate,
} from './model/signatures'
