/*
 * What the viewer does while its document has stopped reading (`doc.engineStopped`): a notice
 * over the pages with a button that starts it again (`doc.restartEngine()`), the host told once
 * per stop, and annotating paused as it is while redaction marks are applied.
 */
import { InkError } from '../model/errors'

import { redactionBusy } from './redaction-actions'

import type { MessageState } from './messages-state'
import type { InkDocument } from '../model/document'
import type { Readable } from '../model/readable'

const pausedByDoc = new WeakMap<InkDocument, Readable<boolean>>()

/**
 * True while `doc` takes no edits from the viewer: while its redaction marks are applied
 * (`redactionBusy`), and while it has stopped reading (`doc.engineStopped`). Meanwhile the pages
 * take no input, no annotation activates, and undo and redo do nothing. The same store on every
 * call.
 */
export function editingPaused(doc: InkDocument): Readable<boolean> {
  const found = pausedByDoc.get(doc)
  if (found) return found
  const busy = redactionBusy(doc)
  const now = (): boolean => busy.get() || doc.engineStopped.get()
  const subs = new Set<(paused: boolean) => void>()
  let last = false
  let stops: (() => void)[] | undefined
  const changed = (): void => {
    const next = now()
    if (next === last) return
    last = next
    for (const sub of [...subs]) sub(next)
  }
  const paused: Readable<boolean> = {
    get: () => (stops ? last : now()),
    subscribe(sub) {
      if (!stops) {
        last = now()
        stops = [busy.subscribe(changed), doc.engineStopped.subscribe(changed)]
      }
      subs.add(sub)
      return () => {
        if (!subs.delete(sub) || subs.size > 0) return
        for (const stop of stops ?? []) stop()
        stops = undefined
      }
    },
  }
  pausedByDoc.set(doc, paused)
  return paused
}

/** How many times each document has stopped, and how many of those a host has been told of. */
const stopsByDoc = new WeakMap<InkDocument, { count: number; told: number }>()

/**
 * `doc`'s stop count, followed for the document's life from the first call, so a viewer
 * mounted again on a document that is still stopped does not tell the host a second time.
 */
function stopsOf(doc: InkDocument): { count: number; told: number } {
  let found = stopsByDoc.get(doc)
  if (!found) {
    const state = { count: doc.engineStopped.get() ? 1 : 0, told: 0 }
    doc.engineStopped.subscribe((stopped) => {
      if (stopped) state.count++
    })
    stopsByDoc.set(doc, state)
    found = state
  }
  return found
}

export interface EngineNoticeOptions {
  /** The scroll element: the notice goes just before it, over the top of the pages. */
  container: HTMLElement
  document: InkDocument
  messages: Readable<MessageState>
  /** Hears `EngineUnavailable` once each time the document stops. */
  onError?(error: InkError): void
}

export interface EngineNotice {
  destroy(): void
}

/**
 * Shows `div[data-ink-engine-notice][role="alert"]` while the document is stopped, with
 * `viewer.engineStopped` and a `button[data-ink-engine-retry]` that calls `restartEngine()`.
 * While that runs the button is `aria-busy` and the words are `viewer.engineRestarting`; a
 * second press does nothing. A failed restart brings the first words back; a restart that works
 * removes the notice. Focus in the container when the notice shows moves to its button, and
 * focus on its button when it goes moves back to the container.
 */
export function createEngineNotice(opts: EngineNoticeOptions): EngineNotice {
  const { container, document: doc, messages } = opts
  const stops = stopsOf(doc)
  let notice:
    { root: HTMLElement; text: HTMLElement; button: HTMLButtonElement } | undefined
  let restarting = false
  let destroyed = false

  const relabel = (): void => {
    if (!notice) return
    const v = messages.get().messages.viewer
    const text = restarting ? v.engineRestarting : v.engineStopped
    if (notice.text.textContent !== text) notice.text.textContent = text
    if (notice.button.textContent !== v.engineRetry)
      notice.button.textContent = v.engineRetry
    notice.button.setAttribute('aria-busy', String(restarting))
    // Busy, but not `disabled`, so the button keeps focus.
    if (restarting) notice.button.setAttribute('aria-disabled', 'true')
    else notice.button.removeAttribute('aria-disabled')
  }

  const retry = (): void => {
    if (restarting || destroyed) return
    restarting = true
    relabel()
    // A failure leaves the document stopped and the notice up; a success has removed it.
    const done = (): void => {
      restarting = false
      if (!destroyed) relabel()
    }
    doc.restartEngine().then(done, done)
  }

  const show = (): void => {
    if (!notice) {
      const owner = container.ownerDocument
      const root = owner.createElement('div')
      root.className = 'ink-engine-notice'
      root.setAttribute('data-ink-engine-notice', '')
      root.setAttribute('role', 'alert')
      const text = owner.createElement('p')
      text.className = 'ink-engine-notice-text'
      const button = owner.createElement('button')
      button.type = 'button'
      button.className = 'ink-button'
      button.setAttribute('data-ink-engine-retry', '')
      button.addEventListener('click', retry)
      root.append(text, button)
      notice = { root, text, button }
      relabel()
      // Focus in the pages, which take no input now, moves to the button, the one thing to do.
      const inPages = container.contains(owner.activeElement)
      container.before(root)
      if (inPages) button.focus({ preventScroll: true })
    }
    if (stops.told < stops.count) {
      stops.told = stops.count
      const error = new InkError(
        'EngineUnavailable',
        'The engine stopped and could not be started again: the document reads nothing until it is restarted'
      )
      // Heard from inside the reader's own work: what the host throws surfaces as an uncaught
      // error, and the reader goes on.
      try {
        opts.onError?.(error)
      } catch (thrown) {
        queueMicrotask(() => {
          throw thrown
        })
      }
    }
  }

  const hide = (): void => {
    if (!notice) return
    const held = notice.root.contains(container.ownerDocument.activeElement)
    notice.root.remove()
    notice = undefined
    if (held) container.focus({ preventScroll: true })
  }

  const follow = (stopped: boolean): void => {
    if (stopped) show()
    else hide()
  }
  const stopFollowing = doc.engineStopped.subscribe(follow)
  const stopWords = messages.subscribe(relabel)
  if (doc.engineStopped.get()) show()

  return {
    destroy() {
      if (destroyed) return
      destroyed = true
      stopFollowing()
      stopWords()
      notice?.root.remove()
      notice = undefined
    },
  }
}
