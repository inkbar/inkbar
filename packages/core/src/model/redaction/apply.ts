// Applying redactions: what the engine is given, what it says it did, and the check of the bytes
// it saved. The open document is never touched: the redacted state exists only in the bytes.
import { InkError } from '../errors'
import { rectFromQuads } from '../geometry'
import {
  AnnotationUnwritable,
  buildWriteInput,
  plainData,
  writeAnnotation,
  writeFields,
} from '../save/write-input'

import { redactionOverlay } from './overlay'
import { overlapsMark, planRedaction, type RedactionPlan } from './plan'

import type { RedactionPreview, RedactionResult } from './types'
import type { PaintHelpers } from '../annotations/drawing/pdf/paint'
import type { TextMeasure } from '../annotations/drawing/types'
import type { Annotation } from '../annotations/types'
import type { FieldValues, FormField } from '../form/types'
import type { Rect } from '../geometry'
import type { PageInfo } from '../pages'
import type { FieldChange } from '../save/changes'
import type { SaveInput, Saver } from '../save/saver'

/** An annotation in the file, by its page and object number. */
type FileRef = NonNullable<SaveInput['remove']>[number]

/** What the session holds, as `planRedaction` and the preview read it. */
export interface RedactionState {
  /** The annotations as a save sees them, the file's own locked ones included. */
  annotations: readonly Annotation[]
  formFields: readonly FormField[]
  /** The form's values. */
  values: FieldValues
  /** The form values that differ from the file's. */
  fieldChanges: Readonly<Record<string, FieldChange>>
}

/** Everything one apply needs besides the session. */
export interface RedactionContext extends RedactionState {
  pages: readonly PageInfo[]
  /** The file copies of the annotations lifted at open, removed first, as a save removes them. */
  lifted: readonly FileRef[]
  fileParents: ReadonlyMap<string, FileRef>
  helpers: Omit<PaintHelpers, 'page'>
  measure?: TextMeasure | undefined
  /** Whether the file is encrypted: Inkbar's earlier marks then come back locked. */
  encrypted: boolean
  saver: Saver
}

/** Each signed signature field's widgets, by the id of the annotation that signs it. */
function signedFieldRects(
  state: RedactionState
): Map<string, { page: number; rect: Rect }[]> {
  const out = new Map<string, { page: number; rect: Rect }[]>()
  for (const field of state.formFields) {
    if (field.type !== 'signature' || field.widgets.length === 0) continue
    const value = state.fieldChanges[field.name]?.value ?? state.values[field.name]
    if (value !== null && typeof value === 'object' && 'signature' in value)
      out.set(
        value.signature,
        field.widgets.map((w) => ({ page: w.page, rect: w.rect }))
      )
  }
  return out
}

function plan(state: RedactionState): RedactionPlan {
  return planRedaction(state.annotations, { fieldRects: signedFieldRects(state) })
}

/** The counts a confirmation shows, from what core knows without the engine. */
export function redactionPreview(state: RedactionState): RedactionPreview {
  const p = plan(state)
  // The engine removes the file's own annotations a mark overlaps; other programs' marks stay.
  const fileOverlapped = state.annotations.filter(
    (a) => a.source === 'pdf' && a.type !== 'redact' && overlapsMark(p, a)
  ).length
  return {
    marks: p.marks.length,
    pages: p.pages,
    overlapped: p.removed.length + fileOverlapped,
    signed: state.formFields.some((f) => f.signed === 'certificate'),
  }
}

const nothingToRedact = (): InkError =>
  new InkError('NothingToRedact', 'There are no redaction marks to apply')

/**
 * Applies every redaction mark of the session to the file as opened and checks the result. The
 * session's marks go first, each with its overlay as its appearance; the annotations they leave
 * and the changed form values are written after the apply. Rejects with `NothingToRedact` when
 * there is no mark, and with `RedactionFailed` at `'verify'` when the check finds anything
 * under a mark, with the places in `details.regions`.
 */
export async function applyRedactions(
  context: RedactionContext
): Promise<{ bytes: Uint8Array; result: RedactionResult }> {
  const p = plan(context)
  // In an encrypted file Inkbar's earlier marks come back locked, and core cannot tell them from
  // another program's: the engine can, by the data Inkbar stored with them.
  const locked = context.encrypted
    ? context.annotations.filter((a) => a.source === 'pdf' && a.type === 'redact')
    : []
  if (p.marks.length === 0 && locked.length === 0) throw nothingToRedact()
  const removed = new Set(p.removed.map((a) => a.id))

  const { bytes, result, findings } = await context.saver.redact(
    async () => {
      const { fields, signs } = writeFields(context.fieldChanges, context.formFields)
      // A signature that goes with its field takes its link with it.
      for (const id of removed) signs.delete(id)
      const rest = await buildWriteInput({
        annotations: p.kept,
        pages: context.pages,
        lifted: context.lifted,
        fields,
        signs,
        helpers: context.helpers,
        measure: context.measure,
        fileParents: context.fileParents,
      })
      const marks: Awaited<ReturnType<typeof writeAnnotation>>[] = []
      for (const mark of p.marks) {
        const page = context.pages[mark.page]
        marks.push(
          await (
            page
              ? writeAnnotation(mark, {
                  page: { box: page.box, rotate: page.rotate, userUnit: page.userUnit },
                  reply: false,
                  helpers: context.helpers,
                  measure: context.measure,
                  drawing: redactionOverlay(mark),
                })
              : Promise.reject(new RangeError(`Page ${mark.page} does not exist`))
          ).catch((cause: unknown) => {
            throw new AnnotationUnwritable(mark.id, cause)
          })
        )
      }
      return { ...rest, marks: plainData(marks) }
    },
    // Inkbar's earlier locked marks are not among the regions: core knows them only by their
    // locked copies' boxes, which are drawn larger than what the engine removed.
    p.regions
  )

  const marks = result.pages.reduce((sum, page) => sum + page.marks, 0)
  if (p.marks.length === 0 && marks === 0) throw nothingToRedact()
  // Core is the last gate: every region passed needs an answer, and every answer must be clean.
  // A region the check did not answer counts as one with content under it.
  const failing = p.regions.flatMap((region, i) => {
    const answers = findings.candidates.filter(
      (c) => c.kind === 'region' && c.region === i
    )
    return answers.length > 0 && answers.every((c) => c.verdict === 'clean')
      ? []
      : [{ page: region.page, rect: rectFromQuads(region.quads) }]
  })
  // Anything else the check found, though it was asked about regions only, fails too.
  for (const c of findings.candidates)
    if (c.kind !== 'region' && c.verdict !== 'clean')
      failing.push({ page: c.page, rect: { ...c.rect } })
  if (failing.length > 0)
    throw new InkError(
      'RedactionFailed',
      'The redacted file could not be shown clean under every redaction mark',
      { stage: 'verify', regions: failing }
    )

  return {
    bytes,
    result: {
      marks,
      pages: result.pages.length,
      removed: {
        session: p.removed.map((a) => a.id),
        file: result.pages.reduce((sum, page) => sum + page.annotationsRemoved, 0),
      },
      foreignMarks: result.foreignMarks,
      ownLockedMarks: result.ownLockedMarks,
      sanitised: { ...result.sanitised },
      hiddenLayers: result.hiddenLayers,
      signed: result.signed,
      findings,
    },
  }
}
