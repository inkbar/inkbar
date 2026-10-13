export { useInkContext } from './context'
export type { InkContext, InkHistory, InkStatus } from './context'
export { useReadable } from './use-readable'
export { useDocument } from './hooks/useDocument'
export { useAnnotations } from './hooks/useAnnotations'
export { useTool } from './hooks/useTool'
export { useSelection } from './hooks/useSelection'
export { useZoom } from './hooks/useZoom'
export { usePage } from './hooks/usePage'
export { useHistory } from './hooks/useHistory'
export { useEmbedded } from './hooks/useEmbedded'
export type {
  AnnotationSlotProps,
  AnnotationState,
  NotePopoverSlotProps,
  SuggestionCardSlotProps,
} from '@inkbar/core/dom'
export type { ConfidenceBucket } from '@inkbar/core'
export { InkRoot } from './components/InkRoot'
export type { InkRootHandle, InkRootProps } from './components/InkRoot'
export { InkViewport } from './components/InkViewport'
export type { InkViewportProps } from './components/InkViewport'
export { InkPage } from './components/InkPage'
export type { InkPageProps } from './components/InkPage'
export { InkAnnotation } from './components/InkAnnotation'
export type { InkAnnotationProps } from './components/InkAnnotation'
