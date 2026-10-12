import type { Annotation } from '@inkbar/core'

/** The overlay's per-annotation state, as on its `data-state` attribute. */
export type AnnotationState = 'idle' | 'hover' | 'selected'

/** Props of the `annotation` slot on InkViewport and the default slot of InkAnnotation. */
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
