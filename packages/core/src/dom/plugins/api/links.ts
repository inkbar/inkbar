/*
 * Links between a plugin's records and the annotations it creates from them. The link lives in
 * the annotation, as `custom.<plugin>.<records name> = <record id>`, so it survives a Gloss
 * export and import.
 */
import type { AnnotationEdit } from '../../../model/annotations/store'
import type {
  Annotation,
  AnnotationInput,
  AnnotationType,
} from '../../../model/annotations/types'
import type { InkDocument } from '../../../model/document'
import type { RecordBase } from '../../../model/records'

/** What `add` takes for annotations of type `K`. */
export type AnnotationInputOf<K extends AnnotationType> = AnnotationInput extends infer I
  ? I extends { type: infer U }
    ? K extends U
      ? I & { type: K }
      : never
    : never
  : never

type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export interface AnnotationLinkSpec<T extends RecordBase, K extends AnnotationType> {
  /** The annotation's fields for `record`. Without a colour it gets the type's default. */
  from(record: T): OmitEach<AnnotationInputOf<K>, 'type' | 'color'> & { color?: string }
  /** Runs once per linked annotation the user removes, inside that edit's undo step. */
  onRemoved?(record: T, annotation: Annotation): void
  /** Runs for each user update of a linked annotation, inside that edit's undo step. */
  onChanged?(record: T, annotation: Annotation): void
}

export interface AnnotationLink<T extends RecordBase> {
  /** Adds an annotation made from `record` and linked to it; `undefined` with no document open. */
  add(record: T): Annotation | undefined
  /** The annotations of this link's type linked to `record`, in document order. */
  of(record: T): Annotation[]
}

export interface LinkDeps<T extends RecordBase> {
  plugin: string
  /** The records name: the key under `custom.<plugin>`. */
  name: string
  onAnnotationEdit(fn: (edit: AnnotationEdit) => void): void
  /** The document the records belong to, or null while they are inert. */
  document(): InkDocument | null
  find(id: string): T | undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Links `type` annotations to records; registers one `onAnnotationEdit` listener. */
export function createLink<T extends RecordBase, K extends AnnotationType>(
  deps: LinkDeps<T>,
  type: K,
  spec: AnnotationLinkSpec<T, K>
): AnnotationLink<T> {
  const linkOf = (a: Annotation): string | undefined => {
    if (a.type !== type) return undefined
    const own = a.custom?.[deps.plugin]
    const id = isObject(own) ? own[deps.name] : undefined
    return typeof id === 'string' ? id : undefined
  }
  deps.onAnnotationEdit((edit) => {
    if (edit.kind === 'add') return
    const annotation = edit.kind === 'remove' ? edit.annotation : edit.after
    const id = linkOf(annotation)
    const record = id === undefined ? undefined : deps.find(id)
    if (!record) return
    if (edit.kind === 'remove') spec.onRemoved?.(record, annotation)
    else spec.onChanged?.(record, annotation)
  })
  return {
    add(record) {
      const doc = deps.document()
      if (!doc) return undefined
      const { color, custom, ...fields } = spec.from(record) as {
        color?: string
        custom?: Record<string, unknown>
      }
      const own = custom?.[deps.plugin]
      return doc.annotations.add({
        ...fields,
        type,
        color: color ?? doc.annotations.defaults.color(type),
        custom: {
          ...custom,
          [deps.plugin]: { ...(isObject(own) ? own : {}), [deps.name]: record.id },
        },
      } as AnnotationInput)
    },
    of(record) {
      const doc = deps.document()
      return doc ? doc.annotations.list.get().filter((a) => linkOf(a) === record.id) : []
    },
  }
}
