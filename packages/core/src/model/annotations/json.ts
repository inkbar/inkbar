import { isProduction } from '../env'

import {
  ANNOTATION_FORMAT,
  ANNOTATION_VERSION,
  AnnotationDocumentSchema,
  AnnotationSchema,
  type Annotation,
  type AnnotationDocument,
  type ForeignAnnotation,
} from './types'

import type { AnnotationStore } from './store'

export interface ImportResult {
  imported: number
  /**
   * Items whose `type` this version does not know (they still need a string `id` and a numeric
   * `page`). Keep them and pass them back to exportAnnotations.
   */
  unknown: ForeignAnnotation[]
  errors: { index: number; issues: string[] }[]
}

export interface ImportOptions {
  /** `replace` drops every session annotation first; `merge` overwrites by id and keeps the rest. */
  mode: 'replace' | 'merge'
}

const KNOWN_TYPES: ReadonlySet<string> = new Set(
  AnnotationSchema.options.flatMap((o) => [...o.shape.type._zod.values] as string[])
)

/**
 * Session annotations plus any preserved foreign items. Embedded (`source: 'pdf'`) ones stay in
 * the file. Everything is a deep copy, so editing the result never touches the store.
 *
 * Without foreign items the result validates against this version's `schema.json`. With them it
 * validates only against the newer schema that produced them, since this version's schema
 * describes only the types it knows.
 */
export function exportAnnotations(
  store: AnnotationStore,
  preserved: readonly ForeignAnnotation[] = [],
  documentKey?: string
): AnnotationDocument {
  const session = store.list.get().filter((a) => a.source === 'session')
  return {
    format: ANNOTATION_FORMAT,
    version: ANNOTATION_VERSION,
    ...(documentKey === undefined ? {} : { documentKey }),
    annotations: structuredClone([...session, ...preserved]),
  }
}

/** @internal A validated import that has not touched the store yet. */
export interface ImportPlan {
  result: ImportResult
  /** Every id the payload brings in, known or foreign. */
  ids: ReadonlySet<string>
  /** Applies the plan to the store (one `replaceAll(..., 'import')`). */
  apply(): void
}

/**
 * Validates the envelope (throws a TypeError when it is not an inkbar/annotations v1 document),
 * then each item on its own. Embedded annotations are never touched; imported items become
 * session annotations.
 */
export function importAnnotations(
  store: AnnotationStore,
  data: AnnotationDocument | string,
  opts: ImportOptions
): ImportResult {
  const plan = planImport(store, data, opts)
  plan.apply()
  return plan.result
}

/**
 * @internal Validation half of `importAnnotations`, so the document can record foreign items
 * before the store publishes the change.
 *
 * Ids are unique across the payload: the first item with an id wins, and later ones (known or
 * foreign) are reported in `errors`. In `merge` mode an incoming item replaces whatever session
 * annotation has its id, whether the incoming item is known or foreign.
 */
export function planImport(
  store: AnnotationStore,
  data: AnnotationDocument | string,
  opts: ImportOptions
): ImportPlan {
  const raw: unknown = typeof data === 'string' ? JSON.parse(data) : data
  const envelope = AnnotationDocumentSchema.safeParse(raw)
  if (!envelope.success) {
    throw new TypeError(
      `Expected an ${ANNOTATION_FORMAT} v${ANNOTATION_VERSION} document: ${envelope.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')}`
    )
  }
  const embeddedIds = new Set(
    store.list
      .get()
      .filter((a) => a.source === 'pdf')
      .map((a) => a.id)
  )
  const result: ImportResult = { imported: 0, unknown: [], errors: [] }
  const incoming: Annotation[] = []
  /** id -> index of the item that claimed it. */
  const seen = new Map<string, number>()
  const claim = (id: string, index: number): boolean => {
    const first = seen.get(id)
    if (first === undefined) {
      seen.set(id, index)
      return true
    }
    result.errors.push({
      index,
      issues: [`id: duplicate id "${id}", already used by item ${first}`],
    })
    return false
  }

  envelope.data.annotations.forEach((item, index) => {
    const type = (item as { type?: unknown } | null)?.type
    if (typeof type === 'string' && !KNOWN_TYPES.has(type)) {
      if (!isForeign(item)) {
        result.errors.push({
          index,
          issues: [
            `type: unknown type "${type}" needs a string id and a numeric page to be preserved`,
          ],
        })
      } else if (claim(item.id, index)) {
        result.unknown.push(item)
      }
      return
    }
    const parsed = AnnotationSchema.safeParse(item)
    if (!parsed.success) {
      result.errors.push({
        index,
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      })
      return
    }
    if (embeddedIds.has(parsed.data.id)) {
      result.errors.push({
        index,
        issues: [
          'id: matches an annotation embedded in the PDF, which import never replaces',
        ],
      })
      return
    }
    if (!claim(parsed.data.id, index)) return
    incoming.push({ ...parsed.data, source: 'session' })
    result.imported++
  })

  if (result.unknown.length > 0 && !isProduction()) {
    const types = [...new Set(result.unknown.map((u) => u.type))]
    console.warn(
      `[inkbar] importAnnotations kept ${result.unknown.length} annotation(s) of unknown type ` +
        `(${types.join(', ')}). They are not shown, and exportAnnotations writes them back out.`
    )
  }

  const ids: ReadonlySet<string> = new Set(seen.keys())
  return {
    result,
    ids,
    apply() {
      const current = store.list.get()
      const embedded = current.filter((a) => a.source === 'pdf')
      if (opts.mode === 'replace') {
        store.replaceAll([...embedded, ...incoming], 'import')
        return
      }
      const byId = new Map(
        current
          .filter((a) => a.source === 'session' && !ids.has(a.id))
          .map((a) => [a.id, a])
      )
      for (const a of incoming) byId.set(a.id, a)
      store.replaceAll([...embedded, ...byId.values()], 'import')
    },
  }
}

function isForeign(item: unknown): item is ForeignAnnotation {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return false
  const { type, id, page } = item as Record<string, unknown>
  return typeof type === 'string' && typeof id === 'string' && typeof page === 'number'
}
