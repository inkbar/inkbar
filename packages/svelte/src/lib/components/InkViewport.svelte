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
   * The scroll element is handed to core's `mountViewer`, which builds the viewport, the page
   * layers, the tool controller and the keyboard shortcuts in it; Svelte never renders children
   * into it. The engine reports each page host it mounts, and InkPage components rendered here
   * (they render nothing visible in place) portal the page-error and annotation snippets into
   * them.
   *
   * Two-way zoom and page: the viewport's own changes are reported through the context, and
   * the host's props are applied only when they differ from the viewport's state, so the echo
   * of a reported value does nothing.
   *
   * Form fields render in the engine's form layer. A signature field's "Sign" opens
   * `InkSignFieldPopover`, and a form script's alert shows in `InkFormAlert`; both are mounted
   * here, so hosts compose nothing for them.
   */
  import { mountViewer } from '@inkbar/core/dom'
  import { untrack } from 'svelte'

  import { useInkContext } from '../context.js'

  import InkFormAlert from './InkFormAlert.svelte'
  import InkPage from './InkPage.svelte'
  import InkSignFieldPopover from './InkSignFieldPopover.svelte'

  import type { InkDocument, InkStatus } from '@inkbar/core'
  import type {
    PageMount,
    SignFieldRequest,
    ToolId,
    ViewerEngine,
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
    /** The engine build the host belongs to; part of the InkPage key. */
    build: number
    page: number
    host: HTMLElement
    mount: PageMount
    error: InkError | null
    /** Whether the build that mounted the page renders the annotation snippet. */
    custom: boolean
  }

  const ctx = useInkContext('InkViewport')
  let scroll = $state<HTMLDivElement | null>(null)
  /** Page hosts, mounts and errors the engine reported; InkPage renders portals for them. */
  let pages = $state.raw<MountedPage[]>([])
  /** The signature field whose menu is open. */
  let signRequest = $state.raw<SignFieldRequest | null>(null)
  /** The form script's message on show, and how many have been shown. */
  let alert = $state.raw<{ message: string; shown: number } | null>(null)

  let engine: ViewerEngine | null = null
  /**
   * Numbered before each build starts, so the pages a build mounts carry its own number. A
   * rebuild gives each page a new host and mount, so pages from an earlier build must remount,
   * not be reused.
   */
  let build = 0
  /** The construction options the engine was last built with, so a rebuild runs only on a change. */
  let builtWith: { gap: number; buffer: number; custom: boolean } | null = null
  let stops: (() => void)[] = []
  /** The zoom and page last reported to the host. */
  let lastReportedZoom: ZoomValue | undefined
  let lastReportedPage: number | undefined

  // The engine's page callbacks fire synchronously inside the effects below (and on scroll).
  // They read and write `pages`, so every call into the engine from an effect runs untracked:
  // tracked, the effect would depend on the list it changes and run again.
  function teardown(): void {
    for (const stop of stops) stop()
    stops = []
    // Unmounts every page, which empties `pages` through `onPageUnmount`.
    engine?.destroy()
    engine = null
    builtWith = null
    ctx.setViewport(null, null)
    if (pages.length > 0) pages = []
    // Their fields and the document they came from are gone.
    signRequest = null
    alert = null
  }

  function setup(
    doc: InkDocument | null,
    state: InkStatus['state'],
    el: HTMLDivElement | null
  ): void {
    lastReportedZoom = undefined
    lastReportedPage = undefined
    if (!doc || !el || state !== 'ready') return
    let first = true
    build += 1
    const custom = !!annotation
    builtWith = { gap, buffer, custom }
    engine = mountViewer({
      container: el,
      document: doc,
      zoom: ctx.zoomModel ?? 'fit-width',
      ...(ctx.pageModel === undefined ? {} : { page: ctx.pageModel }),
      mode,
      rotation,
      gap,
      buffer,
      tool: ctx.tool,
      ...(ctx.hostTools ? { tools: ctx.hostTools } : {}),
      // The engine adds the plugins' tools and layers, and decorates through the host, which
      // reads `decorateAnnotation` first.
      ...(ctx.pluginHost ? { plugins: ctx.pluginHost } : {}),
      // The highlights draw from the shared search.
      ...(ctx.search ? { search: ctx.search } : {}),
      // Read through, so the effect below can re-apply a new function without a rebuild.
      decorateAnnotation: (a) => ctx.decorateAnnotation?.(a),
      ...(ctx.toolStyle ? { toolStyle: ctx.toolStyle } : {}),
      toolHistory: { batch: (fn) => ctx.history.batch(fn) },
      toolOptions: ctx.toolOptions,
      fonts: [...ctx.fonts],
      // Read through, so a new `signatures` store reaches the tool as well as the menus.
      signatureLibrary: () => ctx.signatures,
      customAnnotations: custom,
      ...(ctx.formHighlight === undefined ? {} : { formHighlight: ctx.formHighlight }),
      // The field's own button again, while its menu is open, closes the menu.
      onSignField: (req) => {
        signRequest = signRequest?.widget === req.widget ? null : req
      },
      onFormAction: (a) => ctx.reportFormAction(a),
      onFormAlert: (message) => {
        alert = { message, shown: (alert?.shown ?? 0) + 1 }
      },
      onActivate: (id) => ctx.setActivated(id),
      onBuild: (vp, tc) => {
        ctx.setViewport(vp, tc)
        if (first) {
          // A new document starts from where the viewport opens (its zoom, on the first page:
          // `createViewport` always starts at page 0); only later changes are reported, the
          // restored page among them, since the engine has already scrolled to it.
          first = false
          lastReportedZoom = vp.zoom.get()
          lastReportedPage = 0
        }
        for (const stop of stops) stop()
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
        // A tool that switches itself (a one-shot tool once used) is reported as a pick.
        const followTool = (id: ToolId): void => {
          if (id !== ctx.tool) ctx.setTool(id)
        }
        stops = [
          vp.zoom.subscribe(reportZoom),
          vp.currentPage.subscribe(reportPage),
          tc.active.subscribe(followTool),
        ]
        // Whatever the build restored is reported once; nothing is when it matched.
        reportZoom(vp.zoom.get())
        reportPage(vp.currentPage.get())
      },
      onPageMount: (page, mount, host) => {
        // `build` and `builtWith` belong to the build in progress: both are set before it starts.
        const own = {
          build,
          page,
          host,
          mount,
          error: null,
          custom: builtWith?.custom ?? false,
        }
        pages = [...pages, own]
      },
      onPageUnmount: (page) => {
        pages = pages.filter((p) => p.page !== page)
      },
      onPageError: (page, err) => {
        pages = pages.map((p) => (p.page === page ? { ...p, error: err } : p))
      },
    })
  }

  // The plugins' `root`. Before the build below, so it is set when the engine mounts.
  $effect(() => {
    const el = scroll
    const { viewportEl } = ctx
    viewportEl.set(el)
    return () => {
      if (viewportEl.get() === el) viewportEl.set(null)
    }
  })

  // Build for a new document or status; tear down on the next change and on unmount. Only the
  // values read before `untrack` are dependencies, each through a derived, which notifies only
  // when the value changes: the status is a new object on every engine report.
  const buildDocument = $derived(ctx.document)
  const buildState = $derived(ctx.status.state)
  $effect(() => {
    const doc = buildDocument
    const state = buildState
    const el = scroll
    untrack(() => setup(doc, state, el))
    return () => untrack(teardown)
  })

  // Construction-only options rebuild the engine for the same document, keeping zoom and page.
  // The deriveds notify only on a real change: a host that spreads its props invalidates `gap`
  // and `buffer` without changing them. One effect for all three, so a gap and a snippet change
  // in the same tick rebuild once. It skips its first run (and any run after a build that
  // already used these values) by comparing with `builtWith`.
  //
  // A snippet toggle never puts a portal into an overlay built with the other setting. The
  // template updates before this effect runs, so for a moment the old build's pages see the new
  // `annotation` prop, but each InkPage reads targets only when the build that mounted it was
  // custom (`p.custom`), and shows them only while the snippet is given. Then this effect swaps
  // `pages` for the new build's pages. The rebuild keeps the scroll position.
  const buildGap = $derived(gap)
  const buildBuffer = $derived(buffer)
  const buildCustom = $derived(!!annotation)
  $effect(() => {
    const next = { gap: buildGap, buffer: buildBuffer, custom: buildCustom }
    untrack(() => {
      const built = builtWith
      if (!engine || !built) return
      if (
        built.gap === next.gap &&
        built.buffer === next.buffer &&
        built.custom === next.custom
      )
        return
      build += 1
      builtWith = next
      engine.rebuild({
        gap: next.gap,
        buffer: next.buffer,
        customAnnotations: next.custom,
      })
    })
  })

  // A new decorateAnnotation re-applies to the mounted annotation elements at once.
  const decorate = $derived(ctx.decorateAnnotation)
  $effect(() => {
    void decorate
    untrack(() => engine?.redecorate())
  })

  // The setters below run untracked: core relays out inside them and the engine's page
  // callbacks read and write `pages`. Tracked, each effect would depend on the list it changes
  // and run again, without end when the host holds a zoom the viewport clamps.
  $effect(() => {
    const z = ctx.zoomModel
    const vp = engine?.viewport
    if (vp && z !== undefined && z !== vp.zoom.get()) untrack(() => vp.setZoom(z))
  })
  $effect(() => {
    const p = ctx.pageModel
    const vp = engine?.viewport
    if (!vp || p === undefined || p === lastReportedPage) return
    if (p !== vp.currentPage.get()) untrack(() => vp.scrollToPage(p))
  })
  $effect(() => {
    const t = ctx.tool
    const tc = engine?.tools
    if (tc && tc.active.get() !== t) untrack(() => tc.set(t))
  })
  // The tint follows `formHighlight` in place, without a new document.
  $effect(() => {
    const on = ctx.formHighlight ?? true
    untrack(() => engine?.setFormHighlight(on))
  })
  // The build applied both; these only act on a later change, not on mount.
  $effect(() => {
    const m = mode
    const vp = engine?.viewport
    if (vp && vp.mode.get() !== m) untrack(() => vp.setMode(m))
  })
  $effect(() => {
    const r = rotation
    const vp = engine?.viewport
    if (vp && vp.rotation.get() !== r) untrack(() => vp.setRotation(r))
  })

  // Not `state`: next to the `$state` rune, Svelte reads that name as a store.
  const viewState = $derived(buildState)
  const err = $derived(ctx.status.state === 'error' ? ctx.status.error : null)
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
  {#each pages as p (`${p.build}:${p.page}`)}
    <InkPage
      page={p.page}
      host={p.host}
      mount={p.mount}
      error={p.error}
      customAnnotations={p.custom}
      {annotation}
      {pageError}
    />
  {/each}
  <!-- Keyed by document, so the menu and its dialog start afresh for each one. -->
  {#key buildDocument}
    <InkSignFieldPopover request={signRequest} onClose={() => (signRequest = null)} />
  {/key}
  <InkFormAlert
    message={alert?.message ?? null}
    shown={alert?.shown ?? 0}
    fallback={() => scroll}
    onClose={() => (alert = null)}
  />
</div>
