/*
 * The thread for the activated note or text markup, anchored to the root's overlay element.
 * Activating a reply opens the whole thread from its root. Closing (Close, Escape, a press
 * outside) clears the activation.
 *
 * A new note, or a highlight, has no text. While its root is empty (and unlocked) the form
 * writes the root's own `contents`, labelled "Comment", and the thread list stays hidden until
 * there is something in it; after that the form adds replies. A note closed, or left for
 * another annotation, while still empty and without replies is removed; markup stays, since
 * the mark is the point. The thread list re-renders on every store change; the form, and the
 * draft in it, stays until the popover moves to another thread or the root is gone.
 */
import {
  isAbandonedNote,
  isThreadRoot,
  threadOf,
  threadRoot,
  type ThreadRoot,
} from '../../model/annotations/threads'
import { threadDeleteLabel, threadPopoverLabel } from '../ui'

import { button, h } from './dom'
import { createPopover } from './popover'

import type { AnnotationStore } from '../../model/annotations/store'
import type { Annotation } from '../../model/annotations/types'
import type { Writable } from '../../model/readable'
import type { FocusReturn } from '../popover-focus'

export interface ThreadPopoverOptions {
  root: HTMLElement
  store: AnnotationStore
  activated: Writable<string | null>
  focusReturn: FocusReturn
}

export function createThreadPopover(opts: ThreadPopoverOptions): { destroy(): void } {
  const { root, store, activated, focusReturn } = opts
  const popover = createPopover({
    root,
    attrs: {
      class: 'ink-thread-popover',
      'data-ink-thread-popover': '',
      'aria-label': 'Note thread',
    },
    focusReturn,
    onDismiss: close,
  })
  const thread = h('ol', { class: 'ink-thread', 'data-ink-thread': '' })
  let form: ThreadForm | null = null
  /** The thread root shown now. */
  let current: string | null = null
  /** Roots given text or a reply here: never dropped as abandoned. */
  const written = new Set<string>()
  /** Notes already removed from here, so they are not removed twice. */
  const dropped = new Set<string>()

  function shown(): ThreadRoot | null {
    const a = current ? store.get(current) : undefined
    return a && isThreadRoot(a) ? a : null
  }

  function target(): ThreadRoot | null {
    const list = store.list.get()
    const id = activated.get()
    const a = id === null ? undefined : list.find((x) => x.id === id)
    return a ? threadRoot(list, a) : null
  }

  const editingRoot = (n: ThreadRoot): boolean => !n.locked && !n.contents?.trim()

  /** A note that closing now would remove. */
  function isEmptyRoot(n: ThreadRoot): boolean {
    return !written.has(n.id) && isAbandonedNote(n, store.list.get())
  }

  function dropIfEmpty(id: string): void {
    const list = store.list.get()
    const a = list.find((x) => x.id === id)
    if (!a || dropped.has(id) || written.has(id) || !isAbandonedNote(a, list)) return
    dropped.add(id)
    store.remove(id)
  }

  function renderThread(n: ThreadRoot): void {
    const items = threadOf(store.list.get(), n)
    if (editingRoot(n) && items.length === 1) {
      thread.remove()
      return
    }
    thread.replaceChildren(...items.map(threadItem))
    if (!thread.isConnected) popover.panel.prepend(thread)
  }

  function update(): void {
    const n = target()
    const id = n?.id ?? null
    if (id === current) {
      if (n && form) {
        renderThread(n)
        form.sync(n)
      }
      return
    }
    const previous = current
    current = id
    if (n) {
      const hadFocus = popover.panel.contains(document.activeElement)
      const opening = popover.panel.hidden
      form = createThreadForm(n, { submit, remove: removeThread, close })
      popover.panel.replaceChildren(form.element)
      popover.panel.setAttribute('aria-label', threadPopoverLabel(n))
      renderThread(n)
      popover.show(n.id)
      if ((opening || hadFocus) && !popover.panel.hidden) form.textarea.focus()
    } else {
      form = null
      popover.hide()
    }
    // Activation moved on from a note that never got any text: drop it. This can re-enter
    // `update`, which finds `current` already settled.
    if (previous !== null) dropIfEmpty(previous)
  }

  function submit(text: string): void {
    const n = shown()
    if (!n) return
    written.add(n.id)
    if (editingRoot(n)) store.update(n.id, { contents: text })
    else
      store.add({
        type: 'text',
        page: n.page,
        rect: n.rect,
        contents: text,
        inReplyTo: n.id,
      })
  }

  /** Locked roots cannot be removed: Delete is not offered for them. */
  function removeThread(): void {
    const n = shown()
    if (!n || n.locked) return
    focusReturn.beforeRemove(popover.anchor)
    dropped.add(n.id)
    store.remove(n.id)
    activated.set(null)
  }

  function close(): void {
    const n = shown()
    if (n && isEmptyRoot(n)) focusReturn.beforeRemove(popover.anchor)
    // `update` hides the popover and drops the note if it is still empty.
    activated.set(null)
  }

  const stops = [store.list.subscribe(update), activated.subscribe(update)]
  update()

  return {
    destroy() {
      for (const stop of stops) stop()
      popover.destroy()
    },
  }
}

function threadItem(a: Annotation): HTMLLIElement {
  return h(
    'li',
    {
      class: 'ink-thread-item',
      'data-ink-thread-item': '',
      ...(a.inReplyTo ? { 'data-reply': '' } : {}),
    },
    h('span', { class: 'ink-thread-author' }, a.author ?? 'Anonymous'),
    h(
      'time',
      { class: 'ink-thread-time', datetime: a.createdAt },
      new Date(a.createdAt).toLocaleString()
    ),
    h('p', { class: 'ink-thread-text' }, a.contents ?? '')
  )
}

interface ThreadForm {
  readonly element: HTMLFormElement
  readonly textarea: HTMLTextAreaElement
  /** Follows the root's state: "Comment" while its own text is empty, "Reply" after. */
  sync(n: ThreadRoot): void
}

function createThreadForm(
  n: ThreadRoot,
  actions: { submit: (text: string) => void; remove: () => void; close: () => void }
): ThreadForm {
  const textarea = h('textarea', { rows: '2' })
  const send = h('button', { type: 'submit' })
  const remove = button(threadDeleteLabel(n), actions.remove)
  const actionRow = h(
    'div',
    { class: 'ink-thread-actions' },
    send,
    remove,
    button('Close', actions.close)
  )
  const element = h(
    'form',
    { class: 'ink-thread-reply', 'data-ink-thread-reply': '' },
    textarea,
    actionRow
  )
  const syncSend = (): void => {
    send.disabled = !textarea.value.trim()
  }
  textarea.addEventListener('input', syncSend)
  element.addEventListener('submit', (e) => {
    e.preventDefault()
    const text = textarea.value.trim()
    if (!text) return
    // Cleared first: the store change re-renders the thread straight away.
    textarea.value = ''
    syncSend()
    actions.submit(text)
  })

  function sync(root: ThreadRoot): void {
    const label = !root.locked && !root.contents?.trim() ? 'Comment' : 'Reply'
    textarea.setAttribute('aria-label', label)
    textarea.placeholder = label
    send.textContent = label
    if (root.locked) remove.remove()
    else if (!remove.isConnected) send.after(remove)
  }
  sync(n)
  syncSend()
  return { element, textarea, sync }
}
