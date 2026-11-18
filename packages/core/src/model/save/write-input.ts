// What a save hands the engine: each session annotation with the appearance core paints for it
// and the data that brings it back on open, the file copies to remove, and the form values.
import { describeDrawing, dimmingMask } from '../annotations/drawing/describe'
import { paintDrawing, type PaintHelpers } from '../annotations/drawing/pdf/paint'
import { standardMeasure } from '../annotations/drawing/text/measure'
import { toGloss } from '../annotations/json'
import { savedDataFor } from '../annotations/saved-data'
import { isReply } from '../annotations/threads'

import type { FieldChange } from './changes'
import type { DrawContext } from '../annotations/drawing/types'
import type { Annotation } from '../annotations/types'
import type { FormField } from '../form/types'
import type { Rect } from '../geometry'
import type { PageInfo } from '../pages'
import type {
  AnnotationRef,
  WriteAnnotation,
  WriteField,
  WriteInput,
} from '@inkbar/engine'

/** How to write one annotation. */
export interface WriteAnnotationOptions {
  /** The page it is on. */
  page: DrawContext['page']
  /** Written as a reply: a hidden note, with no appearance. */
  reply: boolean
  /** The file's own annotation it replies to, when its parent is not written with it. */
  replyTo?: AnnotationRef | undefined
  /** Full name of the signature field it signs, if any. */
  signs?: string | undefined
  helpers: Omit<PaintHelpers, 'page'>
  /** The data to store; `savedDataFor` of the annotation when absent. Fixtures only. */
  data?: (bounds: Rect) => string
}

/**
 * `a` as the engine writes it: its Gloss form, the appearance painted from its drawing (none
 * for a reply), and the data stored with it. Rejects with an `UnpaintableError` when the
 * drawing needs a helper `helpers` lacks.
 */
export async function writeAnnotation(
  a: Annotation,
  options: WriteAnnotationOptions
): Promise<WriteAnnotation> {
  const stored = (bounds: Rect) =>
    options.data ? options.data(bounds) : savedDataFor(a, bounds, options.signs)
  const annotation = toGloss(a)
  if (options.replyTo)
    return { page: a.page, annotation, replyTo: options.replyTo, data: stored(a.rect) }
  if (options.reply) return { page: a.page, annotation, data: stored(a.rect) }
  // The engine writes `inReplyTo` as a reply. One whose parent is neither written nor in the
  // file shows on the page, so it is written as what it shows; its data keeps the link.
  delete annotation.inReplyTo
  const drawing = describeDrawing(a, { page: options.page, measure: standardMeasure })
  if (!drawing) throw new Error(`An annotation of type ${a.type} has no drawing`)
  const appearance = await paintDrawing(drawing, { ...options.helpers, page: a.page })
  return { page: a.page, annotation, appearance, data: stored(appearance.bounds) }
}

/**
 * The form values to write, and the signature links, by annotation id, to store with their
 * annotations. A signature is never a field value in the file. An emptied field is written as
 * its empty value: `''`, `'Off'` or no options.
 */
export function writeFields(
  changes: Readonly<Record<string, FieldChange>>,
  fields: readonly FormField[]
): { fields: Record<string, WriteField>; signs: Map<string, string> } {
  const types = new Map(fields.map((f) => [f.name, f.type]))
  const out: Record<string, WriteField> = {}
  const signs = new Map<string, string>()
  for (const [name, { value, text }] of Object.entries(changes)) {
    const type = types.get(name)
    if (type === undefined || type === 'button' || type === 'signature') {
      if (value !== null && typeof value === 'object' && !Array.isArray(value))
        signs.set((value as { signature: string }).signature, name)
      continue
    }
    let written: string | readonly string[]
    if (value === null)
      written =
        type === 'list' ? [] : type === 'checkbox' || type === 'radio' ? 'Off' : ''
    else if (typeof value === 'string' || Array.isArray(value))
      written = value as string | readonly string[]
    else continue
    out[name] = text === undefined ? { value: written } : { value: written, text }
  }
  return { fields: out, signs }
}

/**
 * Everything one save writes. Per page, in page order: the page's dimming mask first, under
 * everything, then its other annotations in list order, each reply after the note it replies
 * to. `lifted` are the file copies of the annotations lifted at open, removed first.
 * `fileParents` are the file's own annotations a reply can hang from (notes and text markup
 * that stay in the file, locked), by id: a reply to one of them is written linked to it.
 */
export async function buildWriteInput(state: {
  annotations: readonly Annotation[]
  pages: readonly PageInfo[]
  lifted: readonly AnnotationRef[]
  fields: Readonly<Record<string, WriteField>>
  signs: ReadonlyMap<string, string>
  helpers: Omit<PaintHelpers, 'page'>
  fileParents?: ReadonlyMap<string, AnnotationRef> | undefined
}): Promise<WriteInput> {
  const { annotations } = state
  const writtenIds = new Set(annotations.map((a) => a.id))
  const fileParentOf = (a: Annotation): AnnotationRef | undefined =>
    a.inReplyTo === undefined || writtenIds.has(a.inReplyTo)
      ? undefined
      : state.fileParents?.get(a.inReplyTo)
  const byPage = new Map<number, Annotation[]>()
  for (const a of annotations) {
    const list = byPage.get(a.page)
    if (list) list.push(a)
    else byPage.set(a.page, [a])
  }
  const ordered: Annotation[] = []
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const list = byPage.get(page)!
    const mask = dimmingMask(list)
    ordered.push(...(mask ? [mask, ...list.filter((a) => a !== mask)] : list))
  }

  // A reply waits for its parent: the engine links it to one already written.
  const replies = new Set(annotations.filter((a) => isReply(a, annotations)))
  const waiting = new Map<string, Annotation[]>()
  const done = new Set<string>()
  const order: { a: Annotation; reply: boolean }[] = []
  const emit = (a: Annotation, reply: boolean) => {
    order.push({ a, reply })
    done.add(a.id)
    const children = waiting.get(a.id) ?? []
    waiting.delete(a.id)
    for (const child of children) emit(child, true)
  }
  for (const a of ordered) {
    if (!replies.has(a) || done.has(a.inReplyTo!)) {
      emit(a, replies.has(a))
      continue
    }
    const list = waiting.get(a.inReplyTo!)
    if (list) list.push(a)
    else waiting.set(a.inReplyTo!, [a])
  }
  // Replies in a loop, with no parent outside it, are written as what they are on their own.
  for (const list of waiting.values())
    for (const a of list) order.push({ a, reply: false })

  const written: WriteAnnotation[] = []
  for (const { a, reply } of order) {
    const page = state.pages[a.page]
    if (!page) throw new RangeError(`Page ${a.page} does not exist`)
    written.push(
      await writeAnnotation(a, {
        page: { box: page.box, rotate: page.rotate, userUnit: page.userUnit },
        reply,
        replyTo: fileParentOf(a),
        signs: state.signs.get(a.id),
        helpers: state.helpers,
      })
    )
  }
  return { remove: state.lifted, annotations: written, fields: state.fields }
}
