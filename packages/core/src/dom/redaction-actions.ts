/*
 * Applying redactions from a control: whether a document can, whether it is applying now, and
 * the run itself, from the confirmation to the redacted bytes. The open document never changes:
 * showing the result means opening the bytes, which `createViewer` and the bindings do.
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
import type { InkDocument } from '../model/document'
import type { RedactionPreview, RedactionResult } from '../model/redaction/types'

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
