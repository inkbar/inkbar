import type { AnnotationStore } from './store'
import type { Annotation } from './types'

/**
 * Keeps a suggested redaction as the user's own: `origin` becomes `'user'` and the colour
 * goes from the confidence colour to the store's default redaction colour, so an accepted
 * mark looks like any other. The suggestion details stay on it. Returns the updated
 * annotation, or undefined when `id` is not a suggested redaction (or is locked).
 */
export function acceptSuggestion(
  store: AnnotationStore,
  id: string
): Annotation | undefined {
  const a = store.get(id)
  if (a?.type !== 'redact' || a.origin !== 'suggested') return undefined
  return store.update(id, { origin: 'user', color: store.defaults.color('redact') })
}
