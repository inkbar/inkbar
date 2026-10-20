// Vocabulary the framework packages share: labels, zoom levels and the props they hand to
// host-rendered content. Core owns these so Vue and React cannot drift apart.
import type { ToolId } from './tools'
import type { CurrentStyle, StyleKey, StyleProps } from '../model/annotations/tool-style'
import type {
  Annotation,
  ConfidenceBucket,
  LineEnding,
  NoteAnnotation,
  RedactAnnotation,
  Suggestion,
} from '../model/annotations/types'

/**
 * Accessible names of the built-in tools, as the toolbar buttons announce them. A host tool has
 * no entry: its button takes the host's `label`, else the tool id.
 */
export const TOOL_LABELS: Readonly<Partial<Record<ToolId, string>>> = {
  'select-text': 'Select text',
  select: 'Rectangle select',
  highlight: 'Highlight',
  'redact-area': 'Mark for redaction',
  note: 'Add note',
}

/** Zoom levels the zoom select offers, as scale factors. */
export const ZOOM_LEVELS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

/** Stroke weights the line style menu offers, in points. */
export const LINE_WEIGHTS: readonly number[] = [0.5, 1, 2, 3, 4, 6, 8]

/** The dash pattern the menu's dashed choice writes, in points. */
export const DASH_PATTERN: readonly number[] = [3, 3]

/** The ending the menu's arrowhead choices draw. */
export const ARROWHEAD_ENDING: LineEnding = 'openArrow'

export type ArrowheadChoice = 'none' | 'start' | 'end' | 'both'

/** The arrowhead choices in menu order, with the style each one writes (`head` is the start). */
export const ARROWHEAD_CHOICES: readonly {
  value: ArrowheadChoice
  label: string
  patch: Pick<StyleProps, 'head' | 'tail'>
}[] = [
  { value: 'none', label: 'No arrowheads', patch: { head: 'none', tail: 'none' } },
  {
    value: 'start',
    label: 'Arrowhead at start',
    patch: { head: ARROWHEAD_ENDING, tail: 'none' },
  },
  {
    value: 'end',
    label: 'Arrowhead at end',
    patch: { head: 'none', tail: ARROWHEAD_ENDING },
  },
  {
    value: 'both',
    label: 'Arrowheads at both ends',
    patch: { head: ARROWHEAD_ENDING, tail: ARROWHEAD_ENDING },
  },
]

/** Which arrowhead choice a style shows, `'mixed'` when the selection disagrees, else `undefined`. */
export function arrowheadChoice(
  head: LineEnding | 'mixed' | undefined,
  tail: LineEnding | 'mixed' | undefined
): ArrowheadChoice | 'mixed' | undefined {
  if (head === undefined && tail === undefined) return undefined
  if (head === 'mixed' || tail === 'mixed') return 'mixed'
  const start = head !== undefined && head !== 'none'
  const end = tail !== undefined && tail !== 'none'
  return start ? (end ? 'both' : 'start') : end ? 'end' : 'none'
}

export interface LineStyleMenuItem {
  key: string
  label: string
  checked: boolean
  /** What choosing the item writes through the tool style. */
  patch: StyleProps
}

export interface LineStyleMenuSection {
  label: string
  /** The selection or active tool supports none of the section's props. */
  disabled: boolean
  items: LineStyleMenuItem[]
}

export interface LineStyleMenuModel {
  /** False when nothing supports weight, pattern or endings: the trigger disables. */
  enabled: boolean
  /** The selection disagrees on weight, pattern or endings. */
  mixed: boolean
  sections: LineStyleMenuSection[]
}

/**
 * What the line style menu shows for a style: sections of checkable items, each section
 * disabled when `supported` lacks its props. A section whose value is mixed checks nothing.
 * Shared by the bindings and the vanilla menu so they cannot drift apart.
 */
export function lineStyleMenuModel(
  current: CurrentStyle,
  supported: ReadonlySet<StyleKey>
): LineStyleMenuModel {
  const canWeight = supported.has('width')
  const canDash = supported.has('dashes')
  const canEnds = supported.has('head') || supported.has('tail')
  const dashed = Array.isArray(current.dashes) && current.dashes.length > 0
  const ends = arrowheadChoice(current.head, current.tail)
  return {
    enabled: canWeight || canDash || canEnds,
    mixed: (['width', 'dashes', 'head', 'tail'] as const).some(
      (k) => current[k] === 'mixed'
    ),
    sections: [
      {
        label: 'Weight',
        disabled: !canWeight,
        items: LINE_WEIGHTS.map((w) => ({
          key: String(w),
          label: `${w} pt`,
          checked: current.width === w,
          patch: { width: w },
        })),
      },
      {
        label: 'Pattern',
        disabled: !canDash,
        items: [
          {
            key: 'solid',
            label: 'Solid',
            checked: current.dashes === null,
            patch: { dashes: null },
          },
          {
            key: 'dashed',
            label: 'Dashed',
            checked: dashed,
            patch: { dashes: [...DASH_PATTERN] },
          },
        ],
      },
      {
        label: 'Arrowheads',
        disabled: !canEnds,
        items: ARROWHEAD_CHOICES.map((c) => ({
          key: c.value,
          label: c.label,
          checked: ends === c.value,
          patch: c.patch,
        })),
      },
    ],
  }
}

/** The overlay's per-annotation state, as on its `data-state` attribute. */
export type AnnotationState = 'idle' | 'hover' | 'selected'

/**
 * What a host-rendered annotation receives: Vue's `annotation` slot and React's
 * `renderAnnotation`.
 */
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
