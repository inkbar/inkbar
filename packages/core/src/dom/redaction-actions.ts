/*
 * Applying redactions from a control: whether a document can, whether it is applying now, and
 * the run itself, from the confirmation to the redacted bytes. The open document never changes:
 * showing the result means opening the bytes, which `createViewer` and the bindings do, each
 * through `applyRedactionsFlow` and its own load.
 */
import { InkError, isInkError } from '../model/errors'
import { derived, readonly, type Readable, type Writable } from '../model/readable'
import { redactionApplying } from '../model/redaction/busy'

import type { InkMessages } from '../messages'
import type { LayoutMode } from './layout'
import type { ToolId } from './tools'
import type { ViewRotation } from './transform'
import type { ZoomValue } from './viewport'
import type { Annotation } from '../model/annotations/types'
import type { InkDocument } from '../model/document'
import type { RedactionPreview, RedactionResult } from '../model/redaction/types'
import type { DocumentSource } from '../model/source'

export interface RunRedactionOptions {
  /**
   * Asks the reader before anything happens, with what the apply will do: resolve true to
   * apply. `createRedactionDialog` is the built-in confirmation.
   */
  confirm: (preview: RedactionPreview) => Promise<boolean>
}

interface RedactionState {
  busy: Writable<boolean>
  busyView: Readable<boolean>
  /** Made on first use: a document's busy state reads nothing of its annotations. */
  can: Readable<boolean> | undefined
  /** From the press until the run settles, the confirmation included. */
  running: boolean
}

/** Each document's state, made on first use. */
const stateByDoc = new WeakMap<InkDocument, RedactionState>()

/** Whether a preview has anything to apply: marks, or earlier marks of an encrypted file. */
const hasMarks = (p: RedactionPreview): boolean => p.marks > 0 || p.lockedMarks > 0

/**
 * Whether `doc` holds a mark, counted cheaply for a control that follows every change: a
 * session redaction mark, or in an encrypted file a locked one Inkbar may have saved earlier
 * (the ones `redactionPreview().lockedMarks` counts). The preview's overlap pass waits for the
 * press.
 */
const holdsMarks = (doc: InkDocument): boolean =>
  doc.annotations.list
    .get()
    .some((a) => a.type === 'redact' && (a.source !== 'pdf' || doc.info.isEncrypted))

function stateOf(doc: InkDocument): RedactionState {
  let found = stateByDoc.get(doc)
  if (!found) {
    // Kept by the annotation store, where the model reads it too.
    const busy = redactionApplying(doc.annotations)
    found = { busy, busyView: readonly(busy), can: undefined, running: false }
    stateByDoc.set(doc, found)
  }
  return found
}

/**
 * True while `doc`'s redaction marks are being applied: from the confirmation until the
 * redacted file is ready or the apply has failed. The same store on every call.
 */
export function redactionBusy(doc: InkDocument): Readable<boolean> {
  return stateOf(doc).busyView
}

/**
 * True when `doc` was opened with an `engine` and has a redaction mark to apply (or, in an
 * encrypted file, a locked one Inkbar may have saved earlier). It follows the marks as they are
 * added and removed. The same store on every call.
 */
export function canRedact(doc: InkDocument): Readable<boolean> {
  const state = stateOf(doc)
  state.can ??= derived(doc.annotations.list, () => doc._saves && holdsMarks(doc))
  return state.can
}

/**
 * Asks `confirm` with `doc.redactionPreview()`, then applies the marks with
 * `doc.applyRedactions()`. Resolves with the redacted bytes and what was done, or null when the
 * reader cancelled or a run of `doc` was already going (a second press does nothing). Without
 * an engine or a mark nothing is asked, and it rejects as `doc.applyRedactions()` does: with
 * `EngineUnavailable`, `NothingToRedact` or `RedactionFailed`. The open document is not changed
 * either way.
 */
export async function runRedaction(
  doc: InkDocument,
  options: RunRedactionOptions
): Promise<Awaited<ReturnType<InkDocument['applyRedactions']>> | null> {
  const state = stateOf(doc)
  if (state.running) return null
  state.running = true
  try {
    if (doc._saves && hasMarks(doc.redactionPreview())) {
      if (!(await options.confirm(doc.redactionPreview()))) return null
    }
    state.busy.set(true)
    return await doc.applyRedactions()
  } finally {
    state.running = false
    state.busy.set(false)
  }
}

/** The ids of the marks a `RedactionFailed` names as over content that cannot be removed. */
const refusedMarks = (error: InkError): string[] => {
  const ids = error.details['annotations']
  return error.details['reason'] === 'unremovable-content' && Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === 'string')
    : []
}

/**
 * The error a run of `runRedaction` failed with, as one to report, with the words to tell the
 * reader: `viewer.redactUnremovable` when marks lie over content the apply cannot remove,
 * `viewer.redactUnavailable` when the engine could not be loaded or started,
 * `viewer.redactUnverified` when the check found content left under a mark or the engine could
 * not look under the marks, and `viewer.redactFailed` otherwise. An error that is not an `InkError` is wrapped in a
 * `RedactionFailed`. Undefined when the document was closed meanwhile: there is nothing to say.
 */
export function redactionFailure(
  error: unknown,
  messages: InkMessages
): { error: InkError; message: string } | undefined {
  if (isInkError(error) && error.code === 'DocumentDestroyed') return undefined
  const ink = isInkError(error)
    ? error
    : new InkError(
        'RedactionFailed',
        error instanceof Error ? error.message : String(error),
        { stage: 'apply' },
        error
      )
  const failed = ink.code === 'RedactionFailed'
  const stage = failed ? ink.details['stage'] : undefined
  const reason = failed ? ink.details['reason'] : undefined
  const v = messages.viewer
  return {
    error: ink,
    message:
      reason === 'unremovable-content'
        ? v.redactUnremovable({ count: Math.max(refusedMarks(ink).length, 1) })
        : reason === 'could-not-inspect' || stage === 'verify'
          ? v.redactUnverified
          : stage === 'engine'
            ? v.redactUnavailable
            : v.redactFailed,
  }
}

/** What a reopen on redacted bytes keeps of the view it replaces. */
export interface RedactionView {
  zoom: ZoomValue
  page: number
  mode: LayoutMode
  rotation: ViewRotation
  tool: ToolId
}

/** What to open in place of the document, once its marks are applied. */
export interface RedactionReopen {
  /** A copy of the redacted bytes, the viewer's own, under the document's key. */
  source: DocumentSource
  /** The name to save under: the document's. */
  fileName: string
  /** The password the document was opened with, for an encrypted file. */
  password: string | undefined
  /** The view to open at; undefined when there was none to keep. */
  view: RedactionView | undefined
  /**
   * The list a controlled document starts from: the host's without the marks applied and the
   * annotations removed with them, already proposed with reason `'redaction'`. Undefined when
   * the annotations are uncontrolled.
   */
  initial: Annotation[] | undefined
  /** What to tell the reader once the reopened document is ready (`redactionDoneMessage`). */
  message: string
}

export interface RedactionFlowOptions {
  /** Asks the reader first: see `RunRedactionOptions.confirm`. */
  confirm: (preview: RedactionPreview) => Promise<boolean>
  /** False once the caller has gone or shows another document: the flow then stops. */
  isCurrent: () => boolean
  /**
   * Hands the redacted file to the host, whose array it is: the reopen uses a copy. A throw is
   * reported, and the flow goes on.
   */
  notify: (event: { bytes: Uint8Array; result: RedactionResult }) => void
  /** The callback's name, for `details.callback` on the error a throwing `notify` gives. */
  callbackName: string
  /**
   * Hears a failed apply's error, and what a throwing `notify` threw. What it throws is
   * rethrown from a microtask, so it surfaces as an uncaught error and the flow goes on.
   */
  onError: (error: InkError) => void
  /** Shows the reader why the apply failed. */
  showFailure: (message: string) => void
  messages: () => InkMessages
  /** The view now, read once the marks are applied. */
  view: () => RedactionView | undefined
  /** The password the document was opened with. */
  password: string | undefined
  /**
   * Runs straight after a controlled host is proposed its list (reason `'redaction'`), before
   * the flow awaits anything and so before a framework hands the host's answer back. A binding
   * with a snapshot history arms `SnapshotHistory.replaced()` here, so that answer starts the
   * history again instead of being a step.
   */
  proposed?: (initial: Annotation[]) => void
}

/**
 * What the message box says once the redacted file shows: the marks applied, and a line each
 * when the file has hidden layers and when other programs' marks were left in place.
 */
export function redactionDoneMessage(
  result: RedactionResult,
  messages: InkMessages
): string {
  const v = messages.viewer
  const said = [v.redactDone({ marks: result.marks })]
  if (result.hiddenLayers) said.push(v.redactHiddenLayers)
  if (result.foreignMarks > 0) said.push(v.redactForeign({ count: result.foreignMarks }))
  return said.join(' ')
}

/**
 * "Apply, then show the result", up to the reopen, which stays the caller's: it confirms and
 * applies (`runRedaction`), tells the host (`notify`), proposes a controlled host its list
 * without the marks and the annotations removed with them (reason `'redaction'`, then
 * `proposed`), and says what to open. It re-checks `isCurrent` after every step that can change
 * the document shown. It never rejects. What the caller does with each outcome:
 *
 * - `{ result, reopen }` with `reopen` set: open `reopen.source` in place of the document, with
 *   its file name, password, view and (controlled) initial list, and show `reopen.message`
 *   once the reopened view has built. The caller must open it: dropping it leaves a controlled
 *   host holding a list without the marks while the marks are still on screen.
 * - `{ result, reopen: null }`: the caller stopped being current after the host heard. Nothing
 *   is left to do; the host has the bytes through `notify`.
 * - `null`: the reader cancelled, nothing was applied, the apply failed or the caller stopped
 *   being current before the host heard. A failure has been shown (`showFailure`) and reported
 *   (`onError`) already, unless the document was closed or the caller was no longer current.
 */
export async function applyRedactionsFlow(
  doc: InkDocument,
  opts: RedactionFlowOptions
): Promise<{ result: RedactionResult; reopen: RedactionReopen | null } | null> {
  const report = (error: InkError): void => {
    try {
      opts.onError(error)
    } catch (thrown) {
      queueMicrotask(() => {
        throw thrown
      })
    }
  }
  let out: Awaited<ReturnType<typeof runRedaction>>
  try {
    out = await runRedaction(doc, { confirm: opts.confirm })
  } catch (error) {
    const failure = redactionFailure(error, opts.messages())
    if (failure && opts.isCurrent()) {
      // The marks over content that cannot be removed are selected, so the reader sees them.
      const refused = refusedMarks(failure.error)
      if (refused.length > 0) doc.annotations.select(refused)
      opts.showFailure(failure.message)
      report(failure.error)
    }
    return null
  }
  // Gone, or another document opened, meanwhile: there is nothing to reopen.
  if (!out || !opts.isCurrent()) return null
  const { bytes, result, _marks: applied } = out
  // The viewer's own copy: the host may change or transfer the array it is given.
  const data = bytes.slice()
  try {
    opts.notify({ bytes, result })
  } catch (error) {
    // The reader confirmed: the reopen goes ahead, and the host hears what it threw.
    report(
      isInkError(error)
        ? error
        : new InkError(
            'RedactionFailed',
            `${opts.callbackName} threw: ${error instanceof Error ? error.message : String(error)}`,
            { callback: opts.callbackName },
            error
          )
    )
  }
  // The host may have opened another document already.
  if (!opts.isCurrent()) return { result, reopen: null }
  const view = opts.view()
  // A controlled host is proposed its list without the marks applied and the annotations
  // removed with them, once; the reopened document starts from it, so the proposal its lifting
  // makes agrees. A mark the host added while the apply ran was not applied, and stays.
  let initial: Annotation[] | undefined
  if (doc.annotations.mode === 'controlled') {
    const gone = new Set([...applied, ...result.removed.session])
    // What the host holds: the file's own annotations never pass through it.
    initial = doc.annotations.list
      .get()
      .filter((a) => a.source !== 'pdf' && !gone.has(a.id))
    doc.annotations.replaceAll(initial, 'redaction')
    opts.proposed?.(initial)
    if (!opts.isCurrent()) return { result, reopen: null }
  }
  return {
    result,
    reopen: {
      source: { data, key: doc.key },
      fileName: doc.fileName,
      password: opts.password,
      view,
      initial,
      message: redactionDoneMessage(result, opts.messages()),
    },
  }
}
