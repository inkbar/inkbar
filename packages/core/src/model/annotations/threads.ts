import { isTextMarkup } from './edit'

import type { Annotation, NoteAnnotation, TextMarkupAnnotation } from './types'

/** What a thread can hang from: a note, or text markup whose `contents` is its comment. */
export type ThreadRoot = NoteAnnotation | TextMarkupAnnotation

export function isThreadRoot(a: Annotation): a is ThreadRoot {
  return a.type === 'text' || isTextMarkup(a)
}

/**
 * True for a reply: an annotation whose `inReplyTo` names a thread root (a note or text markup)
 * in `list`. Replies show in the thread popover only, never on the page.
 */
export function isReply(a: Annotation, list: readonly Annotation[]): boolean {
  if (a.inReplyTo === undefined) return false
  const parent = list.find((x) => x.id === a.inReplyTo)
  return parent !== undefined && isThreadRoot(parent)
}

/** `list` less its replies (see `isReply`), in the same order. */
export function withoutReplies(list: readonly Annotation[]): Annotation[] {
  const roots = new Set(list.filter(isThreadRoot).map((a) => a.id))
  return list.filter((a) => a.inReplyTo === undefined || !roots.has(a.inReplyTo))
}

/** Direct replies to `id`, in creation order. */
export function repliesTo(list: readonly Annotation[], id: string): Annotation[] {
  return list
    .filter((a) => a.inReplyTo === id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * The top of a thread: follows `inReplyTo` up through notes, stopping at text markup (which
 * roots a thread of its own), a missing parent, a parent that cannot root a thread, or a
 * cycle. Null when `start` is neither a note nor text markup.
 */
export function threadRoot(
  list: readonly Annotation[],
  start: Annotation
): ThreadRoot | null {
  if (!isThreadRoot(start)) return null
  const seen = new Set([start.id])
  let current: ThreadRoot = start
  while (current.type === 'text' && current.inReplyTo) {
    const id: string = current.inReplyTo
    const parent = list.find((a) => a.id === id)
    if (!parent || !isThreadRoot(parent) || seen.has(parent.id)) break
    seen.add(parent.id)
    current = parent
  }
  return current
}

/** The root, then every reply below it, depth first, each level in creation order. */
export function threadOf(list: readonly Annotation[], root: ThreadRoot): Annotation[] {
  const out: Annotation[] = [root]
  const seen = new Set([root.id])
  const visit = (id: string): void => {
    for (const r of repliesTo(list, id)) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      out.push(r)
      visit(r.id)
    }
  }
  visit(root.id)
  return out
}

/**
 * An unlocked root note with no text and no replies: nothing a reader would miss. Always
 * false for text markup, which is worth keeping without a comment.
 */
export function isAbandonedNote(a: Annotation, list: readonly Annotation[]): boolean {
  if (a.type !== 'text' || a.locked || a.inReplyTo || a.contents?.trim()) return false
  return repliesTo(list, a.id).length === 0
}
