/*
 * The thread for the activated note, anchored to the note's overlay element. Activating a
 * reply opens the whole thread from its root. Closing (Close, Escape, a press outside) clears
 * the activation.
 *
 * A new note has no text. While its root is empty (and unlocked) the form writes the root's
 * own `contents`, labelled "Comment", and the thread list stays hidden until there is
 * something in it; after that the form adds replies. A root closed, or left for another
 * annotation, while still empty and without replies is removed. The thread list re-renders on
 * every store change; the form, and the draft in it, stays until the popover moves to another
 * note or the note is gone.
 */
import { isAbandonedNote, threadOf, threadRoot } from '../../model/annotations/threads'

import { button, h } from './dom'
import { createPopover } from './popover'

import type { AnnotationStore } from '../../model/annotations/store'
import type { Annotation, NoteAnnotation } from '../../model/annotations/types'
import type { Writable } from '../../model/readable'
import type { FocusReturn } from '../popover-focus'

export interface NotePopoverOptions {
  root: HTMLElement
  store: AnnotationStore
  activated: Writable<string | null>
  focusReturn: FocusReturn
}

export function createNotePopover(opts: NotePopoverOptions): { destroy(): void } {
  const { root, store, activated, focusReturn } = opts
  const popover = createPopover({
    root,
    attrs: {
      class: 'ink-note-popover',
      'data-ink-note-popover': '',
      'aria-label': 'Note thread',
    },
    focusReturn,
    onDismiss: close,
  })
  const thread = h('ol', { class: 'ink-thread', 'data-ink-thread': '' })
  let form: ThreadForm | null = null
  /** The root note shown now. */
  let current: string | null = null
  /** Notes given text or a reply here: never dropped as abandoned. */
  const written = new Set<string>()
  /** Notes already removed from here, so they are not removed twice. */
  const dropped = new Set<string>()

  function shown(): NoteAnnotation | null {
    const a = current ? store.get(current) : undefined
    return a?.type === 'note' ? a : null
  }

  function target(): NoteAnnotation | null {
    const list = store.list.get()
    const id = activated.get()
    const a = id === null ? undefined : list.find((x) => x.id === id)
    return a?.type === 'note' ? threadRoot(list, a) : null
  }

  const editingRoot = (n: NoteAnnotation): boolean => !n.locked && !n.contents?.trim()

  function isEmptyRoot(n: NoteAnnotation): boolean {
    return (
      !written.has(n.id) && editingRoot(n) && threadOf(store.list.get(), n).length === 1
    )
  }

  function dropIfEmpty(id: string): void {
    if (dropped.has(id) || written.has(id) || !isAbandonedNote(store.list.get(), id))
      return
    dropped.add(id)
    store.remove(id)
  }

  function renderThread(n: NoteAnnotation): void {
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
        type: 'note',
        page: n.page,
        rect: n.rect,
        contents: text,
        inReplyTo: n.id,
      })
  }

  /** Locked notes cannot be removed: Delete is not offered for them. */
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
  /** Follows the note's state: "Comment" while its own text is empty, "Reply" after. */
  sync(n: NoteAnnotation): void
}

function createThreadForm(
  n: NoteAnnotation,
  actions: { submit: (text: string) => void; remove: () => void; close: () => void }
): ThreadForm {
  const textarea = h('textarea', { rows: '2' })
  const send = h('button', { type: 'submit' })
  const remove = button('Delete', actions.remove)
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

  function sync(note: NoteAnnotation): void {
    const label = !note.locked && !note.contents?.trim() ? 'Comment' : 'Reply'
    textarea.setAttribute('aria-label', label)
    textarea.placeholder = label
    send.textContent = label
    if (note.locked) remove.remove()
    else if (!remove.isConnected) send.after(remove)
  }
  sync(n)
  syncSend()
  return { element, textarea, sync }
}
