<script setup lang="ts">
/*
 * The find bar: a field, the match count, previous and next, a match-case toggle and close,
 * a view of the root's search state. Place it anywhere inside `InkRoot`: it teleports itself
 * into `[data-ink-viewport-root]`, the positioned ancestor the theme floats it from over the
 * top-right of the pages (as `InkThreadPopover` anchors to the root's overlay rather than
 * where it is written). It is hidden while the search is closed. While it is mounted it
 * registers with the search controller, which is what lets Ctrl/Cmd+F open it.
 *
 * Enter in the field steps to the next match, Shift+Enter to the previous, Escape closes.
 * Closing returns focus to where it was before the bar opened, else to the document.
 */
import { findAnnouncer, findCountText } from '@inkbar/core/dom'
import { CaseSensitive, ChevronDown, ChevronUp, X } from '@inkbar/icons'
import { computed, onBeforeUnmount, useTemplateRef, watch } from 'vue'

import { useSearch } from '../composables/useSearch'
import { useInkContext } from '../context'

import InkIcon from './InkIcon.vue'

import type { SearchState } from '@inkbar/core/dom'

// The root is a Teleport, so attributes such as `class` are bound to the bar itself.
defineOptions({ inheritAttrs: false })

const ctx = useInkContext('InkFindBar')
const { state, setQuery, setMatchCase, next, previous, close } = useSearch()

/** The viewport root: the scroll element's parent, once InkViewport has mounted. */
const target = computed(() => ctx.viewportEl.value?.parentElement ?? null)
const bar = useTemplateRef<HTMLElement>('bar')
const field = useTemplateRef<HTMLInputElement>('field')
const live = useTemplateRef<HTMLElement>('live')

const count = computed(() => findCountText(state.value))

// The live region follows the controller's state change by change, as the vanilla bar does,
// and is written directly. A render shows only the last of the changes since the one before,
// so two steps in one tick that end where they began would otherwise say nothing.
watch(
  [() => ctx.search.value, live],
  ([controller, el], _, onCleanup) => {
    if (!controller || !el) return
    const announce = findAnnouncer()
    const say = (s: SearchState): void => {
      const text = announce(s)
      if (el.textContent !== text) el.textContent = text
    }
    say(controller.state.get())
    onCleanup(controller.state.subscribe(say))
  },
  { flush: 'post', immediate: true }
)

function onFieldKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Enter' || e.isComposing) return
  e.preventDefault()
  if (e.shiftKey) previous()
  else next()
}
function onBarKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
  e.preventDefault()
  e.stopPropagation()
  close()
}

/** Where focus was when the bar opened. */
let before: HTMLElement | null = null
let wasOpen = false

function restoreFocus(): void {
  const el = bar.value
  const scroll = ctx.viewportEl.value
  const to = before?.isConnected && !el?.contains(before) ? before : scroll
  before = null
  to?.focus({ preventScroll: true })
}

function show(s: SearchState): void {
  const el = bar.value
  const input = field.value
  if (!el || !input) return
  if (s.open !== wasOpen) {
    wasOpen = s.open
    const doc = el.ownerDocument
    if (s.open) {
      const active = doc.activeElement
      before =
        active instanceof HTMLElement && active !== doc.body && !el.contains(active)
          ? active
          : null
      input.focus()
      input.select()
    } else {
      // Focus inside the bar is about to be lost with it; focus elsewhere is left alone.
      const hadFocus = el.contains(doc.activeElement) || doc.activeElement === doc.body
      if (hadFocus) restoreFocus()
      else before = null
    }
  }
  if (input.value !== s.query) {
    input.value = s.query
    // A query set from code arrives after the bar opened: keep the new text selected.
    if (el.ownerDocument.activeElement === input) input.select()
  }
}

// After the render, so the bar is shown (and can take focus) when it opens, and the field is
// updated once it exists.
watch([state, bar, field], ([s]) => show(s), { flush: 'post', immediate: true })

// Registered while mounted.
let detach: (() => void) | null = null
watch(
  [() => ctx.search.value, bar],
  ([controller, el]) => {
    detach?.()
    detach = controller && el ? controller.attachBar() : null
  },
  { flush: 'post', immediate: true }
)
onBeforeUnmount(() => {
  detach?.()
  detach = null
})
</script>

<template>
  <Teleport v-if="target" :to="target">
    <div
      v-bind="$attrs"
      ref="bar"
      class="ink-find-bar"
      data-ink-find-bar
      role="search"
      :hidden="!state.open"
      @keydown="onBarKeydown"
    >
      <input
        ref="field"
        type="text"
        aria-label="Find in document"
        autocomplete="off"
        spellcheck="false"
        @input="setQuery(($event.target as HTMLInputElement).value)"
        @keydown="onFieldKeydown"
      />
      <span class="ink-find-count" data-ink-find-count>{{ count }}</span>
      <button
        type="button"
        data-ink-find-previous
        aria-label="Previous match"
        title="Previous match"
        @click="previous()"
      >
        <InkIcon :icon="ChevronUp" />
      </button>
      <button
        type="button"
        data-ink-find-next
        aria-label="Next match"
        title="Next match"
        @click="next()"
      >
        <InkIcon :icon="ChevronDown" />
      </button>
      <button
        type="button"
        data-ink-find-match-case
        aria-label="Match case"
        title="Match case"
        :aria-pressed="state.matchCase"
        @click="setMatchCase(!state.matchCase)"
      >
        <InkIcon :icon="CaseSensitive" />
      </button>
      <button
        type="button"
        data-ink-find-close
        aria-label="Close find"
        title="Close find"
        @click="close()"
      >
        <InkIcon :icon="X" />
      </button>
      <div
        ref="live"
        class="ink-visually-hidden"
        data-ink-find-status
        aria-live="polite"
      />
    </div>
  </Teleport>
</template>
