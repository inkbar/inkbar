/*
 * Suggest redactions, written as an Inkbar plugin. It uses only Inkbar's public API, and the
 * same plugin runs on every framework: each registers it in `plugins` and places its
 * Suggest button where it wants.
 *
 * A suggestion is the plugin's own record, not an annotation. Suggest adds them; each open one
 * is drawn as a dashed mark that opens a review card. Accept turns the suggestion into a real
 * redaction, Dismiss sets it aside, and deleting that redaction puts the suggestion back. Every
 * one of those is one undo step.
 *
 * Suggest searches the open document for a fixed list of made-up values: the customer records
 * in the sandbox's documents. A real plugin would ask its own service, or receive them from the
 * host through `initial`.
 *
 * Every word the plugin shows comes from `text`, English unless the host passes its own. The
 * host passes a function, and Inkbar calls the labels that read it again whenever the viewer's
 * language changes, so the button, the marks and an open card follow the host's language.
 */
import { definePlugin, type PluginStoreOptions } from '@inkbar/core/dom'

import { englishText, type KindId, type SuggestionsText } from './suggestions-text.ts'

import type {
  Annotation,
  InkDocument,
  Quad,
  Rect,
  RecordBase,
  SearchHit,
} from '@inkbar/core'

export { englishText, type KindId, type SuggestionsText }

export interface Suggestion extends RecordBase {
  /** Page index, from 0. */
  page: number
  /** Where the text is, in PDF user space. */
  quads: Quad[]
  /** The box around `quads`, where the mark goes. */
  rect: Rect
  /** From 0 to 1. */
  confidence: number
  /** What the text is. The card names it in the reader's language, from `text`. */
  kind: KindId
  /** `kind` in English, kept with the record as data. */
  reason: string
  explanation?: string
  /** The text the quads cover. */
  text: string
  status: 'suggested' | 'accepted' | 'dismissed'
}

/** A kind of personal data, and the values of it that Suggest looks for. */
interface Kind {
  /** The first suggestion of this kind takes it as its id, the next `<id>-2`, and so on. */
  id: KindId
  confidence: number
  values: readonly string[]
}

// Names and addresses are left out on purpose: the reader redacts those by hand.
/** Every value is made up, like the documents that hold them. */
const KINDS: readonly Kind[] = [
  {
    id: 'ni-number',
    confidence: 0.95,
    values: ['QQ123456C', 'QQ654321A'],
  },
  {
    id: 'email',
    confidence: 0.85,
    values: ['m.okafor@example.com', 'dan.price@example.com', 'aisha.rahman@example.com'],
  },
  {
    id: 'phone',
    confidence: 0.6,
    values: ['07700 900123', '07700 900456', '07700 900789'],
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

/**
 * The id of the suggestion a redaction was accepted from, if it was. Accept stores the link on
 * the redaction, at `custom.sandbox.suggestions`, so a host can find it.
 */
export function acceptedFrom(annotation: Annotation): string | undefined {
  const own = annotation.custom?.['sandbox']
  const id =
    own && typeof own === 'object'
      ? (own as Record<string, unknown>)['suggestions']
      : undefined
  return typeof id === 'string' ? id : undefined
}

/** The card's meta line: how sure the suggestion is. */
function confidenceText(text: SuggestionsText, confidence: number): string {
  const level = confidenceLevel(confidence)
  return level === 'Low'
    ? text.lowConfidence
    : level === 'Medium'
      ? text.mediumConfidence
      : text.highConfidence
}

/**
 * Every place the document holds one of the values in `KINDS`, in reading order. Waits 400 ms
 * first, like a network round trip, and stops if `signal` aborts. A PDF without those values
 * gets none.
 */
export async function findSuggestions(
  doc: InkDocument,
  { signal }: { signal?: AbortSignal } = {}
): Promise<Suggestion[]> {
  await new Promise((resolve) => setTimeout(resolve, 400))
  signal?.throwIfAborted()
  // `doc.search` is the find bar's search: each hit has its page, text offsets and quads.
  const options = { matchCase: true, ...(signal && { signal }) }
  const found: { kind: Kind; hit: SearchHit }[] = []
  for (const kind of KINDS)
    for (const value of kind.values)
      for (const hit of await doc.search(value, options).all()) found.push({ kind, hit })
  // Reading order: page by page, then where each hit starts in its page's text.
  found.sort((a, b) => a.hit.page - b.hit.page || a.hit.start - b.hit.start)

  const seen = new Map<string, number>()
  return found.map(({ kind, hit }) => {
    const n = (seen.get(kind.id) ?? 0) + 1
    seen.set(kind.id, n)
    return {
      id: n === 1 ? kind.id : `${kind.id}-${n}`,
      page: hit.page,
      quads: hit.quads,
      rect: hit.rect,
      confidence: kind.confidence,
      kind: kind.id,
      reason: englishText.reasons[kind.id],
      explanation: englishText.explanations[kind.id],
      text: hit.text,
      status: 'suggested',
    }
  })
}

export interface SuggestionsOptions {
  /**
   * `suggestions.initial`: the suggestions a document opens with, the host's saved ones say.
   * `suggestions.onChange`: called after every change, to save them. Inkbar keeps no plugin data.
   */
  records?: { suggestions?: PluginStoreOptions<Suggestion> }
  /**
   * The plugin's words. It calls this each time it shows them, so a host that changes language
   * returns the new words from here. Default: English.
   */
  text?: () => SuggestionsText
}

export const suggestionsPlugin = definePlugin<SuggestionsOptions>(
  'sandbox',
  (plugin, options) => {
    const text = options?.text ?? (() => englishText)
    const suggestions = plugin.records<Suggestion>('suggestions')

    // Accept adds a redaction linked to its suggestion. Deleting that redaction puts the
    // suggestion back up for review, inside the delete's undo step.
    const redaction = suggestions.annotates('redact', {
      from: (s) => ({ page: s.page, quads: s.quads }),
      onRemoved: (s) => suggestions.update(s.id, { status: 'suggested' }),
    })

    plugin.command(
      'suggest',
      () => text().command,
      async ({ doc, signal }) => {
        const found = await findSuggestions(doc, { signal })
        // Bound to this run's document: if another file opened meanwhile, this adds nothing.
        const count = suggestions.in(doc).addMissing(found).length
        return text().found({ count })
      },
      { errorStatus: () => text().failed }
    )

    // Marks and an open card are drawn again when the viewer's language changes, so each reads
    // `text()` as it draws.
    plugin
      .marks(suggestions, {
        where: (s) => s.status === 'suggested',
        rect: (s) => s.rect,
        label: (s) => text().mark({ reason: text().reasons[s.kind] }),
        style: (s) => ({ borderColor: confidenceColor(s.confidence) }),
        className: 'sandbox-suggestion',
        card: (s) => ({
          title: () => text().reasons[s.kind],
          label: () => text().card,
          meta: confidenceText(text(), s.confidence),
          swatch: confidenceColor(s.confidence),
          body: text().explanations[s.kind],
          actions: [
            {
              label: () => text().accept,
              run: () => {
                suggestions.update(s.id, { status: 'accepted' })
                redaction.add(s)
              },
            },
            {
              label: () => text().dismiss,
              run: () => suggestions.update(s.id, { status: 'dismissed' }),
            },
          ],
        }),
      })
      .scrollToFirst()
  }
)
