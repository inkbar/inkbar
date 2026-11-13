<script module lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  export interface InkThumbnailsProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'children'
  > {
    /** 0-based pages to list, in order. Default: every page. */
    pages?: readonly number[] | undefined
    /**
     * Thumbnail width in CSS pixels. Default: `--ink-thumbnail-width` (px only) capped at the
     * list's width less a 16px gutter each side; with the token unset, that fit.
     */
    width?: number | undefined
    /** Draw each page's annotations. Default true. */
    annotations?: boolean | undefined
    /** Draw plugin marks. Default true. */
    marks?: boolean | undefined
    /**
     * Renders inside each item, after its page number. The item's height is fixed from the
     * page's, so keep what you add out of the flow (position it absolutely) or small.
     */
    item?: Snippet<[{ page: number; current: boolean }]> | undefined
  }
</script>

<script lang="ts">
  /*
   * The pages as a list of thumbnails: `createThumbnails`' markup on core's thumbnails
   * controller, which holds the current page, the keys, the clicks, the Tab stop and the window.
   * Only the items near the visible part are mounted, each placed at its offset over a spacer of
   * the full height, and each holds an `InkThumbnail`. An item is a button that scrolls the
   * viewport to its page; the current page's has `aria-current="page"`. Inside `InkRoot`; it
   * renders empty on the server.
   */
  import {
    createThumbnailsController,
    THUMBNAIL_WIDTH,
    type ThumbnailsController,
    type ThumbnailsState,
  } from '@inkbar/core/dom'
  import { untrack } from 'svelte'

  import { useInkContext } from '../context.js'
  import { toReadable } from '../to-readable.svelte.js'

  import InkThumbnail from './InkThumbnail.svelte'

  let {
    pages,
    width,
    annotations = true,
    marks = true,
    item,
    class: className,
    ...rest
  }: InkThumbnailsProps = $props()

  const ctx = useInkContext('InkThumbnails')
  const deps = {
    document: toReadable(() => ctx.document),
    pluginHost: toReadable(() => ctx.pluginHost),
    viewport: toReadable(() => ctx.viewport),
    messages: ctx.messageState,
  }
  const options = () => ({ pages, width, annotations, marks })

  let scroller = $state<HTMLDivElement | null>(null)
  let controller = $state.raw<ThumbnailsController | null>(null)
  /** Until the list mounts, and on the server: nothing listed. */
  let listed = $state.raw<ThumbnailsState>({
    pages: [],
    current: -1,
    window: { start: 0, end: 0 },
    offsets: [0],
    width: THUMBNAIL_WIDTH,
  })

  // A list unchanged in content publishes nothing, so an inline `pages` array cannot loop.
  $effect(() => {
    const c = controller
    const next = options()
    if (c) untrack(() => c.update(next))
  })
  $effect(() => {
    const el = scroller
    if (!el) return
    return untrack(() => {
      const c = createThumbnailsController(deps, options())
      controller = c
      listed = c.state.get()
      const stop = c.state.subscribe((s) => {
        listed = s
      })
      c.attach(el)
      return () => {
        stop()
        c.destroy()
        controller = null
      }
    })
  })

  const items = $derived.by(() => {
    const { pages: list, current, window, offsets } = listed
    return list.slice(window.start, window.end).map((page, k) => {
      const top = offsets[window.start + k]!
      const bottom = offsets[window.start + k + 1]!
      // Only a mounted controller has a window, so `controller` is set here.
      const attrs = controller?.itemAttrs(window.start + k) ?? {}
      return { page, current: page === current, top, height: bottom - top, attrs }
    })
  })
</script>

<div
  {...rest}
  bind:this={scroller}
  class={['ink-thumbnails', className]}
  data-ink-thumbnails=""
  role="list"
>
  <div
    class="ink-thumbnails-spacer"
    aria-hidden="true"
    style:height="{listed.offsets.at(-1) ?? 0}px"
  ></div>
  {#each items as entry (entry.page)}
    <div
      class="ink-thumbnails-entry"
      {...entry.attrs}
      style:top="{entry.top}px"
      style:height="{entry.height}px"
    >
      <!-- The controller sets the tabindex. The thumbnail names the button "Page N"; the
           visible number repeats it. -->
      <button
        type="button"
        class="ink-thumbnails-item"
        data-ink-thumbnail-item={entry.page}
        aria-current={entry.current ? 'page' : undefined}
      >
        <InkThumbnail page={entry.page} width={listed.width} {annotations} {marks} />
        <span class="ink-thumbnails-label" aria-hidden="true">{entry.page + 1}</span>
        {@render item?.({ page: entry.page, current: entry.current })}
      </button>
    </div>
  {/each}
</div>
