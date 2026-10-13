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
