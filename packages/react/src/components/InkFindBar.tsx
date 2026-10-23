import { findAnnouncer, findCountText } from '@inkbar/core/dom'
import { CaseSensitive, ChevronDown, ChevronUp, X } from '@inkbar/icons'
import { useEffect, useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react'
import { createPortal } from 'react-dom'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { useSearch } from '../hooks/useSearch'
import { useReadable } from '../use-readable'

import { InkIcon } from './InkIcon'

import type { SearchState } from '@inkbar/core/dom'

export type InkFindBarProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'>

/**
 * The find bar: a field, the match count, previous and next, a match-case toggle and close,
 * a view of the root's search state. Place it anywhere inside `InkRoot`: it portals itself
 * into `[data-ink-viewport-root]`, the positioned ancestor the theme floats it from over the
 * top-right of the pages (as `InkThreadPopover` anchors to the root's overlay rather than
 * where it is written). It renders nothing until `InkViewport` has mounted, and is hidden
 * while the search is closed. While it is mounted it registers with the search controller,
 * which is what lets Ctrl/Cmd+F open it.
 *
 * Enter in the field steps to the next match, Shift+Enter to the previous, Escape closes.
 * Closing returns focus to where it was before the bar opened, else to the document.
 */
export function InkFindBar({ className, ...rest }: InkFindBarProps) {
  const ctx = useInkContext('InkFindBar')
  const { state, setQuery, setMatchCase, next, previous, close } = useSearch()
  const scroll = useReadable(ctx.viewportEl, null)
  /** The viewport root: the scroll element's parent, once InkViewport has mounted. */
  const target = scroll?.parentElement ?? null
  const bar = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const live = useRef<HTMLDivElement>(null)
  /** Where focus was when the bar opened, and whether it was open on the last pass. */
  const before = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)

  // After the commit, so the bar is shown (and can take focus) when it opens.
  useLayoutEffect(() => {
    const el = bar.current
    const input = field.current
    if (!el || !input) return
    if (state.open !== wasOpen.current) {
      wasOpen.current = state.open
      const doc = el.ownerDocument
      if (state.open) {
        const active = doc.activeElement
        before.current =
          active instanceof HTMLElement && active !== doc.body && !el.contains(active)
            ? active
            : null
        input.focus()
        input.select()
      } else {
        // Focus inside the bar is about to be lost with it; focus elsewhere is left alone.
        const hadFocus = el.contains(doc.activeElement) || doc.activeElement === doc.body
        if (hadFocus) {
          const to =
            before.current?.isConnected && !el.contains(before.current)
              ? before.current
              : scroll
          to?.focus({ preventScroll: true })
        }
        before.current = null
      }
    }
    if (input.value !== state.query) {
      input.value = state.query
      // A query set from code arrives after the bar opened: keep the new text selected.
      if (el.ownerDocument.activeElement === input) input.select()
    }
  }, [state.open, state.query, scroll])

  // Registered while mounted.
  const { search } = ctx
  useEffect(() => {
    if (!search || !target) return
    return search.attachBar()
  }, [search, target])

  // The live region follows the controller's state change by change, as the vanilla bar does,
  // and is written directly. A render shows only the last of the changes batched into it, so
  // two steps in one task that end where they began would otherwise say nothing.
  useEffect(() => {
    const el = live.current
    if (!search || !el) return
    const announce = findAnnouncer()
    const say = (s: SearchState): void => {
      const text = announce(s)
      if (el.textContent !== text) el.textContent = text
    }
    say(search.state.get())
    return search.state.subscribe(say)
  }, [search, target])

  // A native listener, so Escape stops at the bar as it does in the vanilla and Vue bars;
  // React's delegated events would stop it only after the root's own listeners saw it.
  useEffect(() => {
    const el = bar.current
    if (!search || !el) return
    const onKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
      e.preventDefault()
      e.stopPropagation()
      search.close()
    }
    el.addEventListener('keydown', onKeyDown)
    return () => el.removeEventListener('keydown', onKeyDown)
  }, [search, target])

  if (!target) return null

  return createPortal(
    <div
      {...rest}
      ref={bar}
      className={cx('ink-find-bar', className)}
      data-ink-find-bar=""
      role="search"
      hidden={!state.open}
    >
      <input
        ref={field}
        type="text"
        aria-label="Find in document"
        autoComplete="off"
        spellCheck={false}
        onInput={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
          e.preventDefault()
          if (e.shiftKey) previous()
          else next()
        }}
      />
      <span className="ink-find-count" data-ink-find-count="">
        {findCountText(state)}
      </span>
      <button
        type="button"
        data-ink-find-previous=""
        aria-label="Previous match"
        title="Previous match"
        onClick={() => previous()}
      >
        <InkIcon icon={ChevronUp} />
      </button>
      <button
        type="button"
        data-ink-find-next=""
        aria-label="Next match"
        title="Next match"
        onClick={() => next()}
      >
        <InkIcon icon={ChevronDown} />
      </button>
      <button
        type="button"
        data-ink-find-match-case=""
        aria-label="Match case"
        title="Match case"
        aria-pressed={state.matchCase}
        onClick={() => setMatchCase(!state.matchCase)}
      >
        <InkIcon icon={CaseSensitive} />
      </button>
      <button
        type="button"
        data-ink-find-close=""
        aria-label="Close find"
        title="Close find"
        onClick={() => close()}
      >
        <InkIcon icon={X} />
      </button>
      <div
        ref={live}
        className="ink-visually-hidden"
        data-ink-find-status=""
        aria-live="polite"
      />
    </div>,
    target
  )
}
