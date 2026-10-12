import { isProduction } from '../env'

import {
  ANNOTATION_FORMAT,
  ANNOTATION_VERSION,
  AnnotationDocumentSchema,
  AnnotationSchema,
  type Annotation,
  type AnnotationDocument,
} from './types'

import type { AnnotationStore } from './store'

export interface ImportResult {
  imported: number
  /** Items whose `type` this version does not know. Keep them and pass them back to exportAnnotations. */
  unknown: unknown[]
  errors: { index: number; issues: string[] }[]
}

export interface ImportOptions {
  /** `replace` drops every session annotation first; `merge` overwrites by id and keeps the rest. */
  mode: 'replace' | 'merge'
}

const KNOWN_TYPES: ReadonlySet<string> = new Set(
  AnnotationSchema.options.flatMap((o) => [...o.shape.type._zod.values] as string[])
)

/** Session annotations plus any preserved unknown items. Embedded (`source: 'pdf'`) ones stay in the file. */
export function exportAnnotations(
  store: AnnotationStore,
  preserved: unknown[] = [],
  documentKey?: string
): AnnotationDocument {
  const session = store.list.get().filter((a) => a.source === 'session')
  return {
    format: ANNOTATION_FORMAT,
    version: ANNOTATION_VERSION,
    ...(documentKey === undefined ? {} : { documentKey }),
    annotations: [...session, ...(preserved as Annotation[])],
  }
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
  const raw: unknown = typeof data === 'string' ? JSON.parse(data) : data
  const envelope = AnnotationDocumentSchema.safeParse(raw)
  if (!envelope.success) {
    throw new TypeError(
      `Expected an ${ANNOTATION_FORMAT} v${ANNOTATION_VERSION} document: ${envelope.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')}`
    )
  }
  const embedded = store.list.get().filter((a) => a.source === 'pdf')
  const embeddedIds = new Set(embedded.map((a) => a.id))
  const result: ImportResult = { imported: 0, unknown: [], errors: [] }
  const incoming: Annotation[] = []
  envelope.data.annotations.forEach((item, index) => {
    const type = (item as { type?: unknown } | null)?.type
    if (typeof type === 'string' && !KNOWN_TYPES.has(type)) {
      result.unknown.push(item)
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
    incoming.push({ ...parsed.data, source: 'session' })
    result.imported++
  })

  if (opts.mode === 'replace') {
    store.replaceAll([...embedded, ...incoming], 'import')
  } else {
    const byId = new Map(
      store.list
        .get()
        .filter((a) => a.source === 'session')
        .map((a) => [a.id, a])
    )
    for (const a of incoming) byId.set(a.id, a)
    store.replaceAll([...embedded, ...byId.values()], 'import')
  }

  if (result.unknown.length > 0 && !isProduction()) {
    const types = [
      ...new Set(result.unknown.map((u) => String((u as { type: unknown }).type))),
    ]
    console.warn(
      `[inkbar] importAnnotations kept ${result.unknown.length} annotation(s) of unknown type ` +
        `(${types.join(', ')}). They are not shown, and exportAnnotations writes them back out.`
    )
  }
  return result
}
