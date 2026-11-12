import { type Readable, writable } from '../model/readable'

import type { LockedStatus } from '../model/document'
import type { InkError } from '../model/errors'

export type { LockedStatus }

/** The locked status for an open that failed with PasswordRequired; null for any other error. */
export function lockedStatus(error: InkError): LockedStatus | null {
  if (error.code !== 'PasswordRequired') return null
  return { state: 'locked', incorrect: error.details.incorrect === true }
}

export interface PasswordPromptState {
  asking: boolean
  pending: boolean
}

export interface PasswordPrompt {
  readonly state: Readable<PasswordPromptState>
  /** An open ended locked: asking = true unless the reader cancelled since the last ask/reset; pending = false. */
  locked(): void
  /** pending = true, then retry(password). Ignored while pending or for ''. */
  submit(password: string): void
  /** The locked panel's button: asking = true, clears the cancelled mark. */
  ask(): void
  /** asking = false; marks cancelled so a later locked() does not reopen. */
  cancel(): void
  /** A new source, a success or a non-password failure: asking = false, pending = false, cancelled cleared. */
  reset(): void
}

/**
 * The dialog's state machine, shared by every front end. It never stores the password: `submit`
 * hands it straight to `retry`.
 */
export function createPasswordPrompt(retry: (password: string) => void): PasswordPrompt {
  const state = writable<PasswordPromptState>({ asking: false, pending: false })
  let cancelled = false
  const set = (next: PasswordPromptState): void => {
    const { asking, pending } = state.get()
    if (asking !== next.asking || pending !== next.pending) state.set(next)
  }
  return {
    state,
    locked() {
      set({ asking: !cancelled, pending: false })
    },
    submit(password) {
      if (state.get().pending || password === '') return
      set({ ...state.get(), pending: true })
      retry(password)
    },
    ask() {
      cancelled = false
      set({ ...state.get(), asking: true })
    },
    cancel() {
      cancelled = true
      set({ ...state.get(), asking: false })
    },
    reset() {
      cancelled = false
      set({ asking: false, pending: false })
    },
  }
}
