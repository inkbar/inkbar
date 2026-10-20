import {
  readFreeTextFields,
  readTextIcon,
  refOfPdfjsId,
} from '../../pdf/annotation-fields'
import { openPdfObjects, type PdfObjects } from '../../pdf/objects'

import { AnnotationSchema, type Annotation } from './types'

import type { EmbeddedTarget } from './embedded'
import type { PdfRef } from '../../pdf/lexer'

/**
 * Reads every target once, calling `getData` only if `targets` is non-empty, and returns the
 * patched annotations by id. An annotation the file adds nothing to, or whose patch fails the
 * schema, is left out. Never throws: any failure leaves the annotations as they are.
 */
export async function readEmbeddedFields(
  annotations: readonly Annotation[],
  targets: readonly EmbeddedTarget[],
  getData: () => Promise<Uint8Array>
): Promise<Map<string, Annotation>> {
  const patched = new Map<string, Annotation>()
  if (targets.length === 0) return patched
  try {
    const byId = new Map(annotations.map((a) => [a.id, a]))
    const work = targets.flatMap((target) => {
      const current = byId.get(target.id)
      const ref = refOfPdfjsId(target.id.split(':')[2] ?? '')
      return current && ref ? [{ target, current, ref }] : []
    })
    if (work.length === 0) return patched
    const objs = await openPdfObjects(await getData())
    if (!objs) return patched
    for (const { target, current, ref } of work) {
      try {
        const next = await patch(objs, target, current, ref)
        if (next) patched.set(current.id, next)
      } catch {
        // One unreadable annotation does not stop the others.
      }
    }
  } catch {
    // Unreadable bytes leave every annotation as PDF.js imported it.
  }
  return patched
}

async function patch(
  objs: PdfObjects,
  target: EmbeddedTarget,
  current: Annotation,
  ref: PdfRef
): Promise<Annotation | undefined> {
  let candidate: Record<string, unknown>
  if (target.subtype === 'Text' && current.type === 'text') {
    const icon = await readTextIcon(objs, ref)
    if (icon === undefined) return undefined
    candidate = { ...current, icon }
  } else if (target.subtype === 'FreeText' && current.type === 'freetext') {
    const { font, ...geometry } = await readFreeTextFields(
      objs,
      ref,
      target.rect,
      target.daFont
    )
    if (!font && Object.keys(geometry).length === 0) return undefined
    candidate = {
      ...current,
      ...geometry,
      defaultStyle: { ...current.defaultStyle, ...font },
    }
  } else {
    return undefined
  }
  const parsed = AnnotationSchema.safeParse(candidate)
  return parsed.success ? parsed.data : undefined
}
