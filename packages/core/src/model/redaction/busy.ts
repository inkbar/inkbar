// Whether a document's redaction marks are being applied, kept by its annotation store so the
// model can read it too: nothing may edit the session meanwhile.
import { writable, type Readable, type Writable } from '../readable'

import type { AnnotationStore } from '../annotations/store'

const byStore = new WeakMap<AnnotationStore, Writable<boolean>>()

/**
 * @internal The flag for the document whose annotations `store` holds: true from the
 * confirmation until the apply has finished or failed. The same store on every call. The DOM
 * layer sets it (`runRedaction`) and reads it as `redactionBusy(doc)`.
 */
export function redactionApplying(store: AnnotationStore): Writable<boolean> {
  let found = byStore.get(store)
  if (!found) {
    found = writable(false)
    byStore.set(store, found)
  }
  return found
}

const stoppedByStore = new WeakMap<AnnotationStore, Readable<boolean>>()

/**
 * @internal Records the `engineStopped` of the document whose annotations `store` holds, so the
 * model can read it beside the redaction flag.
 */
export function followEngineStopped(
  store: AnnotationStore,
  stopped: Readable<boolean>
): void {
  stoppedByStore.set(store, stopped)
}

/**
 * @internal Whether the session takes no edits from the viewer's controls: its redaction marks
 * are being applied, or its document has stopped reading. The DOM layer reads the same as
 * `editingPaused(doc)`.
 */
export function sessionPaused(store: AnnotationStore): boolean {
  return redactionApplying(store).get() || (stoppedByStore.get(store)?.get() ?? false)
}
