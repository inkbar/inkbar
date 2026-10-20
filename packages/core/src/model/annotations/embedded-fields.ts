import {
  readFreeTextFields,
  readTextIcon,
  refOfPdfjsId,
} from '../../pdf/annotation-fields'
import { openPdfObjects, type PdfObjects } from '../../pdf/objects'

import { AnnotationSchema, type Annotation } from './types'

import type { EmbeddedFieldPatch, EmbeddedTarget } from './embedded'
import type { PdfRef } from '../../pdf/lexer'

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
 * Reads every target once, calling `getData` only if a target names an annotation in
 * `annotations` by an object reference, and returns the fields read, by id. A target the file
 * adds nothing to, or whose fields would fail the schema, is left out. Never throws: any
 * failure leaves the annotations as they are.
 */
export async function readEmbeddedFields(
  annotations: readonly Annotation[],
  targets: readonly EmbeddedTarget[],
  getData: () => Promise<Uint8Array>
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
    const objs = await openPdfObjects(await getData())
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
