// Vocabulary the framework packages share: labels, zoom levels and the props they hand to
// host-rendered content. Core owns these so Vue and React cannot drift apart.
import type { ToolId } from './tools'
import type {
  Annotation,
  ConfidenceBucket,
  NoteAnnotation,
  RedactAnnotation,
  Suggestion,
} from '../model/annotations/types'

/** Accessible names of the built-in tools, as the toolbar buttons announce them. */
export const TOOL_LABELS: Readonly<Record<ToolId, string>> = {
  view: 'View',
  select: 'Select',
  highlight: 'Highlight',
  'redact-area': 'Mark for redaction',
  note: 'Add note',
}

/** Zoom levels the zoom select offers, as scale factors. */
export const ZOOM_LEVELS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

/** The overlay's per-annotation state, as on its `data-state` attribute. */
export type AnnotationState = 'idle' | 'hover' | 'selected'

/** What a host-rendered annotation receives (Vue's `annotation` slot, React's `renderAnnotation`). */
export interface AnnotationSlotProps {
  annotation: Annotation
  state: AnnotationState
  locked: boolean
  select: () => void
  remove: () => void
  /** Turns a suggested redaction into the user's own. No-op for anything else. */
  accept: () => void
  /** Removes a suggested redaction. No-op for anything else. */
  dismiss: () => void
}

/** What a host-rendered note thread receives. */
export interface NotePopoverSlotProps {
  note: NoteAnnotation
  replies: Annotation[]
  reply: (text: string) => void
  update: (contents: string) => void
  remove: () => void
  close: () => void
}

/** What a host-rendered suggestion card receives. */
export interface SuggestionCardSlotProps {
  annotation: RedactAnnotation
  suggestion: Suggestion | undefined
  bucket: ConfidenceBucket | undefined
  accept: () => void
  dismiss: () => void
  close: () => void
}
