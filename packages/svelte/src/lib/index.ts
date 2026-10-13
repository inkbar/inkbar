export { useInkContext } from './context.js'
export type { InkContext, InkHistory, InkStatus } from './context.js'
export { useReadable } from './use-readable.svelte.js'
export type { ReadableRef } from './use-readable.svelte.js'
export type {
  AnnotationSlotProps,
  AnnotationState,
  NotePopoverSlotProps,
  SuggestionCardSlotProps,
} from '@inkbar/core/dom'
export type { ConfidenceBucket } from '@inkbar/core'
export { useDocument } from './hooks/useDocument.svelte.js'
export { useAnnotations } from './hooks/useAnnotations.svelte.js'
export { useTool } from './hooks/useTool.svelte.js'
export { useSelection } from './hooks/useSelection.svelte.js'
export { useZoom } from './hooks/useZoom.svelte.js'
export { usePage } from './hooks/usePage.svelte.js'
export { useHistory } from './hooks/useHistory.svelte.js'
export { useEmbedded } from './hooks/useEmbedded.svelte.js'
export { default as InkRoot } from './components/InkRoot.svelte'
export type { InkRootProps } from './components/InkRoot.svelte'
export { default as InkViewport } from './components/InkViewport.svelte'
export type { InkViewportProps } from './components/InkViewport.svelte'
export { default as InkPage } from './components/InkPage.svelte'
export type { InkPageProps } from './components/InkPage.svelte'
export { default as InkAnnotation } from './components/InkAnnotation.svelte'
export type { InkAnnotationProps } from './components/InkAnnotation.svelte'
