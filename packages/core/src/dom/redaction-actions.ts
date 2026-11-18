/*
 * Applying redactions from a control: whether a document can, whether it is applying now, and
 * the run itself, from the confirmation to the redacted bytes. The open document never changes:
 * showing the result means opening the bytes, which `createViewer` and the bindings do, each
 * through `applyRedactionsFlow` and its own load.
 */
import { InkError, isInkError } from '../model/errors'
import {
  derived,
  readonly,
  writable,
  type Readable,
  type Writable,
} from '../model/readable'

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
  can: Readable<boolean>
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
    const busy = writable(false)
    found = {
      busy,
      busyView: readonly(busy),
      can: derived(doc.annotations.list, () => doc._saves && holdsMarks(doc)),
      running: false,
    }
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
  return stateOf(doc).can
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
): Promise<{ bytes: Uint8Array; result: RedactionResult } | null> {
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

/**
 * The error a run of `runRedaction` failed with, as one to report, with the words to tell the
 * reader: `viewer.redactUnavailable` when the engine could not be loaded or started,
 * `viewer.redactUnverified` when the check found content left under a mark, and
 * `viewer.redactFailed` otherwise. An error that is not an `InkError` is wrapped in a
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
  const stage = ink.code === 'RedactionFailed' ? ink.details['stage'] : undefined
  const v = messages.viewer
  return {
    error: ink,
    message:
      stage === 'engine'
        ? v.redactUnavailable
        : stage === 'verify'
          ? v.redactUnverified
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
  /** The redacted bytes, under the document's key. */
  source: DocumentSource
  /** The name to save under: the document's. */
  fileName: string
  /** The password the document was opened with, for an encrypted file. */
  password: string | undefined
  /** The view to open at; undefined when there was none to keep. */
  view: RedactionView | undefined
  /**
   * The list a controlled document starts from: the host's without the marks and the
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
  /** Hands the redacted file to the host. A throw is reported, and the flow goes on. */
  notify: (event: { bytes: Uint8Array; result: RedactionResult }) => void
  /** The callback's name, for `details.callback` on the error a throwing `notify` gives. */
  callbackName: string
  /** Hears a failed apply's error, and what a throwing `notify` threw. */
  onError: (error: InkError) => void
  /** Shows the reader why the apply failed. */
  showFailure: (message: string) => void
  messages: () => InkMessages
  /** The view now, read once the marks are applied. */
  view: () => RedactionView | undefined
  /** The password the document was opened with. */
  password: string | undefined
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
 * without the marks and the annotations removed with them (reason `'redaction'`), and says what
 * to open. It re-checks `isCurrent` after every step that can change the document shown.
 *
 * Resolves with null when the reader cancelled, nothing was applied, the apply failed or the
 * caller stopped being current before the host heard. A failure is shown (`showFailure`) and
 * reported (`onError`) unless the document was closed or the caller is no longer current; it
 * never rejects. Once the host has heard it resolves with `result`, and with `reopen` null when
 * the caller stopped being current meanwhile.
 */
export async function applyRedactionsFlow(
  doc: InkDocument,
  opts: RedactionFlowOptions
): Promise<{ result: RedactionResult; reopen: RedactionReopen | null } | null> {
  let out: { bytes: Uint8Array; result: RedactionResult } | null
  try {
    out = await runRedaction(doc, { confirm: opts.confirm })
  } catch (error) {
    const failure = redactionFailure(error, opts.messages())
    if (failure && opts.isCurrent()) {
      opts.showFailure(failure.message)
      opts.onError(failure.error)
    }
    return null
  }
  // Gone, or another document opened, meanwhile: there is nothing to reopen.
  if (!out || !opts.isCurrent()) return null
  const { bytes, result } = out
  try {
    opts.notify({ bytes, result })
  } catch (error) {
    // The reader confirmed: the reopen goes ahead, and the host hears what it threw.
    opts.onError(
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
  // A controlled host is proposed its list without the marks and the annotations removed with
  // them, once; the reopened document starts from it, so the proposal its lifting makes agrees.
  let initial: Annotation[] | undefined
  if (doc.annotations.mode === 'controlled') {
    const gone = new Set(result.removed.session)
    // What the host holds: the file's own annotations never pass through it.
    initial = doc.annotations.list
      .get()
      .filter((a) => a.source !== 'pdf' && a.type !== 'redact' && !gone.has(a.id))
    doc.annotations.replaceAll(initial, 'redaction')
    if (!opts.isCurrent()) return { result, reopen: null }
  }
  return {
    result,
    reopen: {
      source: { data: bytes, key: doc.key },
      fileName: doc.fileName,
      password: opts.password,
      view,
      initial,
      message: redactionDoneMessage(result, opts.messages()),
    },
  }
}
