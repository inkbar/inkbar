<script module lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'

  export type InkFindBarProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'>
</script>

<script lang="ts">
  /*
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
  import { findAnnouncer, findCountText } from '@inkbar/core/dom'
  import { CaseSensitive, ChevronDown, ChevronUp, X } from '@inkbar/icons'
  import { untrack } from 'svelte'

  import { useInkContext } from '../context.js'
  import { useSearch } from '../hooks/useSearch.svelte.js'
  import { useReadable } from '../use-readable.svelte.js'

  import InkIcon from './InkIcon.svelte'

  import type { SearchState } from '@inkbar/core/dom'

  let { class: className, ...rest }: InkFindBarProps = $props()

  const ctx = useInkContext('InkFindBar')
  const search = useSearch()
  const scroll = useReadable(() => ctx.viewportEl, null)
  /** The viewport root: the scroll element's parent, once InkViewport has mounted. */
  const target = $derived(scroll.current?.parentElement ?? null)

  let bar = $state<HTMLDivElement | null>(null)
  let field = $state<HTMLInputElement | null>(null)
  let live = $state<HTMLDivElement | null>(null)
  /** Where focus was when the bar opened, and whether it was open on the last pass. */
  let before: HTMLElement | null = null
  let wasOpen = false

  const open = $derived(search.state.open)
  const query = $derived(search.state.query)

  // After the update, so the bar is shown (and can take focus) when it opens.
  $effect(() => {
    const el = bar
    const input = field
    const isOpen = open
    const text = query
    if (!el || !input) return
    untrack(() => {
      if (isOpen !== wasOpen) {
        wasOpen = isOpen
        const doc = el.ownerDocument
        if (isOpen) {
          const active = doc.activeElement
          before =
            active instanceof HTMLElement && active !== doc.body && !el.contains(active)
              ? active
              : null
          input.focus()
          input.select()
        } else {
          // Focus inside the bar is about to be lost with it; focus elsewhere is left alone.
          const hadFocus =
            el.contains(doc.activeElement) || doc.activeElement === doc.body
          if (hadFocus) {
            const to =
              before?.isConnected && !el.contains(before) ? before : scroll.current
            to?.focus({ preventScroll: true })
          }
          before = null
        }
      }
      if (input.value !== text) {
        input.value = text
        // A query set from code arrives after the bar opened: keep the new text selected.
        if (el.ownerDocument.activeElement === input) input.select()
      }
    })
  })

  // Registered while mounted.
  $effect(() => {
    const controller = ctx.search
    if (!controller || !target) return
    return controller.attachBar()
  })

  // The live region follows the controller's state change by change, as the vanilla bar does,
  // and is written directly. An update shows only the last of the changes batched into it, so
  // two steps in one task that end where they began would otherwise say nothing.
  $effect(() => {
    const controller = ctx.search
    const el = live
    if (!controller || !el) return
    return untrack(() => {
      const announce = findAnnouncer()
      const say = (s: SearchState): void => {
        const text = announce(s)
        if (el.textContent !== text) el.textContent = text
      }
      say(controller.state.get())
      return controller.state.subscribe(say)
    })
  })

  // A native listener, so Escape stops at the bar as it does in the vanilla and Vue bars;
  // Svelte's delegated events would stop it only after the root's own listeners saw it.
  $effect(() => {
    const controller = ctx.search
    const el = bar
    if (!controller || !el) return
    const onKeydown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
      e.preventDefault()
      e.stopPropagation()
      controller.close()
    }
    el.addEventListener('keydown', onKeydown)
    return () => el.removeEventListener('keydown', onKeydown)
  })

  /**
   * Moves the bar itself into the viewport root, leaving nothing where it is written. Svelte
   * removes it when its own `{#if}` branch goes, but not when an ancestor's block goes and
   * takes only the nodes still in place, so the cleanup removes it too. A keyed `{#each}` that
   * reorders would move the bar back to where it is written, so keep `InkFindBar` out of one.
   */
  const into = (to: Element) => (el: HTMLElement) => {
    to.appendChild(el)
    return () => el.remove()
  }
</script>

{#if target}
  <div
    {...rest}
    bind:this={bar}
    class={['ink-find-bar', className]}
    data-ink-find-bar=""
    role="search"
    hidden={!open}
    {@attach into(target)}
  >
    <input
      bind:this={field}
      type="text"
      aria-label="Find in document"
      autocomplete="off"
      spellcheck={false}
      oninput={(e) => search.setQuery(e.currentTarget.value)}
      onkeydown={(e) => {
        if (e.key !== 'Enter' || e.isComposing) return
        e.preventDefault()
        if (e.shiftKey) search.previous()
        else search.next()
      }}
    />
    <span class="ink-find-count" data-ink-find-count=""
      >{findCountText(search.state)}</span
    >
    <button
      type="button"
      data-ink-find-previous=""
      aria-label="Previous match"
      title="Previous match"
      onclick={() => search.previous()}
    >
      <InkIcon icon={ChevronUp} />
    </button>
    <button
      type="button"
      data-ink-find-next=""
      aria-label="Next match"
      title="Next match"
      onclick={() => search.next()}
    >
      <InkIcon icon={ChevronDown} />
    </button>
    <button
      type="button"
      data-ink-find-match-case=""
      aria-label="Match case"
      title="Match case"
      aria-pressed={search.state.matchCase}
      onclick={() => search.setMatchCase(!search.state.matchCase)}
    >
      <InkIcon icon={CaseSensitive} />
    </button>
    <button
      type="button"
      data-ink-find-close=""
      aria-label="Close find"
      title="Close find"
      onclick={() => search.close()}
    >
      <InkIcon icon={X} />
    </button>
    <div
      bind:this={live}
      class="ink-visually-hidden"
      data-ink-find-status=""
      aria-live="polite"
    ></div>
  </div>
{/if}
