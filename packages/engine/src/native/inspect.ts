import { EngineError } from '../errors.ts'
import {
  findingsFrom,
  type FileReport,
  type PageReport,
  type RegionReport,
} from '../redaction/verdict.ts'

import { withFloats } from './strings.ts'

import type { RedactionFindings, RedactionRegion } from '../types.ts'
import type { Heap } from './strings.ts'

const KINDS = new Set<string>([
  'region',
  'redact-annotation',
  'filled-box',
  'annotation-box',
])
const COUNTS = [
  'textChars',
  'imagesNotBlank',
  'paths',
  'patternContent',
  'annotationText',
  'annotationImages',
] as const
const FILE_FLAGS = ['info', 'xmp', 'scripts', 'hiddenLayers', 'signed'] as const

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

/**
 * Reads a report the fork returned and frees it. A NULL report, or one that is not the JSON
 * object expected, throws `fail()`.
 */
export function readReport(
  heap: Heap,
  report: number,
  fail: (cause?: unknown) => EngineError
) {
  if (report === 0) throw fail()
  try {
    const bytes = heap.native.HEAPU8
    const text = new TextDecoder().decode(
      bytes.subarray(report, bytes.indexOf(0, report))
    )
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (cause) {
      throw fail(cause)
    }
    if (!isRecord(parsed)) throw fail()
    return parsed
  } finally {
    if (!heap.stopped) heap.fn.INK_Inspect_Free(report)
  }
}

/** The fork's report on what the file carries besides its pages. `data` holds its bytes. */
export function inspectFile(
  heap: Heap,
  doc: number,
  data: number,
  size: number,
  fail: (cause?: unknown) => EngineError
): FileReport {
  const parsed = readReport(heap, heap.fn.INK_Inspect_File(doc, data, size), fail)
  const { revisions, attachments } = parsed
  if (!isCount(revisions) || revisions < 1 || !isCount(attachments)) throw fail()
  const flags = Object.fromEntries(
    FILE_FLAGS.map((key) => {
      const value = parsed[key]
      if (typeof value !== 'boolean') throw fail()
      return [key, value]
    })
  ) as Record<(typeof FILE_FLAGS)[number], boolean>
  return { revisions, attachments, ...flags }
}

/** One entry of a page report, checked. */
function regionReport(value: unknown, fail: () => EngineError): RegionReport {
  if (!isRecord(value)) throw fail()
  const { rect, kind } = value
  if (
    !Array.isArray(rect) ||
    rect.length !== 4 ||
    !rect.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
    typeof kind !== 'string' ||
    !KINDS.has(kind)
  )
    throw fail()
  const counts = Object.fromEntries(
    COUNTS.map((key) => {
      const count = value[key]
      if (!isCount(count)) throw fail()
      return [key, count]
    })
  ) as Record<(typeof COUNTS)[number], number>
  return {
    rect: rect as unknown as RegionReport['rect'],
    kind: kind as RegionReport['kind'],
    ...counts,
  }
}

/** x1 y1 to x4 y4: upper left, upper right, lower left, lower right, as the fork takes them. */
const cornersOf = (quads: RedactionRegion['quads']) =>
  quads.flatMap((q) => [q.p1.x, q.p1.y, q.p2.x, q.p2.y, q.p3.x, q.p3.y, q.p4.x, q.p4.y])

/** A region's quads, with its index in the list the caller gave. */
interface Indexed {
  region: number
  quads: RedactionRegion['quads']
}

/**
 * Asks the fork what lies on page `index`: under each quad of `regions`, or, without regions,
 * under the candidates it finds. A page it could not inspect, or a report that does not match
 * what was asked, is `check-failed`.
 */
function inspectPage(
  heap: Heap,
  doc: number,
  index: number,
  regions: readonly Indexed[] | undefined
): PageReport {
  const fail = (cause?: unknown) =>
    new EngineError('check-failed', `Page ${index} could not be inspected.`, {
      page: index,
      cause,
    })
  const corners = regions?.flatMap(({ quads }) => cornersOf(quads)) ?? []
  const count = corners.length / 8
  const report = withFloats(heap, corners, (pointer) =>
    heap.fn.INK_Inspect_Page(doc, index, count === 0 ? 0 : pointer, count)
  )
  const parsed = readReport(heap, report, fail)
  if (!Array.isArray(parsed.regions)) throw fail()
  const entries = parsed.regions.map((entry) => regionReport(entry, fail))
  if (!regions) {
    if (entries.some((entry) => entry.kind === 'region')) throw fail()
    return {
      page: index,
      candidates: entries.map((entry) => ({ reports: [entry] as const })),
    }
  }
  if (entries.length !== count || entries.some((entry) => entry.kind !== 'region'))
    throw fail()
  let next = 0
  const candidates = regions.map(({ region, quads }) => {
    const own = entries.slice(next, next + quads.length)
    next += quads.length
    return {
      reports: own as unknown as readonly [RegionReport, ...RegionReport[]],
      region,
    }
  })
  return { page: index, candidates }
}

/**
 * Checks a loaded document: the fork's report on the file, and on every page, or on each page
 * `regions` name. `data` holds the file's bytes. Every region has at least one quad and a page
 * index inside the document; the caller has checked.
 */
export function inspectDocument(
  heap: Heap,
  doc: number,
  file: { data: number; size: number; pageCount: number },
  regions: readonly RedactionRegion[] | undefined
): RedactionFindings {
  const fileReport = inspectFile(
    heap,
    doc,
    file.data,
    file.size,
    (cause) =>
      new EngineError('check-failed', 'The file could not be inspected.', { cause })
  )
  const pages: PageReport[] = []
  if (regions) {
    const byPage = new Map<number, Indexed[]>()
    regions.forEach(({ page, quads }, region) => {
      byPage.set(page, [...(byPage.get(page) ?? []), { region, quads }])
    })
    for (const page of [...byPage.keys()].sort((a, b) => a - b))
      pages.push(inspectPage(heap, doc, page, byPage.get(page)))
  } else
    for (let index = 0; index < file.pageCount; index++)
      pages.push(inspectPage(heap, doc, index, undefined))
  return findingsFrom(pages, fileReport)
}
