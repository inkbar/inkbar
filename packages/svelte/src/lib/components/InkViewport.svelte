<script module lang="ts">
  import type { InkError } from '@inkbar/core'
  import type { AnnotationSlotProps, LayoutMode, ViewRotation } from '@inkbar/core/dom'
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  export interface InkViewportProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'children'
  > {
    mode?: LayoutMode
    rotation?: ViewRotation
    /** Gap between pages, CSS px. */
    gap?: number
    /** Pages kept mounted either side of the visible ones. */
    buffer?: number
    loading?: Snippet | undefined
    empty?: Snippet | undefined
    error?: Snippet<[{ error: InkError }]> | undefined
    annotation?: Snippet<[AnnotationSlotProps]> | undefined
    /** Shown inside a page that failed to render. The rest of the document stays usable. */
    pageError?: Snippet<[{ error: InkError; page: number }]> | undefined
  }
</script>

<script lang="ts">
  /*
   * The scroll element is handed to core's `createViewport` and `createToolController`; Svelte
   * never renders children into it. Pages are InkPage components rendered here (they render
   * nothing visible in place) that mount core's page layers into the hosts the viewport creates.
   * Keyboard shortcuts are core's `attachViewportKeys` on the scroll element.
   *
   * Two-way zoom and page: the viewport's own changes are reported through the context, and
   * the host's props are applied only when they differ from the viewport's state, so the echo
   * of a reported value does nothing.
   */
  import {
    attachViewportKeys,
    createToolController,
    createViewport,
    getSelectionQuads,
  } from '@inkbar/core/dom'
  import { untrack } from 'svelte'

  import { useInkContext } from '../context.js'

  import InkPage from './InkPage.svelte'

  import type { InkDocument, InkStatus } from '@inkbar/core'
  import type {
    PageTransform,
    ToolController,
    Viewport,
    ZoomValue,
  } from '@inkbar/core/dom'

  let {
    mode = 'continuous',
    rotation = 0,
    gap = 16,
    buffer = 2,
    loading,
    empty,
    error,
    annotation,
    pageError,
    class: className,
    ...rest
  }: InkViewportProps = $props()

  interface MountedPage {
    /** The viewport build the host belongs to; part of the InkPage key. */
    build: number
    page: number
    host: HTMLElement
    transform: PageTransform
  }

  const ctx = useInkContext('InkViewport')
  let scroll = $state<HTMLDivElement | null>(null)
  let pages = $state.raw<MountedPage[]>([])

  let viewport: Viewport | null = null
  let tools: ToolController | null = null
  /**
   * Bumped on every build. A rebuild gives each page a new host element, and InkPage mounts
   * into its host only once, so pages from an earlier build must remount, not be reused.
   */
  let build = 0
  let stops: (() => void)[] = []
  /** The document the viewport was built for, and the zoom and page last reported to the host. */
  let builtFor: InkDocument | null = null
  let lastReportedZoom: ZoomValue | undefined
  let lastReportedPage: number | undefined

  function teardown(): void {
    for (const stop of stops) stop()
    stops = []
    tools?.destroy()
    viewport?.destroy()
    tools = null
    viewport = null
    ctx.setViewport(null, null)
    if (pages.length > 0) pages = []
  }

  function setup(
    doc: InkDocument | null,
    state: InkStatus['state'],
    el: HTMLDivElement | null,
    g: number,
    b: number
  ): void {
    // Rebuilding for the same document (a gap or buffer change) keeps where the reader was.
    const carry =
      viewport && builtFor === doc
        ? { zoom: viewport.zoom.get(), page: viewport.currentPage.get() }
        : null
    teardown()
    if (!carry) {
      builtFor = null
      lastReportedZoom = undefined
      lastReportedPage = undefined
    }
    if (!doc || !el || state !== 'ready') return
    const current = ++build
    const vp = createViewport({
      container: el,
      document: doc,
      zoom: carry?.zoom ?? ctx.zoomModel ?? 'fit-width',
      mode,
      rotation,
      gap: g,
      buffer: b,
      onMount: (page, host, transform) => {
        pages = [...pages, { build: current, page, host, transform }]
      },
      onUpdate: (page, host, transform) => {
        pages = pages.map((p) =>
          p.page === page ? { build: current, page, host, transform } : p
        )
      },
      onUnmount: (page) => {
        pages = pages.filter((p) => p.page !== page)
      },
    })
    const tc = createToolController({
      initial: ctx.tool,
      ctx: {
        store: doc.annotations,
        viewport: vp,
        root: el,
        selectionQuads: () =>
          getSelectionQuads(el, (host) => {
            const page = Number(host.dataset.page)
            return { page, transform: vp.transformFor(page) }
          }),
        clearSelection: () =>
          el.ownerDocument.defaultView?.getSelection()?.removeAllRanges(),
        onActivate: (id) => ctx.setActivated(id),
      },
    })
    viewport = vp
    tools = tc
    ctx.setViewport(vp, tc)
    // Every successful build records its document, so each later rebuild carries state too.
    builtFor = doc
    if (!carry) {
      // A new document starts from where the viewport opens; only later changes are reported.
      lastReportedZoom = vp.zoom.get()
      lastReportedPage = vp.currentPage.get()
    }
    const page = carry?.page ?? ctx.pageModel
    if (page !== undefined && page !== vp.currentPage.get()) vp.scrollToPage(page)
    const reportZoom = (z: ZoomValue): void => {
      if (z === lastReportedZoom) return
      lastReportedZoom = z
      ctx.reportZoom(z)
    }
    const reportPage = (p: number): void => {
      if (p === lastReportedPage) return
      lastReportedPage = p
      ctx.reportPage(p)
    }
    stops = [
      attachViewportKeys(el, { viewport: vp, pageCount: () => doc.pages.length }),
      vp.zoom.subscribe(reportZoom),
      vp.currentPage.subscribe(reportPage),
    ]
    // Whatever the restore changed is reported once; nothing is when it matched.
    reportZoom(vp.zoom.get())
    reportPage(vp.currentPage.get())
  }

  // Build for a new document or status; rebuild when the construction options change. Only the
  // five values read before `untrack` are dependencies, and each is read through a derived,
  // which notifies only when the value changes: a host that spreads its props invalidates `gap`
  // and `buffer` without changing them, and the status is a new object on every engine report.
  const buildDocument = $derived(ctx.document)
  const buildState = $derived(ctx.status.state)
  const buildGap = $derived(gap)
  const buildBuffer = $derived(buffer)
  $effect(() => {
    const doc = buildDocument
    const state = buildState
    const el = scroll
    const g = buildGap
    const b = buildBuffer
    untrack(() => setup(doc, state, el, g, b))
  })
  $effect(() => () => teardown())

  $effect(() => {
    const z = ctx.zoomModel
    const vp = viewport
    if (vp && z !== undefined && z !== vp.zoom.get()) vp.setZoom(z)
  })
  $effect(() => {
    const p = ctx.pageModel
    const vp = viewport
    if (!vp || p === undefined || p === lastReportedPage) return
    if (p !== vp.currentPage.get()) vp.scrollToPage(p)
  })
  $effect(() => {
    const t = ctx.tool
    const tc = tools
    if (tc && tc.active.get() !== t) tc.set(t)
  })
  // The build applied both; these only act on a later change, not on mount.
  $effect(() => {
    const m = mode
    const vp = viewport
    if (vp && vp.mode.get() !== m) vp.setMode(m)
  })
  $effect(() => {
    const r = rotation
    const vp = viewport
    if (vp && vp.rotation.get() !== r) vp.setRotation(r)
  })

  // Not `state`: next to the `$state` rune, Svelte reads that name as a store.
  const viewState = $derived(buildState)
  const err = $derived(ctx.status.state === 'error' ? ctx.status.error : null)
  const custom = $derived(!!annotation)
</script>

<div
  {...rest}
  class={['ink-viewport-root', className]}
  data-ink-viewport-root=""
  data-state={viewState}
>
  {#if viewState === 'loading'}
    <div class="ink-status" role="status" aria-live="polite">
      {#if loading}{@render loading()}{:else}Loading document…{/if}
    </div>
  {:else if err}
    <div class="ink-status ink-error" role="alert">
      {#if error}
        {@render error({ error: err })}
      {:else}
        <p class="ink-error-title">This document could not be opened.</p>
        <!-- The message comes from the PDF engine and is not written for readers: it stays
             off the page, on the code's tooltip. -->
        <p><code class="ink-error-code" title={err.message}>{err.code}</code></p>
      {/if}
    </div>
  {:else if viewState === 'idle'}
    <div class="ink-status ink-empty">{@render empty?.()}</div>
  {/if}
  <!-- The scroll element takes focus so the keyboard can scroll, zoom and page through it. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    bind:this={scroll}
    class="ink-scroll"
    data-ink-scroll=""
    tabindex="0"
    role="document"
    aria-label="Document"
  ></div>
  {#each pages as p (`${p.build}:${p.page}:${custom}`)}
    <InkPage
      page={p.page}
      host={p.host}
      transform={p.transform}
      customAnnotations={custom}
      {annotation}
      {pageError}
    />
  {/each}
</div>
