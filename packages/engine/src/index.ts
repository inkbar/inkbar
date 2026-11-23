export { createEngine } from './engine.ts'
export { EngineError } from './errors.ts'
export { TEXT_GEOMETRY_STRIDE } from './types.ts'

export type { Engine, EngineDocument, EngineOptions } from './engine.ts'
export type { EngineErrorCode, RefusalReason, UnremovableKind } from './errors.ts'
export type {
  AnnotationRef,
  Appearance,
  CheckRedactionOptions,
  DestinationArgKind,
  DestinationFitKind,
  DestinationPageKind,
  ExplicitDestination,
  FileAction,
  FileDestination,
  FileTarget,
  FontKey,
  OpenOptions,
  Outline,
  OutlineEntry,
  PageAnnotationEntry,
  PageInfo,
  PageLinkFacts,
  PageLinks,
  PageText,
  PageTextOptions,
  Rect,
  RedactInput,
  RedactionCandidate,
  RedactionFindings,
  RedactionRegion,
  RedactResult,
  RenderOptions,
  RenderedPage,
  SaveMode,
  SaveOptions,
  StandardFont,
  StandardFontName,
  TextFont,
  WriteAnnotation,
  WriteField,
  WriteInput,
} from './types.ts'
