import {
  pdfjsIdOfRef,
  readFreeTextFields,
  readInkbarData,
  readSavedAnnotations,
  readTextIcon,
  refOfPdfjsId,
} from '../../pdf/annotation-fields'

import { importedId } from './embedded'
import { liftable } from './saved-data'
import { AnnotationSchema, type Annotation } from './types'

import type { EmbeddedFieldPatch, EmbeddedTarget } from './embedded'
import type { PdfRef } from '../../pdf/lexer'
import type { PdfObjects } from '../../pdf/objects'

/**
 * `a` with `fields` merged in: `callout`, `fringe`, `head` and the font keys of `defaultStyle`
 * on a FreeText, `icon` on a note. Undefined when `a` is not embedded, the fields do not fit its
 * type, or the result fails the schema.
 */
export function withEmbeddedFields(
  a: Annotation,
  fields: EmbeddedFieldPatch
): Annotation | undefined {
  if (a.source !== 'pdf') return undefined
  const { callout, fringe, head, icon, font } = fields
  let candidate: Record<string, unknown>
  if (a.type === 'text') {
    if (icon === undefined || callout || fringe || head !== undefined || font)
      return undefined
    candidate = { ...a, icon }
  } else if (a.type === 'freetext') {
    if (icon !== undefined) return undefined
    candidate = {
      ...a,
      ...(callout ? { callout } : {}),
      ...(fringe ? { fringe } : {}),
      ...(head !== undefined ? { head } : {}),
      defaultStyle: { ...a.defaultStyle, ...font },
    }
  } else {
    return undefined
  }
  const parsed = AnnotationSchema.safeParse(candidate)
  return parsed.success ? parsed.data : undefined
}

/**
 * Reads every target once, calling `objects` only if a target names an annotation in
 * `annotations` by an object reference, and returns the fields read, by id. A target the file
 * adds nothing to, or whose fields would fail the schema, is left out. Never throws: any
 * failure, or no objects (an encrypted or unreadable file), leaves the annotations as they are.
 */
export async function readEmbeddedFields(
  annotations: readonly Annotation[],
  targets: readonly EmbeddedTarget[],
  objects: () => Promise<PdfObjects | undefined>
): Promise<Map<string, EmbeddedFieldPatch>> {
  const read = new Map<string, EmbeddedFieldPatch>()
  if (targets.length === 0) return read
  try {
    const byId = new Map(annotations.map((a) => [a.id, a]))
    const work = targets.flatMap((target) => {
      const current = byId.get(target.id)
      const ref = refOfPdfjsId(target.id.split(':')[2] ?? '')
      return current && ref ? [{ target, current, ref }] : []
    })
    if (work.length === 0) return read
    const objs = await objects()
    if (!objs) return read
    for (const { target, current, ref } of work) {
      try {
        const fields = await readFields(objs, target, ref)
        if (fields && withEmbeddedFields(current, fields)) read.set(current.id, fields)
      } catch {
        // One unreadable annotation does not stop the others.
      }
    }
  } catch {
    // Unreadable bytes leave every annotation as PDF.js imported it.
  }
  return read
}

async function readFields(
  objs: PdfObjects,
  target: EmbeddedTarget,
  ref: PdfRef
): Promise<EmbeddedFieldPatch | undefined> {
  if (target.subtype === 'Text') {
    const icon = await readTextIcon(objs, ref)
    return icon === undefined ? undefined : { icon }
  }
  const fields = await readFreeTextFields(objs, ref, target.rect, target.daFont)
  return Object.keys(fields).length > 0 ? fields : undefined
}

/** A file annotation Inkbar wrote, read back to join the session. */
export interface LiftedAnnotation {
  /** The annotation as it was saved, a session annotation on the file's page. */
  annotation: Annotation
  /** Full name of the signature field it signs, if any. */
  signs?: string
  /** The id PDF.js gives the file's copy, which renders leave out. */
  pdfjsId: string
  /** The id the file's copy has when imported as an embedded annotation. */
  embeddedId: string
}

/**
 * The annotations the file holds that Inkbar wrote and nothing has changed since, in file
 * order: page by page, each in `/Annots` order. Calls `objects` once; none comes back for an
 * encrypted or unreadable file, which lifts nothing. When two carry the same id, the first is
 * lifted. A reply is lifted only with the annotation it replies to, or when it replies to one
 * of `inFile`: the ids of the file's own annotations that take replies, which stay in the list
 * locked.
 *
 * A save removes a lifted annotation's object and writes a new one, so an annotation that
 * something staying in the file points at is not lifted: one with a `/Popup`, which Inkbar never
 * writes, or one that an annotation not lifted names in its `/IRT`, such as a reply another
 * program added. It stays an ordinary locked file annotation, and so do Inkbar's own replies to
 * it. Never throws.
 */
export async function readLifted(
  objects: () => Promise<PdfObjects | undefined>,
  inFile: ReadonlySet<string> = new Set()
): Promise<LiftedAnnotation[]> {
  const found: LiftedAnnotation[] = []
  /** Every `/IRT` in the file, as PDF.js ids. */
  let links: { from: string; to: string }[] = []
  try {
    const objs = await objects()
    if (!objs) return found
    const ids = new Set<string>()
    const { places, replies } = await readSavedAnnotations(objs)
    links = replies.map((r) => ({ from: pdfjsIdOfRef(r.from), to: pdfjsIdOfRef(r.to) }))
    for (const place of places) {
      // Another program's pop-up names this object as its parent.
      if (!place.rect || place.popup) continue
      const json = await readInkbarData(objs, place.ref)
      const lifted =
        json === undefined
          ? undefined
          : liftable(json, {
              rect: place.rect,
              modified: place.modified,
              page: place.page,
            })
      if (!lifted || ids.has(lifted.annotation.id)) continue
      ids.add(lifted.annotation.id)
      const pdfjsId = pdfjsIdOfRef(place.ref)
      found.push({
        ...lifted,
        pdfjsId,
        embeddedId: importedId(place.page, pdfjsId),
      })
    }
  } catch {
    // What was read before the failure stands.
  }
  return withParents(found, inFile, links)
}

/**
 * `found` without the annotations that one staying in the file names in its `/IRT`, and without
 * the replies whose parent is neither among those kept nor in `inFile`. Each removal can strand
 * another, so both rules run until nothing more goes.
 */
function withParents(
  found: LiftedAnnotation[],
  inFile: ReadonlySet<string>,
  links: readonly { from: string; to: string }[]
): LiftedAnnotation[] {
  let kept = found
  for (;;) {
    const ids = new Set(kept.map((f) => f.annotation.id))
    const objects = new Set(kept.map((f) => f.pdfjsId))
    const named = new Set(links.filter((l) => !objects.has(l.from)).map((l) => l.to))
    const next = kept.filter(
      (f) =>
        !named.has(f.pdfjsId) &&
        (f.annotation.inReplyTo === undefined ||
          ids.has(f.annotation.inReplyTo) ||
          inFile.has(f.annotation.inReplyTo))
    )
    if (next.length === kept.length) return kept
    kept = next
  }
}
