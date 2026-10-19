import type { AnnotationType, ConfidenceBucket } from './types'

export interface AnnotationDefaults {
  color(type: AnnotationType): string
  /** Fill colour for redactions. */
  fill(): string
  opacity(type: AnnotationType): number
  /** Outline colour for a suggested redaction, by confidence bucket. */
  suggestion(bucket: ConfidenceBucket): string
}

const COLORS: Record<AnnotationType, string> = {
  highlight: '#F2C230',
  underline: '#2B5A9E',
  strikeout: '#C0392B',
  squiggly: '#1F7A4D',
  text: '#F2C230',
  // Free text: the text colour (`defaultStyle.color`). A box's fill has no default.
  freetext: '#151820',
  square: '#C0392B',
  circle: '#C0392B',
  line: '#151820',
  polyline: '#151820',
  polygon: '#151820',
  ink: '#151820',
  redact: '#C0392B',
}

/**
 * Suggested-redaction colours, strengthening with confidence: amber for low, orange for
 * medium, the redaction red for high.
 */
const SUGGESTION_COLORS: Record<ConfidenceBucket, string> = {
  low: '#D4A017',
  medium: '#E67E22',
  high: '#C0392B',
}

export const staticDefaults: AnnotationDefaults = {
  color: (type) => COLORS[type],
  fill: () => '#000000',
  opacity: (type) => (type === 'highlight' ? 0.4 : 1),
  suggestion: (bucket) => SUGGESTION_COLORS[bucket],
}

const VARIABLES: Record<AnnotationType, string> = {
  highlight: '--ink-highlight',
  underline: '--ink-underline',
  strikeout: '--ink-strikeout',
  squiggly: '--ink-squiggly',
  text: '--ink-note',
  freetext: '--ink-free-text',
  square: '--ink-shape',
  circle: '--ink-shape',
  line: '--ink-shape',
  polyline: '--ink-shape',
  polygon: '--ink-shape',
  ink: '--ink-ink',
  redact: '--ink-redact',
}

/** Resolves default colours from CSS custom properties on `el`, falling back to `staticDefaults`. */
export function cssVariableDefaults(el: Element): AnnotationDefaults {
  const read = (name: string): string | undefined => {
    const view = el.ownerDocument.defaultView
    if (!view) return undefined
    return normalizeColor(view.getComputedStyle(el).getPropertyValue(name))
  }
  return {
    color: (type) => read(VARIABLES[type]) ?? staticDefaults.color(type),
    fill: () => read('--ink-redact-fill') ?? staticDefaults.fill(),
    opacity: (type) => staticDefaults.opacity(type),
    suggestion: (bucket) =>
      read(`--ink-suggestion-${bucket}`) ?? staticDefaults.suggestion(bucket),
  }
}

/** Accepts `#rgb`, `#rrggbb`, `rgb(r, g, b)` and `rgb(r g b)`; returns `#RRGGBB` or undefined. */
export function normalizeColor(value: string): string | undefined {
  const v = value.trim()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v)
  if (short) {
    const [, r = '', g = '', b = ''] = short
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toUpperCase()
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(v)
  if (rgb) {
    const hex = [rgb[1], rgb[2], rgb[3]]
      .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0'))
      .join('')
    return `#${hex}`.toUpperCase()
  }
  return undefined
}
