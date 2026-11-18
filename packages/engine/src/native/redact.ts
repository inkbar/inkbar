import { EngineError } from '../errors.ts'

import { writeAnnotation } from './annotations.ts'
import { buildAppearance } from './appearance.ts'
import { formFieldNames, writeFields } from './fields.ts'
import { withFloats, withInts, type Heap } from './strings.ts'

import type {
  AnnotationRef,
  Rect,
  RedactInput,
  RedactResult,
  WriteAnnotation,
} from '../types.ts'

/** What sanitising found, as the fork's flags. */
const SANITISED = {
  metadata: 1,
  attachments: 2,
  scripts: 4,
  thumbnails: 8,
  privateData: 16,
} as const

/** What `applyRedactions` needs to know of the document besides its handle. */
export interface RedactContext {
  /** The file's bytes as opened, in engine memory, and their length. */
  data: number
  size: number
  pageCount: number
  /** Whether the file is encrypted, so Inkbar's earlier marks in it came back locked. */
  encrypted: boolean
  /** The page box of a loaded page, in PDF user space. */
  pageBox(page: number): Rect
  /** Writes annotations into the document as `write` does. */
  writeAnnotations(annotations: readonly WriteAnnotation[]): void
}

/** x1 y1 to x4 y4: top left, top right, bottom left, bottom right, as /QuadPoints. */
type Corners = readonly number[]

/** The regions a mark removes: its Gloss quads, or its rectangle when it has none. */
function regionsOf(item: WriteAnnotation): { corners: Corners[]; fromRect: boolean } {
  const { annotation } = item
  const quads = annotation.type === 'redact' ? annotation.quads : undefined
  if (quads && quads.length > 0)
    return {
      corners: quads.map((q) => [
        q.p1.x,
        q.p1.y,
        q.p2.x,
        q.p2.y,
        q.p3.x,
        q.p3.y,
        q.p4.x,
        q.p4.y,
      ]),
      fromRect: false,
    }
  const { x, y, width, height } = annotation.rect
  return {
    corners: [[x, y + height, x + width, y + height, x, y, x + width, y]],
    fromRect: true,
  }
}

/** Whether a region has an area that meets the inside of `box`. */
function reaches(corners: Corners, box: Rect): boolean {
  const [x1, y1, x2, y2, x3, y3, x4, y4] = corners as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  // The corners in order around the quad: top left, top right, bottom right, bottom left.
  const area = Math.abs(
    x1 * y2 - x2 * y1 + (x2 * y4 - x4 * y2) + (x4 * y3 - x3 * y4) + (x3 * y1 - x1 * y3)
  )
  const xs = [x1, x2, x3, x4]
  const ys = [y1, y2, y3, y4]
  return (
    area > 0 &&
    Math.max(...xs) > box.x &&
    Math.min(...xs) < box.x + box.width &&
    Math.max(...ys) > box.y &&
    Math.min(...ys) < box.y + box.height
  )
}

/**
 * Whether a mark is skipped: every region it has lacks an area or lies wholly outside the page
 * box. A mark with a number that is not finite is not skipped, so writing it reports the fault.
 */
function skipped(item: WriteAnnotation, box: Rect): boolean {
  const { corners } = regionsOf(item)
  return corners.every((c) => c.every(Number.isFinite) && !reaches(c, box))
}

/** Runs `use` with two zeroed 32-bit outputs, and returns its result with their values. */
function withOutputs<T>(heap: Heap, use: (first: number, second: number) => T) {
  return withInts(heap, [0, 0], (out) => {
    const value = use(out, out + 4)
    const view = new DataView(heap.native.HEAPU8.buffer, heap.native.HEAPU8.byteOffset)
    return {
      value,
      first: view.getUint32(out, true),
      second: view.getUint32(out + 4, true),
    }
  })
}

/** The fork's report on the file's bytes, read as JSON and freed. */
function inspectFile(heap: Heap, doc: number, context: RedactContext) {
  const { fn } = heap
  const report = fn.INK_Inspect_File(doc, context.data, context.size)
  if (report === 0)
    throw new EngineError('redaction-failed', 'The file could not be inspected.')
  try {
    const bytes = heap.native.HEAPU8
    const end = bytes.indexOf(0, report)
    const text = new TextDecoder().decode(bytes.subarray(report, end))
    const parsed = JSON.parse(text) as { hiddenLayers?: unknown; signed?: unknown }
    return { hiddenLayers: parsed.hiddenLayers === true, signed: parsed.signed === true }
  } finally {
    if (!heap.stopped) fn.INK_Inspect_Free(report)
  }
}

/**
 * Writes one mark on `page` and returns its handle, which the caller closes: the annotation as
 * `write` writes it, its regions as /QuadPoints, and its appearance as the overlay the apply
 * leaves in its place. A failure is `redaction-failed` naming the page and the mark.
 */
function writeMark(heap: Heap, doc: number, page: number, item: WriteAnnotation): number {
  const { fn } = heap
  const id = item.annotation.id
  const failed = (what: string, cause?: unknown) =>
    new EngineError(
      'redaction-failed',
      `The mark ${id} on page ${item.page} could not be written: ${what}`,
      { page: item.page, annotation: id, cause }
    )
  if (item.annotation.type !== 'redact')
    throw failed(`its type ${String(item.annotation.type)} is not redact.`)
  let annot: number
  try {
    annot = writeAnnotation(heap, doc, page, item, new Map())
  } catch (error) {
    if (error instanceof EngineError && error.code === 'write-failed')
      throw failed(error.message, error)
    throw error
  }
  try {
    // A mark with Gloss quads has them as /QuadPoints already. One without gets its rectangle,
    // since the /Rect written from the appearance is padded for the outline.
    const { corners, fromRect } = regionsOf(item)
    if (fromRect)
      for (const quad of corners)
        if (!withFloats(heap, quad, (q) => fn.FPDFAnnot_AppendAttachmentPoints(annot, q)))
          throw failed('its /QuadPoints could not be set.')
    // The overlay takes the appearance whether or not it works.
    const overlay = buildAppearance(heap, doc, item.appearance!, (what) =>
      failed(`${what}.`)
    )
    if (!fn.INK_Redact_SetOverlay(doc, annot, overlay))
      throw failed('its overlay could not be set.')
    return annot
  } catch (error) {
    if (!heap.stopped) fn.FPDFPage_CloseAnnot(annot)
    throw error
  }
}

/**
 * Applies the marks of `input` to `doc` and sanitises it, in order: removes `remove`, writes
 * the marks, applies them page by page, writes `annotations`, writes the `fields` whose widgets
 * survive, and sanitises. Every page is visited, to count other programs' marks and, in an
 * encrypted file, to apply Inkbar's earlier locked ones. A failure leaves the document partly
 * changed, so the caller discards it.
 */
export function applyRedactions(
  heap: Heap,
  doc: number,
  input: RedactInput,
  context: RedactContext
): RedactResult {
  const { fn } = heap
  const file = inspectFile(heap, doc, context)
  const fields = Object.entries(input.fields ?? {})
  const fieldsBefore = fields.length > 0 ? formFieldNames(heap, doc) : new Set<string>()

  const loadPage = (index: number) => {
    const page = fn.FPDF_LoadPage(doc, index)
    if (page === 0)
      throw new EngineError('redaction-failed', `Page ${index} could not be loaded.`, {
        page: index,
        pdfiumError: fn.FPDF_GetLastError(),
      })
    return page
  }
  const withPage = <T>(index: number, use: (page: number) => T): T => {
    const page = loadPage(index)
    try {
      return use(page)
    } finally {
      if (!heap.stopped) fn.FPDF_ClosePage(page)
    }
  }

  const removals = new Map<number, AnnotationRef[]>()
  for (const ref of input.remove ?? [])
    removals.set(ref.page, [...(removals.get(ref.page) ?? []), ref])
  for (const [index, refs] of removals)
    withPage(index, (page) => {
      for (const ref of refs)
        if (!fn.EPDFPage_RemoveAnnotByObjectNumber(page, ref.objectNumber))
          throw new EngineError(
            'redaction-failed',
            `The annotation in object ${ref.objectNumber} on page ${index} could not be removed.`,
            { page: index }
          )
    })

  const marksByPage = new Map<number, WriteAnnotation[]>()
  for (const item of input.marks)
    marksByPage.set(item.page, [...(marksByPage.get(item.page) ?? []), item])

  /** INK_Redact_ApplyPage: its result, the annotations it removed, the Redacts it left. */
  const applyPage = (page: number, marks: readonly number[], ownLocked: boolean) =>
    withInts(heap, marks, (pointer, count) =>
      withOutputs(heap, (removed, left) =>
        fn.INK_Redact_ApplyPage(
          doc,
          page,
          count === 0 ? 0 : pointer,
          count,
          ownLocked ? 1 : 0,
          removed,
          left
        )
      )
    )

  const pages: RedactResult['pages'] = []
  let ownLockedMarks = 0
  let foreignMarks = 0
  for (let index = 0; index < context.pageCount; index++)
    withPage(index, (page) => {
      const box = context.pageBox(page)
      const marks = (marksByPage.get(index) ?? []).filter((item) => !skipped(item, box))
      const handles: number[] = []
      try {
        for (const item of marks) handles.push(writeMark(heap, doc, page, item))
        // Applying nothing leaves the page as it is and counts its Redact annotations.
        const before = context.encrypted ? applyPage(page, [], false).second : 0
        const applied = applyPage(page, handles, context.encrypted)
        // The marks of a page are applied together, so a failure names the page only.
        if (applied.value < 0)
          throw new EngineError(
            'redaction-failed',
            `The marks on page ${index} could not be applied.`,
            { page: index }
          )
        foreignMarks += applied.second
        if (applied.value === 1) {
          const own = context.encrypted ? before - applied.second - handles.length : 0
          ownLockedMarks += own
          pages.push({
            page: index,
            marks: handles.length + own,
            annotationsRemoved: applied.first,
          })
        }
      } finally {
        if (!heap.stopped) for (const annot of handles) fn.FPDFPage_CloseAnnot(annot)
      }
    })

  context.writeAnnotations(input.annotations ?? [])

  const fieldsSkipped: string[] = []
  if (fields.length > 0) {
    const fieldsAfter = formFieldNames(heap, doc)
    const kept = fields.filter(([name]) => {
      const gone = fieldsBefore.has(name) && !fieldsAfter.has(name)
      if (gone) fieldsSkipped.push(name)
      return !gone
    })
    // A name the opened file never had is refused here, as `write` refuses it.
    writeFields(heap, doc, Object.fromEntries(kept))
  }

  const sanitised = withOutputs(heap, (flags, attachments) =>
    fn.INK_Sanitize(doc, flags, attachments)
  )
  if (!sanitised.value)
    throw new EngineError('redaction-failed', 'The file could not be sanitised.')
  const flags = sanitised.first
  return {
    pages,
    ownLockedMarks,
    foreignMarks,
    fieldsSkipped,
    sanitised: {
      metadata: (flags & SANITISED.metadata) !== 0,
      attachments: sanitised.second,
      scripts: (flags & SANITISED.scripts) !== 0,
      thumbnails: (flags & SANITISED.thumbnails) !== 0,
      privateData: (flags & SANITISED.privateData) !== 0,
    },
    hiddenLayers: file.hiddenLayers,
    signed: file.signed,
  }
}
