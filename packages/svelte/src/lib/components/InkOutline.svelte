<script module lang="ts">
  import type { Label, OutlineItem } from '@inkbar/core'
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  export interface InkOutlineProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'children'
  > {
    /**
     * Shown when the document has no outline: a string, or a function read again whenever the
     * root's `messages` change. Default "This document has no outline", in the root's words.
     */
    emptyText?: Label | undefined
    /**
     * Replaces an item's title, given the item and whether it is the current one and whether it
     * is expanded. Keep what it renders non-interactive.
     */
    item?: Snippet<[OutlineItem, { current: boolean; expanded: boolean }]> | undefined
  }
</script>

<script lang="ts">
  /*
   * The open document's outline as a tree: `createOutline`'s markup on core's outline controller,
   * which holds what is expanded, the Tab stop, the keys, the current item and Back's history.
   * Clicking an item, or Enter on it, follows it; its chevron expands and collapses it. It fills
   * its parent's height and scrolls, and keeps the item the reader has reached in view. The
   * `item` snippet replaces an item's title. Inside `InkRoot`; the tree is empty on the server.
   */
  import {
    createOutlineController,
    outlineTreeAttrs,
    type OutlineController,
  } from '@inkbar/core/dom'
  import { ChevronRight } from '@inkbar/icons'
  import { untrack } from 'svelte'

  import { useInkContext } from '../context.js'
  import { hostLabel } from '../messages.js'
  import { toReadable } from '../to-readable.svelte.js'

  import InkIcon from './InkIcon.svelte'

  let {
    emptyText,
    item: renderItem,
    class: className,
    ...rest
  }: InkOutlineProps = $props()

  const ctx = useInkContext('InkOutline')
  const deps = {
    document: toReadable(() => ctx.document),
    viewport: toReadable(() => ctx.viewport),
    navigation: toReadable(() => ctx.navigation),
  }

  let root = $state<HTMLDivElement | null>(null)
  let controller = $state.raw<OutlineController | null>(null)
  // Until the controller is built after mount, and on the server: nothing listed.
  let items = $state.raw<readonly OutlineItem[]>([])
  let loading = $state.raw(false)
  let expanded = $state.raw<ReadonlySet<string>>(new Set())
  let current = $state.raw<string | null>(null)
  let focused = $state.raw<string | null>(null)

  // Built once the element exists, as the other controller-backed components do: it subscribes
  // to the document, so nothing is created while rendering on the server.
  $effect(() => {
    const el = root
    if (!el) return
    return untrack(() => {
      const c = createOutlineController(deps)
      controller = c
      items = c.items.get()
      loading = c.loading.get()
      expanded = c.expanded.get()
      current = c.current.get()
      focused = c.focused.get()
      const stops = [
        c.items.subscribe((v) => (items = v)),
        c.loading.subscribe((v) => (loading = v)),
        c.expanded.subscribe((v) => (expanded = v)),
        c.current.subscribe((v) => (current = v)),
        c.focused.subscribe((v) => (focused = v)),
        c.bindScroll(el),
      ]
      return () => {
        for (const stop of stops) stop()
        c.destroy()
        controller = null
      }
    })
  })

  /** The item's attributes. Reading the stores here makes a render follow them. */
  function attrs(id: string): Record<string, string | undefined> {
    void [expanded, current, focused]
    return controller?.itemAttrs(id) ?? {}
  }

  const level = (id: string): number => id.split('.').length - 1
</script>

{#snippet nodes(list: readonly OutlineItem[])}
  {#each list as entry (entry.id)}
    {@const c = controller!}
    {@const open = expanded.has(entry.id)}
    <li
      class="ink-outline-item"
      data-ink-outline-item={entry.id}
      data-bold={entry.bold ? '' : undefined}
      data-italic={entry.italic ? '' : undefined}
      style:--ink-outline-level={level(entry.id)}
      {...attrs(entry.id)}
    >
      <!-- The tree's keys come from the controller, so the row itself is not focusable. -->
      <div
        class="ink-outline-row"
        {...c.rowAttrs(entry.id)}
        onclick={() => c.activate(entry.id)}
      >
        {#if entry.children.length > 0}
          <span
            class="ink-outline-toggle"
            aria-hidden="true"
            onclick={(e) => {
              // Expanding is not following: the row's own click is not reached.
              e.stopPropagation()
              c.toggle(entry.id)
            }}
          >
            <InkIcon icon={ChevronRight} />
          </span>
        {:else}
          <span class="ink-outline-spacer" aria-hidden="true"></span>
        {/if}
        <span class="ink-outline-title" {...c.titleAttrs(entry.id)}>
          {#if renderItem}
            {@render renderItem(entry, { current: current === entry.id, expanded: open })}
          {:else}
            {entry.title}
          {/if}
        </span>
      </div>
      {#if entry.children.length > 0}
        <ul class="ink-outline-group" role="group" hidden={!open}>
          {@render nodes(entry.children)}
        </ul>
      {/if}
    </li>
  {/each}
{/snippet}

<div
  {...rest}
  bind:this={root}
  class={['ink-outline', className]}
  data-ink-outline=""
  aria-busy={loading ? 'true' : undefined}
>
  <ul
    class="ink-outline-tree"
    {...outlineTreeAttrs(ctx.messages)}
    hidden={items.length === 0}
    onkeydown={(e) => controller?.onKeydown(e)}
  >
    {#if controller}{@render nodes(items)}{/if}
  </ul>
  {#if controller && !loading && items.length === 0}
    <p class="ink-outline-empty">{hostLabel(emptyText, ctx.messages.outline.empty)}</p>
  {/if}
</div>
