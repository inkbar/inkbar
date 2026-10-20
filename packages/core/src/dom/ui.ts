// Vocabulary the framework packages share: labels, zoom levels and the props they hand to
// host-rendered content. Core owns these so Vue and React cannot drift apart.
import { PALETTE } from './palette'

import type { ShapeKind, ShapeOptions, ToolId } from './tools'
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
  sketch: 'Sketch',
  draw: 'Draw',
  note: 'Add note',
  shape: 'Shape',
  freetext: 'Text',
}

/**
 * The font families a text box offers by default: the PDF standard families, which a PDF
 * writer can use without embedding a font. Hosts pass their own list as `fonts`.
 */
export const FONT_FAMILIES: readonly string[] = ['Helvetica', 'Times', 'Courier']

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

/** The colour props a colour menu can set. */
export type ColorProperty = 'border' | 'fill' | 'textColor'

/** Accessible names of the colour menus, by property. */
export const COLOR_LABELS: Readonly<Record<ColorProperty, string>> = {
  border: 'Border colour',
  fill: 'Fill colour',
  textColor: 'Text colour',
}

/** Columns of the swatch grid: the arrow keys move by this much between rows. */
export const COLOR_COLUMNS = 12

export interface ColorMenuSwatch {
  /** Unique within the menu. */
  key: string
  /** The swatch's accessible name: its hex value. */
  label: string
  color: string
  checked: boolean
  patch: StyleProps
}

/** What the trigger's swatch shows. */
export type ColorTrigger =
  | { kind: 'color'; color: string }
  /** No fill. */
  | { kind: 'none' }
  /** The selection disagrees. */
  | { kind: 'mixed' }
  /** Nothing to show: the menu is disabled or the style has no value. */
  | { kind: 'empty' }

export interface ColorMenuModel {
  label: string
  /** False when nothing supports the property: the trigger disables. */
  enabled: boolean
  mixed: boolean
  trigger: ColorTrigger
  /** Common colours, greys, then the tonal grid, `COLOR_COLUMNS` to a row. */
  swatches: ColorMenuSwatch[]
  /** The "No fill" choice, for `fill` only. */
  noFill: { checked: boolean; patch: StyleProps } | null
  /** The colour the custom picker starts on. */
  customValue: string
  /** What picking `hex` in the custom picker writes. */
  custom(hex: string): StyleProps
}

/**
 * What a colour menu shows for a style: the palette with the matching swatch checked, "No fill"
 * for `fill`, and the trigger's swatch. Shared by the bindings and the vanilla menu.
 */
export function colorMenuModel(
  property: ColorProperty,
  current: CurrentStyle,
  supported: ReadonlySet<StyleKey>
): ColorMenuModel {
  const value = current[property]
  const enabled = supported.has(property)
  const color =
    typeof value === 'string' && value !== 'mixed' ? value.toUpperCase() : undefined
  const flat = [
    ...PALETTE.common.map((c, i) => [`common-${i}`, c] as const),
    ...PALETTE.greys.map((c, i) => [`grey-${i}`, c] as const),
    ...PALETTE.grid.flatMap((row, r) =>
      row.map((c, i) => [`grid-${r}-${i}`, c] as const)
    ),
  ]
  const patchFor = (c: string): StyleProps => ({ [property]: c })
  const trigger: ColorTrigger = !enabled
    ? { kind: 'empty' }
    : value === 'mixed'
      ? { kind: 'mixed' }
      : value === null
        ? { kind: 'none' }
        : typeof value === 'string'
          ? { kind: 'color', color: value }
          : { kind: 'empty' }
  return {
    label: COLOR_LABELS[property],
    enabled,
    mixed: value === 'mixed',
    trigger,
    swatches: flat.map(([key, c]) => ({
      key,
      label: c,
      color: c,
      checked: color === c,
      patch: patchFor(c),
    })),
    noFill:
      property === 'fill' ? { checked: value === null, patch: { fill: null } } : null,
    customValue: color ?? '#000000',
    custom: (hex) => patchFor(hex.toUpperCase()),
  }
}

/** The smallest, largest and default text size in points, and what one step changes. */
export const FONT_SIZE_MIN = 1
export const FONT_SIZE_MAX = 144
export const FONT_SIZE_DEFAULT = 12
export const FONT_SIZE_STEP = 1

/** A typed size as the menu stores it: a whole number of points within the range. */
export function clampFontSize(size: number): number {
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(size)))
}

export type TextToggleKey = 'bold' | 'italic' | 'underline'
export type TextAlignKey = 'left' | 'center' | 'right' | 'justify'

export interface TextStyleToggle {
  key: TextToggleKey
  label: string
  /** `'mixed'` when the selection disagrees. */
  pressed: boolean | 'mixed'
  /** What pressing writes: the opposite of `pressed`, and on for a mix. */
  patch: StyleProps
}

export interface TextAlignChoice {
  key: TextAlignKey
  label: string
  checked: boolean
  /** The one radio in the Tab order: the checked one, else the first. */
  tabStop: boolean
  patch: StyleProps
}

export interface TextStyleMenuModel {
  label: string
  /** False when nothing supports text style: the trigger disables. */
  enabled: boolean
  mixed: boolean
  font: {
    label: string
    /** The family, or `''` when the selection disagrees. */
    value: string
    /** The families on offer; a current family outside the list is added. */
    options: string[]
    patch(family: string): StyleProps
  }
  size: {
    label: string
    /** The size, or `null` when the selection disagrees. */
    value: number | null
    min: number
    max: number
    step: number
    /** What committing a typed size writes, or `null` when it changes nothing. */
    commit(raw: number): StyleProps | null
    /** What a stepper press writes, or `null` at the end of the range. */
    nudge(direction: 1 | -1): StyleProps | null
  }
  toggles: TextStyleToggle[]
  align: { label: string; choices: TextAlignChoice[] }
}

const TEXT_KEYS: readonly StyleKey[] = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'textDecoration',
  'textAlign',
]

const ALIGN_KEYS: readonly TextAlignKey[] = ['left', 'center', 'right', 'justify']

const ALIGN_LABELS: Readonly<Record<TextAlignKey, string>> = {
  left: 'Align left',
  center: 'Align centre',
  right: 'Align right',
  justify: 'Justify',
}

/**
 * What the text style menu shows for a style: the font, size, bold/italic/underline and
 * alignment, each with the patch choosing it. `fonts` is the list the host offers.
 */
export function textStyleMenuModel(
  current: CurrentStyle,
  supported: ReadonlySet<StyleKey>,
  fonts: readonly string[]
): TextStyleMenuModel {
  const family = current.fontFamily
  const size = current.fontSize
  const value = typeof size === 'number' ? size : null
  const toggle = (
    key: TextToggleKey,
    label: string,
    prop: 'fontWeight' | 'fontStyle' | 'textDecoration',
    on: string,
    off: string
  ): TextStyleToggle => {
    const now = current[prop]
    const pressed = now === 'mixed' ? 'mixed' : now === on
    return { key, label, pressed, patch: { [prop]: pressed === true ? off : on } }
  }
  const nudge = (direction: 1 | -1): StyleProps | null => {
    const next = clampFontSize((value ?? FONT_SIZE_DEFAULT) + direction * FONT_SIZE_STEP)
    return next === value ? null : { fontSize: next }
  }
  return {
    label: 'Text style',
    enabled: TEXT_KEYS.some((k) => supported.has(k)),
    mixed: TEXT_KEYS.some((k) => current[k] === 'mixed'),
    font: {
      label: 'Font',
      value: typeof family === 'string' && family !== 'mixed' ? family : '',
      options:
        typeof family === 'string' && family !== 'mixed' && !fonts.includes(family)
          ? [...fonts, family]
          : [...fonts],
      patch: (f) => ({ fontFamily: f }),
    },
    size: {
      label: 'Font size',
      value,
      min: FONT_SIZE_MIN,
      max: FONT_SIZE_MAX,
      step: FONT_SIZE_STEP,
      commit: (raw) => {
        if (!Number.isFinite(raw)) return null
        const next = clampFontSize(raw)
        return next === value ? null : { fontSize: next }
      },
      nudge,
    },
    toggles: [
      toggle('bold', 'Bold', 'fontWeight', 'bold', 'normal'),
      toggle('italic', 'Italic', 'fontStyle', 'italic', 'normal'),
      toggle('underline', 'Underline', 'textDecoration', 'underline', 'none'),
    ],
    align: {
      label: 'Alignment',
      choices: ALIGN_KEYS.map((key, i) => ({
        key,
        label: ALIGN_LABELS[key],
        checked: current.textAlign === key,
        tabStop:
          current.textAlign === key ||
          (i === 0 && !ALIGN_KEYS.includes(current.textAlign as TextAlignKey)),
        patch: { textAlign: key },
      })),
    },
  }
}

/** Accessible names of the shape kinds, as the shape menu announces them. */
export const SHAPE_LABELS: Readonly<Record<ShapeKind, string>> = {
  line: 'Line',
  arrow: 'Arrow',
  rectangle: 'Rectangle',
  roundedRectangle: 'Rounded rectangle',
  ellipse: 'Ellipse',
  bubble: 'Speech bubble',
  star: 'Star',
  polygon: 'Polygon',
  loupe: 'Loupe',
  mask: 'Mask',
}

/** Columns of the shape grid: the arrow keys move by this much between rows. */
export const SHAPE_COLUMNS = 2

export interface ShapeMenuItem {
  kind: ShapeKind
  label: string
  checked: boolean
}

export interface ShapeMenuModel {
  /** The kind the main button draws. */
  kind: ShapeKind
  /** The main button's accessible name. */
  label: string
  /** The kinds on offer, in menu order, with the current one checked. */
  items: ShapeMenuItem[]
}

/**
 * What the shape menu shows for the shape tool's options, over the kinds in `kinds`
 * (`SHAPE_KINDS`). A kind that is not on offer falls back to the first.
 */
export function shapeMenuModel(
  options: Partial<ShapeOptions>,
  kinds: readonly ShapeKind[]
): ShapeMenuModel {
  const kind =
    options.kind !== undefined && kinds.includes(options.kind)
      ? options.kind
      : (kinds.find((k) => k === 'rectangle') ?? kinds[0] ?? 'rectangle')
  return {
    kind,
    label: `Shape: ${SHAPE_LABELS[kind]}`,
    items: kinds.map((k) => ({ kind: k, label: SHAPE_LABELS[k], checked: k === kind })),
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
