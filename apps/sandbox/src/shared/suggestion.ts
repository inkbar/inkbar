/*
 * The sandbox's suggested redactions: plain `redact` annotations carrying the app's own data
 * under `custom.sandbox.suggestion`. Inkbar stores, undoes and exports that data without
 * reading it; this file gives it meaning: a colour per confidence, a data attribute for
 * styling, and accepting a suggestion.
 */
import type { Annotation, AnnotationStore } from '@inkbar/core'
import type { DecorateAnnotation } from '@inkbar/core/dom'

export interface SandboxSuggestion {
  /** From 0 to 1. */
  confidence: number
  reason: string
  explanation?: string
  status: 'suggested' | 'accepted'
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** The suggestion on a redaction, or undefined when it has none (or a malformed one). */
export function suggestionOf(a: Annotation): SandboxSuggestion | undefined {
  if (a.type !== 'redact') return undefined
  const sandbox = a.custom?.sandbox
  const s = isRecord(sandbox) ? sandbox.suggestion : undefined
  if (
    !isRecord(s) ||
    typeof s.confidence !== 'number' ||
    typeof s.reason !== 'string' ||
    (s.explanation !== undefined && typeof s.explanation !== 'string') ||
    (s.status !== 'suggested' && s.status !== 'accepted')
  )
    return undefined
  return s as unknown as SandboxSuggestion
}

export function confidenceLevel(confidence: number): 'low' | 'medium' | 'high' {
  return confidence < 0.5 ? 'low' : confidence < 0.8 ? 'medium' : 'high'
}

const COLORS = { low: '#D4A017', medium: '#E67E22', high: '#C0392B' }

/** The colour a suggested mark is drawn in. */
export function confidenceColor(confidence: number): string {
  return COLORS[confidenceLevel(confidence)]
}

/**
 * Tags each suggestion's element `data-sandbox-suggestion="suggested"` (or `"accepted"`), and
 * tells screen readers which redactions are still only suggested.
 */
export const decorateSuggestion: DecorateAnnotation = (a) => {
  const s = suggestionOf(a)
  if (!s) return undefined
  const data = { 'sandbox-suggestion': s.status }
  return s.status === 'suggested'
    ? { data, description: 'Suggested redaction' }
    : { data }
}

/**
 * Keeps a suggestion as a redaction: status `accepted`, in the store's default redaction
 * colour. One update, so one undo step. Returns undefined, changing nothing, for anything that
 * is not an open suggestion, and for a locked one.
 */
export function acceptSuggestion(
  store: AnnotationStore,
  id: string
): Annotation | undefined {
  const a = store.get(id)
  const s = a && suggestionOf(a)
  if (!a || !s || s.status !== 'suggested' || a.locked) return undefined
  const sandbox = a.custom?.sandbox
  return store.update(id, {
    color: store.defaults.color('redact'),
    custom: {
      ...a.custom,
      sandbox: {
        ...(isRecord(sandbox) ? sandbox : {}),
        suggestion: { ...s, status: 'accepted' },
      },
    },
  })
}
