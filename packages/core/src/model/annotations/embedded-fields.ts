import {
  pdfjsIdOfRef,
  readFreeTextFields,
  readInkbarData,
  readSavedAnnotations,
  readTextIcon,
  refOfPdfjsId,
} from '../../pdf/annotation-fields'
import { hasArea, normaliseQuad, quadsFromFlat, rectFromQuads } from '../geometry'

import { importedId, pdfColorToHex } from './embedded'
import { liftable } from './saved-data'
import { AnnotationSchema, type Annotation } from './types'

import type { EmbeddedFieldPatch, EmbeddedTarget } from './embedded'
import type { ForeignMarkPlace } from '../../pdf/annotation-fields'
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

/** A file annotation that joins the session: one Inkbar wrote, or another program's mark. */
export interface LiftedAnnotation {
  /** The annotation as it was saved or imported, a session annotation on the file's page. */
  annotation: Annotation
  /** Full name of the signature field it signs, if any. */
  signs?: string
  /** The id PDF.js gives the file's copy, which renders leave out. */
  pdfjsId: string
  /** The id the file's copy has when imported as an embedded annotation. */
  embeddedId: string
  /** The PDF.js id of the file copy's pop-up, removed and hidden with it. Adopted marks only. */
  popupId?: string
}

/**
 * The annotations the file holds that Inkbar wrote and nothing has changed since, in file
 * order: page by page, each in `/Annots` order, followed by the file's other Redact annotations
 * that `marks` holds, adopted as session marks. Calls `objects` once; none comes back for an
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
 *
 * `marks` is the file's Redact annotations as imported (`source: 'pdf'`), by id. Without an entry
 * for a mark, it stays in the file.
 */
export async function readLifted(
  objects: () => Promise<PdfObjects | undefined>,
  inFile: ReadonlySet<string> = new Set(),
  /** The file's Redact annotations as imported (`source: 'pdf'`), by id. */
  marks: ReadonlyMap<string, Annotation> = new Map()
): Promise<LiftedAnnotation[]> {
  const found: LiftedAnnotation[] = []
  /** Every `/IRT` in the file, as PDF.js ids. */
  let links: { from: string; to: string }[] = []
  try {
    const objs = await objects()
    if (!objs) return found
    const ids = new Set<string>()
    const { places, replies, marks: foreign } = await readSavedAnnotations(objs)
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
    for (const place of foreign) {
      const adopted = adoptedMark(place, marks)
      if (!adopted || ids.has(adopted.annotation.id)) continue
      ids.add(adopted.annotation.id)
      found.push(adopted)
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

/**
 * Another program's Redact annotation as a session mark: the imported one with its quads and
 * fill read from the file, unlocked. Its quads have their corners put in `Quad`'s order, and
 * its `rect` is then their bounding box, as a mark Inkbar makes from text has it. Undefined when
 * `marks` lacks the imported annotation, its pop-up cannot go with it (see
 * `ForeignMarkPlace.popupListed`), or the result fails the schema.
 */
function adoptedMark(
  m: ForeignMarkPlace,
  marks: ReadonlyMap<string, Annotation>
): LiftedAnnotation | undefined {
  const pdfjsId = pdfjsIdOfRef(m.ref)
  const embeddedId = importedId(m.page, pdfjsId)
  const imported = marks.get(embeddedId)
  if (!imported || (m.popup && !m.popupListed)) return undefined
  const { locked: _locked, hasAppearance: _appearance, ...withQuads } = imported
  const { quads: _quads, ...rest } = withQuads as typeof withQuads & { quads?: unknown }
  const quads = m.quadPoints
    ? quadsFromFlat(m.quadPoints.flat()).filter(hasArea).map(normaliseQuad)
    : []
  const candidate = {
    ...rest,
    id: `redact-${pdfjsId}`,
    source: 'session',
    ...(quads.length > 0 ? { quads, rect: rectFromQuads(quads) } : {}),
    ...(m.fill ? { interiorColor: fillHex(m.fill, imported) } : {}),
  }
  const parsed = AnnotationSchema.safeParse(candidate)
  if (!parsed.success) return undefined
  return {
    annotation: parsed.data,
    pdfjsId,
    embeddedId,
    ...(m.popup ? { popupId: pdfjsIdOfRef(m.popup) } : {}),
  }
}

/**
 * `/IC` (grey, RGB or CMYK, each 0..1) as `#RRGGBB`. A component outside 0..1 is taken as the
 * nearer end, so `[255 0 0]` is red.
 */
function fillHex(c: readonly number[], imported: Annotation): string {
  const n = c.map((v) => Math.min(1, Math.max(0, v)))
  const rgb =
    n.length === 1
      ? [n[0]!, n[0]!, n[0]!]
      : n.length === 4
        ? [0, 1, 2].map((i) => 1 - Math.min(1, n[i]! + n[3]!))
        : n
  return pdfColorToHex(
    rgb.map((n) => n * 255),
    imported.type === 'redact' ? imported.interiorColor : '#000000'
  )
}
