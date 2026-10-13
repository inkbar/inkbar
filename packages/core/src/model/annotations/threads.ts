import type { Annotation, NoteAnnotation } from './types'

/** Direct replies to `id`, in creation order. */
export function repliesTo(list: readonly Annotation[], id: string): Annotation[] {
  return list
    .filter((a) => a.inReplyTo === id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * The top of a note's thread: follows `inReplyTo` up through notes, stopping at a missing
 * parent, a parent that is not a note, or a cycle.
 */
export function threadRoot(
  list: readonly Annotation[],
  start: NoteAnnotation
): NoteAnnotation {
  const seen = new Set([start.id])
  let current = start
  while (current.inReplyTo) {
    const parent = list.find((a) => a.id === current.inReplyTo)
    if (parent?.type !== 'note' || seen.has(parent.id)) break
    seen.add(parent.id)
    current = parent
  }
  return current
}

/** The root, then every reply below it, depth first, each level in creation order. */
export function threadOf(
  list: readonly Annotation[],
  root: NoteAnnotation
): Annotation[] {
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

/** An unlocked root note with no text and no replies: nothing a reader would miss. */
export function isAbandonedNote(list: readonly Annotation[], id: string): boolean {
  const a = list.find((x) => x.id === id)
  if (a?.type !== 'note' || a.locked || a.inReplyTo || a.contents?.trim()) return false
  return repliesTo(list, id).length === 0
}
