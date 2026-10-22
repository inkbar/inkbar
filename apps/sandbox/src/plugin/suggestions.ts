/*
 * Suggest redactions, written as an Inkbar plugin. It uses only Inkbar's public API, and the
 * same plugin runs on every framework page: each registers it in `plugins` and places its
 * Suggest button where it wants.
 *
 * A suggestion is the plugin's own record, not an annotation. Suggest adds them; each open one
 * is drawn as a dashed mark that opens a review card. Accept turns the suggestion into a real
 * redaction, Dismiss sets it aside, and deleting that redaction puts the suggestion back. Every
 * one of those is one undo step.
 *
 * The suggestions are static: the four values on page 4 of the sample. A real plugin would ask
 * its own service, or receive them from the host through `initial`.
 */
import {
  quadsFromRect,
  type InkDocument,
  type Quad,
  type Rect,
  type RecordBase,
} from '@inkbar/core'
import { definePlugin, type PluginStoreOptions } from '@inkbar/core/dom'

export interface Suggestion extends RecordBase {
  /** Page index, from 0. */
  page: number
  /** Where the text is, in PDF user space. */
  quads: Quad[]
  /** The box around `quads`, where the mark goes. */
  rect: Rect
  /** From 0 to 1. */
  confidence: number
  reason: string
  explanation?: string
  /** The text the quads cover; Suggest adds a suggestion only when its page's text contains it. */
  text: string
  status: 'suggested' | 'accepted' | 'dismissed'
}

/** One line of text from `left` to `right` and `bottom` to `top`, in PDF points. */
function line(left: number, bottom: number, right: number, top: number) {
  const rect = { x: left, y: bottom, width: right - left, height: top - bottom }
  return { rect, quads: quadsFromRect(rect) }
}

/**
 * The sample's customer record on page 4 (index 3), in reading order. The positions come from
 * the sample's own text layer, rounded to 0.01 pt.
 */
export const SAMPLE_SUGGESTIONS: readonly Suggestion[] = [
  {
    id: 'ni-number',
    page: 3,
    ...line(383, 246.9, 443.35, 258.91),
    confidence: 0.95,
    reason: 'National Insurance number',
    explanation: 'Two letters, six digits and a final letter.',
    text: 'QQ123456C',
    status: 'suggested',
  },
  {
    id: 'email',
    page: 3,
    ...line(383, 224.9, 499.65, 236.91),
    confidence: 0.85,
    reason: 'Email address',
    explanation: 'The customer’s email address.',
    text: 'm.okafor@example.com',
    status: 'suggested',
  },
  {
    id: 'phone',
    page: 3,
    ...line(383, 202.9, 451.74, 214.91),
    confidence: 0.6,
    reason: 'Phone number',
    explanation: 'Eleven digits starting 07, like a UK mobile number.',
    text: '07700 900123',
    status: 'suggested',
  },
  {
    id: 'email-in-note',
    page: 3,
    ...line(411.32, 135.95, 524.99, 147.68),
    confidence: 0.85,
    reason: 'Email address',
    explanation: 'The same email address, repeated in the call note.',
    text: 'm.okafor@example.com',
    status: 'suggested',
  },
]

export function confidenceLevel(confidence: number): 'Low' | 'Medium' | 'High' {
  return confidence < 0.5 ? 'Low' : confidence < 0.8 ? 'Medium' : 'High'
}

const COLORS = { Low: '#D4A017', Medium: '#E67E22', High: '#C0392B' }

/** The colour a suggestion is drawn in. */
export function confidenceColor(confidence: number): string {
  return COLORS[confidenceLevel(confidence)]
}

export function suggestionCount(n: number): string {
  return n === 1 ? '1 suggestion' : `${n} suggestions`
}

/**
 * The sample suggestions whose text this document holds. Waits 400 ms first, like a network
 * round trip, and stops there if `signal` has aborted. On any other PDF the text is not
 * there, so it finds none.
 */
export async function findSuggestions(
  doc: InkDocument,
  { signal }: { signal?: AbortSignal } = {}
): Promise<Suggestion[]> {
  await new Promise((resolve) => setTimeout(resolve, 400))
  signal?.throwIfAborted()
  const found: Suggestion[] = []
  for (const s of SAMPLE_SUGGESTIONS)
    if (s.page < doc.pages.length && (await doc.pageText(s.page)).includes(s.text))
      found.push(s)
  return found
}

export interface SuggestionsOptions {
  /**
   * `suggestions.initial`: the suggestions a document opens with, the host's saved ones say.
   * `suggestions.onChange`: called after every change, to save them. Inkbar keeps no plugin data.
   */
  records?: { suggestions?: PluginStoreOptions<Suggestion> }
}

export const suggestionsPlugin = definePlugin<SuggestionsOptions>('sandbox', (plugin) => {
  const suggestions = plugin.records<Suggestion>('suggestions')

  // Accept adds a redaction linked to its suggestion. Deleting that redaction puts the
  // suggestion back up for review, inside the delete's undo step.
  const redaction = suggestions.annotates('redact', {
    from: (s) => ({ page: s.page, quads: s.quads }),
    onRemoved: (s) => suggestions.update(s.id, { status: 'suggested' }),
  })

  plugin.command(
    'suggest',
    'Suggest redactions',
    async ({ doc, signal }) => {
      const found = await findSuggestions(doc, { signal })
      // Bound to this run's document: if another file opened meanwhile, this adds nothing.
      return suggestionCount(suggestions.in(doc).addMissing(found).length)
    },
    { errorStatus: 'Could not check this document.' }
  )

  plugin.marks(suggestions, {
    where: (s) => s.status === 'suggested',
    rect: (s) => s.rect,
    label: (s) => `Suggested redaction: ${s.reason}`,
    style: (s) => ({ borderColor: confidenceColor(s.confidence) }),
    className: 'sandbox-suggestion',
    card: (s) => ({
      title: s.reason,
      label: 'Suggested redaction',
      meta: `${confidenceLevel(s.confidence)} confidence`,
      swatch: confidenceColor(s.confidence),
      ...(s.explanation && { body: s.explanation }),
      actions: {
        Accept: () => {
          suggestions.update(s.id, { status: 'accepted' })
          redaction.add(s)
        },
        Dismiss: () => suggestions.update(s.id, { status: 'dismissed' }),
      },
    }),
  })
})
