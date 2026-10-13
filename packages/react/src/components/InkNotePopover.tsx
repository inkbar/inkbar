/*
 * The thread for the activated note, anchored to the note's overlay element. Activating a
 * reply opens the whole thread from its root. Closing (Close, Escape, a press outside) clears
 * `activated`.
 *
 * A new note has no text. While its root is empty (and unlocked) the default form writes the
 * root's own `contents`, labelled "Comment", and the thread list stays hidden until there is
 * something in it; after that the form adds replies. Closing a root that is still empty and
 * has no replies removes it, so an abandoned note does not stay on the page.
 */
import { isAbandonedNote, threadOf, threadRoot } from '@inkbar/core'
import { Popover } from 'radix-ui'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'

import { useInkContext } from '../context'
import { useAnnotations } from '../hooks/useAnnotations'
import { useLatest } from '../use-latest'

import { useAnnotationElement } from './annotation-element'
import { keepOpenOnAnnotation, useFocusReturn } from './popover-focus'

import type { Annotation, NoteAnnotation } from '@inkbar/core'
import type { NotePopoverSlotProps } from '@inkbar/core/dom'

export interface InkNotePopoverProps {
  children?: ((props: NotePopoverSlotProps) => ReactNode) | undefined
}

export function InkNotePopover({ children }: InkNotePopoverProps) {
  const ctx = useInkContext('InkNotePopover')
  const { annotations, add, update, remove } = useAnnotations()

  const note = useMemo<NoteAnnotation | null>(() => {
    const a = ctx.activated ? annotations.find((x) => x.id === ctx.activated) : undefined
    return a?.type === 'note' ? threadRoot(annotations, a) : null
  }, [annotations, ctx.activated])
  const anchor = useAnnotationElement(ctx.rootEl, note?.id ?? null)
  const anchorRef = useMemo(() => ({ current: anchor }), [anchor])
  const focusReturn = useFocusReturn(ctx)
  const open = note !== null && anchor !== null
  /** The root, then every reply below it, depth first, each level in creation order. */
  const thread = useMemo<Annotation[]>(
    () => (note ? threadOf(annotations, note) : []),
    [annotations, note]
  )
  /** True while the default form writes the root note's own text rather than a reply. */
  const editingRoot = note !== null && !note.locked && !note.contents?.trim()

  const [draft, setDraft] = useState('')
  /**
   * Notes this popover wrote text or a reply for. In controlled mode the write is a proposal
   * the host may not have applied yet, so the applied list still shows the note empty; these
   * are never dropped as abandoned.
   */
  const written = useRef(new Set<string>())
  const latest = useLatest({ annotations, remove })

  function dropIfEmpty(id: string): boolean {
    if (written.current.has(id) || !isAbandonedNote(latest.current.annotations, id))
      return false
    latest.current.remove(id)
    return true
  }

  // Activation moved on from a note that never got any text: drop it.
  const noteId = note?.id
  const previousId = useRef<string | undefined>(undefined)
  useEffect(() => {
    const previous = previousId.current
    if (previous === noteId) return
    previousId.current = noteId
    setDraft('')
    if (previous !== undefined) dropIfEmpty(previous)
    // dropIfEmpty reads through `latest`; it is stable for the effect's purposes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  function reply(text: string): void {
    const root = note
    const contents = text.trim()
    if (!root || !contents) return
    written.current.add(root.id)
    add({ type: 'note', page: root.page, rect: root.rect, contents, inReplyTo: root.id })
    setDraft('')
  }
  function isEmptyRoot(root: NoteAnnotation): boolean {
    return (
      !written.current.has(root.id) &&
      !root.locked &&
      !root.contents?.trim() &&
      thread.length === 1
    )
  }
  function close(): void {
    const root = note
    if (root && annotations.some((a) => a.id === root.id) && isEmptyRoot(root)) {
      focusReturn.beforeRemove(anchor)
      dropIfEmpty(root.id)
    }
    ctx.setActivated(null)
  }
  function updateContents(contents: string): void {
    if (!note || note.locked) return
    if (contents.trim()) written.current.add(note.id)
    update(note.id, { contents })
  }
  function submit(e: FormEvent): void {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    if (editingRoot) {
      updateContents(text)
      setDraft('')
    } else reply(text)
  }
  /** Locked notes cannot be removed: removing one does nothing and keeps the popover. */
  function removeThread(): void {
    const root = note
    if (!root || root.locked) return
    focusReturn.beforeRemove(anchor)
    remove(root.id)
    // Not `close()`: under a slow controlled host the note is still listed, and close would
    // try to drop it a second time.
    ctx.setActivated(null)
  }

  return (
    <Popover.Root open={open} onOpenChange={(next) => !next && close()}>
      <Popover.Anchor virtualRef={anchorRef} />
      <Popover.Portal>
        {note && anchor ? (
          <Popover.Content
            className="ink-note-popover"
            data-ink-note-popover=""
            side="right"
            sideOffset={8}
            collisionPadding={8}
            aria-label="Note thread"
            onInteractOutside={keepOpenOnAnnotation}
            onCloseAutoFocus={(e) => focusReturn.onCloseAutoFocus(e, anchor)}
          >
            {children ? (
              children({
                note,
                replies: thread.slice(1),
                reply,
                update: updateContents,
                remove: removeThread,
                close,
              })
            ) : (
              <>
                {!editingRoot || thread.length > 1 ? (
                  <ol className="ink-thread" data-ink-thread="">
                    {thread.map((item) => (
                      <li
                        key={item.id}
                        className="ink-thread-item"
                        data-ink-thread-item=""
                        data-reply={item.inReplyTo ? '' : undefined}
                      >
                        <span className="ink-thread-author">
                          {item.author ?? 'Anonymous'}
                        </span>
                        <time className="ink-thread-time" dateTime={item.createdAt}>
                          {new Date(item.createdAt).toLocaleString()}
                        </time>
                        <p className="ink-thread-text">{item.contents}</p>
                      </li>
                    ))}
                  </ol>
                ) : null}
                <form
                  className="ink-thread-reply"
                  data-ink-thread-reply=""
                  onSubmit={submit}
                >
                  <textarea
                    aria-label={editingRoot ? 'Comment' : 'Reply'}
                    rows={2}
                    placeholder={editingRoot ? 'Comment' : 'Reply'}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <div className="ink-thread-actions">
                    <button type="submit" disabled={!draft.trim()}>
                      {editingRoot ? 'Comment' : 'Reply'}
                    </button>
                    {!note.locked ? (
                      <button type="button" onClick={removeThread}>
                        Delete
                      </button>
                    ) : null}
                    <button type="button" onClick={close}>
                      Close
                    </button>
                  </div>
                </form>
              </>
            )}
          </Popover.Content>
        ) : null}
      </Popover.Portal>
    </Popover.Root>
  )
}
