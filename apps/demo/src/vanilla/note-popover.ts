/*
 * The thread for an activated note. A new note has no text, so the form first writes the
 * note's own text, then adds replies. A note closed with no text and no replies is removed.
 */
import {
  isAbandonedNote,
  threadOf,
  threadRoot,
  type AnnotationStore,
  type NoteAnnotation,
} from '@inkbar/core'

import { button, h } from './dom'
import { createPopover } from './popover'

export function createNotePopover(root: HTMLElement, store: AnnotationStore) {
  let current: string | null = null
  const popover = createPopover(
    root,
    {
      class: 'ink-note-popover',
      'data-ink-note-popover': '',
      'aria-label': 'Note thread',
    },
    close
  )

  function note(): NoteAnnotation | null {
    const a = current ? store.get(current) : undefined
    return a?.type === 'note' ? a : null
  }

  function dropIfEmpty(id: string): void {
    if (isAbandonedNote(store.list.get(), id)) store.remove(id)
  }

  function render(): void {
    const n = note()
    if (!n) {
      close()
      return
    }
    const writingRoot = !n.locked && !n.contents?.trim()
    const label = writingRoot ? 'Comment' : 'Reply'
    const textarea = h('textarea', { rows: '2', 'aria-label': label, placeholder: label })
    const form = h(
      'form',
      { class: 'ink-thread-reply', 'data-ink-thread-reply': '' },
      textarea,
      h(
        'div',
        { class: 'ink-thread-actions' },
        h('button', { type: 'submit' }, label),
        ...(n.locked
          ? []
          : [
              button('Delete', () => {
                store.remove(n.id)
                close()
              }),
            ]),
        button('Close', close)
      )
    )
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const text = textarea.value.trim()
      if (!text) return
      if (writingRoot) store.update(n.id, { contents: text })
      else
        store.add({
          type: 'note',
          page: n.page,
          rect: n.rect,
          contents: text,
          inReplyTo: n.id,
        })
    })
    const items = threadOf(store.list.get(), n)
      .filter((a) => a.contents?.trim())
      .map((a) =>
        h(
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
      )
    const thread = items.length
      ? [h('ol', { class: 'ink-thread', 'data-ink-thread': '' }, ...items)]
      : []
    popover.panel.replaceChildren(...thread, form)
    textarea.focus()
  }

  const stop = store.list.subscribe(() => {
    if (current) render()
  })

  function open(id: string): void {
    const a = store.get(id)
    if (a?.type !== 'note') {
      close()
      return
    }
    const rootNote = threadRoot(store.list.get(), a)
    if (current && current !== rootNote.id) dropIfEmpty(current)
    current = rootNote.id
    if (!popover.show(current)) {
      current = null
      return
    }
    render()
  }

  function close(): void {
    if (!current) return
    const id = current
    current = null
    popover.hide()
    dropIfEmpty(id)
  }

  return {
    open,
    destroy() {
      stop()
      popover.destroy()
    },
  }
}
