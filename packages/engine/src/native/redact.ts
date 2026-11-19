import { EngineError, type UnremovableKind } from '../errors.ts'

import { writeAnnotation } from './annotations.ts'
import { buildAppearance } from './appearance.ts'
import { formFieldNames, writeFields } from './fields.ts'
import { groupByPage, inspectFile, isCount, isRecord, readReport } from './inspect.ts'
import { withFloats, withInts, type Heap } from './strings.ts'

import type { Rect, RedactInput, RedactResult, WriteAnnotation } from '../types.ts'
import type { Quad } from 'gloss-format'

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

/**
 * The most quads of earlier marks read from one page. The count comes from the file, and an
 * encrypted file is not ours to trust: each quad takes 32 bytes to read, so a count with no cap
 * could ask for hundreds of megabytes. No page Inkbar marked needs anywhere near this many.
 */
const MAX_LOCKED_QUADS_PER_PAGE = 10_000

/**
 * The quads of the Redact annotations on `page` that carry Inkbar's data: its earlier marks in
 * an encrypted file, read before the apply removes them. A failure, or more quads than
 * `MAX_LOCKED_QUADS_PER_PAGE`, is `redaction-failed` naming the page.
 */
function ownLockedQuads(heap: Heap, doc: number, page: number, index: number): Quad[] {
  const { fn } = heap
  const failed = () =>
    new EngineError(
      'redaction-failed',
      `The earlier marks on page ${index} could not be read.`,
      { page: index }
    )
  const count = fn.INK_Redact_OwnLockedQuads(doc, page, 0, 0)
  if (count < 0 || count > MAX_LOCKED_QUADS_PER_PAGE) throw failed()
  if (count === 0) return []
  return withFloats(heap, new Array<number>(count * 8).fill(0), (out) => {
    if (fn.INK_Redact_OwnLockedQuads(doc, page, out, count) !== count) throw failed()
    const floats = heap.native.HEAPF32.slice(out / 4, out / 4 + count * 8)
    return Array.from({ length: count }, (_, i): Quad => {
      const [x1, y1, x2, y2, x3, y3, x4, y4] = floats.subarray(i * 8, i * 8 + 8)
      return {
        p1: { x: x1!, y: y1! },
        p2: { x: x2!, y: y2! },
        p3: { x: x3!, y: y3! },
        p4: { x: x4!, y: y4! },
      }
    })
  })
}

/** The fork's counts, by the kind of content each one is. */
const UNREMOVABLE: readonly [string, UnremovableKind][] = [
  ['patterns', 'pattern'],
  ['shadings', 'shading'],
  ['maskGroups', 'mask-group'],
  ['glyphs', 'glyph'],
]

/**
 * Asks the fork what lies under each quad on page `index` that the apply cannot remove, on the
 * page as it is. Returns the kinds found under each quad, in order. A page it could not look at,
 * or a report that does not match what was asked, is `redaction-failed` with `reason:
 * 'could-not-inspect'`.
 */
function unremovableUnder(
  heap: Heap,
  doc: number,
  index: number,
  quads: readonly Corners[]
): Set<UnremovableKind>[] {
  const fail = (cause?: unknown) =>
    new EngineError(
      'redaction-failed',
      `What lies under the marks on page ${index} could not be inspected.`,
      { page: index, reason: 'could-not-inspect', cause }
    )
  const report = withFloats(heap, quads.flat(), (pointer) =>
    heap.fn.INK_Redact_Unremovable(doc, index, pointer, quads.length)
  )
  const parsed = readReport(heap, report, fail)
  const { regions } = parsed
  if (!Array.isArray(regions) || regions.length !== quads.length) throw fail()
  return regions.map((entry: unknown, i) => {
    if (!isRecord(entry) || entry.index !== i) throw fail()
    const kinds = new Set<UnremovableKind>()
    for (const [key, kind] of UNREMOVABLE) {
      const count = entry[key]
      if (!isCount(count)) throw fail()
      if (count > 0) kinds.add(kind)
    }
    return kinds
  })
}

/**
 * Refuses, before anything changes, marks over content the apply cannot remove: on every page
 * with marks it applies, the marks' regions, and on every page of an encrypted file, Inkbar's
 * earlier locked marks. Every offending mark on every page is named in one `redaction-failed`
 * with `reason: 'unremovable-content'`.
 */
function refuseUnremovable(
  heap: Heap,
  doc: number,
  marksByPage: ReadonlyMap<number, readonly WriteAnnotation[]>,
  context: RedactContext,
  withPage: <T>(index: number, use: (page: number) => T) => T
): void {
  const marks: string[] = []
  const kinds = new Set<UnremovableKind>()
  let first: number | undefined
  for (let index = 0; index < context.pageCount; index++) {
    const given = marksByPage.get(index) ?? []
    if (given.length === 0 && !context.encrypted) continue
    const asked = withPage(index, (page) => {
      const box = context.pageBox(page)
      const owners: (string | undefined)[] = []
      const quads: Corners[] = []
      for (const item of given) {
        if (skipped(item, box)) continue
        for (const corners of regionsOf(item).corners) {
          owners.push(item.annotation.id)
          quads.push(corners)
        }
      }
      if (context.encrypted)
        for (const q of ownLockedQuads(heap, doc, page, index)) {
          owners.push(undefined)
          quads.push([q.p1.x, q.p1.y, q.p2.x, q.p2.y, q.p3.x, q.p3.y, q.p4.x, q.p4.y])
        }
      return { owners, quads }
    })
    if (asked.quads.length === 0) continue
    const found = unremovableUnder(heap, doc, index, asked.quads)
    found.forEach((under, i) => {
      if (under.size === 0) return
      first ??= index
      for (const kind of under) kinds.add(kind)
      const id = asked.owners[i]
      if (id !== undefined && !marks.includes(id)) marks.push(id)
    })
  }
  if (first === undefined) return
  throw new EngineError(
    'redaction-failed',
    marks.length > 0
      ? `The marks ${marks.join(', ')} lie over content the redaction cannot remove.`
      : `Earlier marks on page ${first} lie over content the redaction cannot remove.`,
    {
      page: first,
      reason: 'unremovable-content',
      marks,
      kinds: UNREMOVABLE.map(([, kind]) => kind).filter((kind) => kinds.has(kind)),
    }
  )
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
  const file = inspectFile(
    heap,
    doc,
    context.data,
    context.size,
    (cause) =>
      new EngineError('redaction-failed', 'The file could not be inspected.', { cause })
  )
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

  const marksByPage = groupByPage(input.marks)

  // Before anything is removed or written: a mark the apply cannot honour changes nothing.
  refuseUnremovable(heap, doc, marksByPage, context, withPage)

  for (const [index, refs] of groupByPage(input.remove ?? []))
    withPage(index, (page) => {
      for (const ref of refs)
        if (!fn.EPDFPage_RemoveAnnotByObjectNumber(page, ref.objectNumber))
          throw new EngineError(
            'redaction-failed',
            `The annotation in object ${ref.objectNumber} on page ${index} could not be removed.`,
            { page: index }
          )
    })

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
  const ownLockedRegions: RedactResult['ownLockedRegions'] = []
  let foreignMarks = 0
  for (let index = 0; index < context.pageCount; index++)
    withPage(index, (page) => {
      const box = context.pageBox(page)
      // Read before this call's marks are written, which carry Inkbar's data too.
      const earlier = context.encrypted ? ownLockedQuads(heap, doc, page, index) : []
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
          // Earlier marks applied with no regions read leave nothing to check them by.
          if (own > 0 && earlier.length === 0)
            throw new EngineError(
              'redaction-failed',
              `What the earlier marks on page ${index} removed could not be inspected.`,
              { page: index, reason: 'could-not-inspect' }
            )
          ownLockedMarks += own
          if (own > 0) ownLockedRegions.push({ page: index, quads: earlier })
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
    ownLockedRegions,
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
