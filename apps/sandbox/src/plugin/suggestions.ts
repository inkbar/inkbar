/*
 * Suggest redactions, written as an Inkbar plugin. It uses only Inkbar's public API, and the
 * same plugin runs on every framework page: each registers it in `plugins` and places its
 * Suggest button where it wants.
 *
 * A suggestion is the plugin's own record, kept in a plugin store, not an annotation. Suggest
 * fills the store; a page layer draws each open suggestion as a dashed mark; the mark opens a
 * review card. Accept turns the suggestion into a real redaction, Dismiss sets it aside. Store
 * changes join the viewer's undo history, so Undo takes back a whole Suggest run, an accept or
 * a dismiss.
 *
 * The suggestions are static: the four values on page 4 of the sample. A real plugin would ask
 * its own service, or receive them from the host through `initial`.
 */
import {
  writable,
  type InkDocument,
  type Quad,
  type Rect,
  type RecordBase,
  type RecordChange,
  type RecordStore,
} from '@inkbar/core'
import { definePlugin, type InkPlugin, type PluginContext } from '@inkbar/core/dom'

import { createSuggestionCard } from './card.ts'
import { drawSuggestions } from './layer.ts'

export interface Suggestion extends RecordBase {
  /** Page index, from 0. */
  page: number
  /** Where the text is, in PDF user space. */
  quads: Quad[]
  /** The box around `quads`, where the layer draws the mark. */
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
  return {
    quads: [
      {
        p1: { x: left, y: top },
        p2: { x: right, y: top },
        p3: { x: left, y: bottom },
        p4: { x: right, y: bottom },
      },
    ],
    rect: { x: left, y: bottom, width: right - left, height: top - bottom },
  }
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

export function suggestionCount(n: number): string {
  return n === 1 ? '1 suggestion' : `${n} suggestions`
}

/**
 * The sample suggestions this document holds and the store lacks. Waits 400 ms first, like a
 * network round trip. On any other PDF the text is not there, so it finds none.
 */
async function findSuggestions(
  doc: InkDocument,
  store: RecordStore<Suggestion>
): Promise<Suggestion[]> {
  await new Promise((resolve) => setTimeout(resolve, 400))
  const pageText = new Map<number, string>()
  const found: Suggestion[] = []
  for (const s of SAMPLE_SUGGESTIONS) {
    if (store.get(s.id) || s.page >= doc.pages.length) continue
    let text = pageText.get(s.page)
    if (text === undefined) {
      const { items } = await doc.text(s.page)
      text = items.map((item) => item.str).join(' ')
      pageText.set(s.page, text)
    }
    if (text.includes(s.text)) found.push(s)
  }
  return found
}

/** What a redaction made by Accept carries, linking it back to its suggestion. */
function suggestionIdOf(custom: Record<string, unknown> | undefined): string | undefined {
  const sandbox = custom?.sandbox
  const id =
    typeof sandbox === 'object' && sandbox !== null && 'suggestionId' in sandbox
      ? sandbox.suggestionId
      : undefined
  return typeof id === 'string' ? id : undefined
}

/**
 * Keeps a suggestion: marks it accepted and adds a redaction over the same text, in the
 * document's default redaction colour. One batch, so one undo step takes back both.
 */
export function acceptSuggestion(
  ctx: PluginContext,
  store: RecordStore<Suggestion>,
  id: string
): void {
  const s = store.get(id)
  const doc = ctx.document.get()
  if (!s || s.status !== 'suggested' || !doc) return
  ctx.history.batch(() => {
    store.update(id, { status: 'accepted' })
    doc.annotations.add({
      type: 'redact',
      page: s.page,
      quads: s.quads,
      color: doc.annotations.defaults.color('redact'),
      custom: { sandbox: { suggestionId: id } },
    })
  })
}

/** Sets a suggestion aside. It stays in the store, so Undo can bring it back. */
export function dismissSuggestion(store: RecordStore<Suggestion>, id: string): void {
  if (store.get(id)?.status === 'suggested') store.update(id, { status: 'dismissed' })
}

export interface SuggestionsOptions {
  /** The suggestions a document opens with: the host's saved ones, say. */
  initial?: (doc: InkDocument) => readonly Suggestion[]
  /** Called after every change, to save them. Inkbar keeps no plugin data. */
  onChange?: (list: readonly Suggestion[], change: RecordChange<Suggestion>) => void
}

export function suggestionsPlugin(opts: SuggestionsOptions = {}): InkPlugin {
  return definePlugin({
    id: 'sandbox',
    setup(ctx) {
      // One store per open document, keyed `sandbox.suggestions`; null while none is open.
      const suggestions = ctx.store<Suggestion>('suggestions', {
        ...(opts.initial && { initial: opts.initial }),
        ...(opts.onChange && { onChange: opts.onChange }),
      })

      // Suggest redactions. The button shows the status beside it, in a live region.
      const status = writable('')
      ctx.commands.add({
        id: 'suggest',
        label: 'Suggest redactions',
        status,
        async run() {
          const doc = ctx.document.get()
          const store = suggestions.get()
          if (!doc || !store) return
          status.set('')
          try {
            const found = await findSuggestions(doc, store)
            // Another file opened meanwhile: this run's results are for a closed document.
            if (ctx.document.get() !== doc) return
            ctx.history.batch(() => {
              for (const s of found) store.add(s)
            })
            status.set(suggestionCount(found.length))
          } catch {
            if (ctx.document.get() === doc) status.set('Could not check this document.')
          }
        },
      })

      // Deleting an accepted redaction by hand puts its suggestion back up for review. This
      // runs inside the delete's undo step, so Undo restores both.
      ctx.onAnnotationEdit((edit) => {
        const store = suggestions.get()
        if (edit.kind !== 'remove' || !store) return
        for (const a of edit.removed) {
          const id = suggestionIdOf(a.custom)
          if (id && store.get(id)?.status === 'accepted')
            store.update(id, { status: 'suggested' })
        }
      })

      // The review card, opened from a mark.
      const card = createSuggestionCard({
        get: (id) => suggestions.get()?.get(id),
        onAccept(id) {
          const store = suggestions.get()
          if (store) acceptSuggestion(ctx, store, id)
        },
        onDismiss(id) {
          const store = suggestions.get()
          if (store) dismissSuggestion(store, id)
        },
      })

      // Each page draws its open suggestions, and redraws whenever the store changes.
      const layer = ctx.layer({
        render(el, page, transform) {
          const list = suggestions.get()?.list.get() ?? []
          drawSuggestions(
            el,
            list.filter((s) => s.page === page && s.status === 'suggested'),
            transform,
            (id, mark) => card.open(id, mark)
          )
        },
      })
      ctx.onDocument(() => {
        status.set('')
        return suggestions.get()?.list.subscribe(() => layer.invalidate())
      })

      return () => card.destroy()
    },
  })
}
