/*
 * The sandboxes' redaction page: a fixture made for applying redactions, with the apply
 * redactions control, opened with the engine. Its options come from the query.
 */

declare global {
  interface Window {
    /** The bytes of each `redacted` event the page heard, oldest first. */
    __inkbarRedacted?: number[][]
  }
}

/** Whether `name` is a fixture the redaction page opens. */
export function isRedactionFixture(name: string): boolean {
  return name.startsWith('redact-')
}

export interface RedactionPageOptions {
  /** `controlled=1`: the host keeps the annotations, with history on. */
  controlled: boolean
  /** `confirm=0`: applies without the built-in dialog (`redactionConfirm: false`). */
  confirm: boolean
}

export function redactionPageOptions(params: URLSearchParams): RedactionPageOptions {
  return {
    controlled: params.get('controlled') === '1',
    confirm: params.get('confirm') !== '0',
  }
}

/** Keeps the bytes of a `redacted` event where the tests read them. */
export function keepRedacted(bytes: Uint8Array): void {
  window.__inkbarRedacted = [...(window.__inkbarRedacted ?? []), Array.from(bytes)]
}
