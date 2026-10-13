<script module lang="ts">
  import type { InkError } from '@inkbar/core'
  import type { AnnotationSlotProps, PageTransform } from '@inkbar/core/dom'
  import type { Snippet } from 'svelte'

  export interface InkPageProps {
    page: number
    host: HTMLElement
    transform: PageTransform
    /** Fixed for the life of the mount: InkViewport remounts the page when it changes. */
    customAnnotations?: boolean
    annotation?: Snippet<[AnnotationSlotProps]> | undefined
    pageError?: Snippet<[{ error: InkError; page: number }]> | undefined
  }
</script>

<script lang="ts">
  /*
   * One mounted page: canvas, text layer and annotation overlay from core's `createPageMount`,
   * in the host element the viewport created. Renders nothing visible in place; the portal
   * attachment moves the page error into the host and each custom annotation's content into its
   * overlay element.
   *
   * The overlay creates and removes those elements as the annotation list changes, outside
   * Svelte. So the portal targets come from a list read after every overlay render: this
   * component subscribes to the store after the overlay does, and core notifies subscribers in
   * order, so the elements already exist when the list arrives here.
   *
   * A page whose canvas or text layer fails gets `data-state="error"` on its host and the page
   * error portalled into it; the other pages carry on. It clears once every layer that failed
   * has since succeeded (a zoom change re-renders), or on the next mount of the page.
   */
  import { InkError as InkErrorClass, isInkError } from '@inkbar/core'
  import { createPageMount } from '@inkbar/core/dom'
  import { untrack } from 'svelte'

  import { useInkContext } from '../context.js'

  import InkAnnotation from './InkAnnotation.svelte'
  import { portal } from './portal.js'

  import type { Annotation } from '@inkbar/core'
  import type { PageLayer, PageMount } from '@inkbar/core/dom'

  let {
    page,
    host,
    transform,
    customAnnotations = false,
    annotation,
    pageError,
  }: InkPageProps = $props()

  interface Target {
    annotation: Annotation
    el: HTMLElement
  }

  function sameTargets(a: readonly Target[], b: readonly Target[]): boolean {
    return (
      a.length === b.length &&
      a.every((t, i) => t.annotation === b[i]!.annotation && t.el === b[i]!.el)
    )
  }

  const ctx = useInkContext('InkPage')
  let mount: PageMount | null = null
  let applied: PageTransform | null = null
  let targets = $state.raw<Target[]>([])
  let failure = $state.raw<InkError | null>(null)

  // The mount lives as long as the host: the viewport hands a page a new host on every rebuild.
  // The effect reads the host through a derived, which notifies only when the element changes:
  // the viewport replaces this page's whole entry on every transform update, and that
  // invalidates the `host` prop without changing it. The initial transform is read untracked;
  // later ones go through the effect below.
  const mountHost = $derived(host)
  const mountCustom = $derived(customAnnotations)
  $effect(() => {
    const h = mountHost
    const custom = mountCustom
    const doc = untrack(() => ctx.document)
    if (!doc) return
    /** Layers that have failed and not yet recovered; the error clears when this empties. */
    // Bookkeeping for the two callbacks below; nothing reactive reads it.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const failedLayers = new Set<PageLayer>()
    let error: InkError | null = null
    const onError = (cause: unknown, layer: PageLayer): void => {
      failedLayers.add(layer)
      // The first failure wins: a canvas and a text layer failing together report one error.
      if (error) return
      error = isInkError(cause)
        ? cause
        : new InkErrorClass(
            'InvalidPdf',
            cause instanceof Error ? cause.message : String(cause),
            { page: untrack(() => page) },
            cause
          )
      h.setAttribute('data-state', 'error')
      failure = error
    }
    const onRendered = (layer: PageLayer): void => {
      failedLayers.delete(layer)
      if (!error || failedLayers.size > 0) return
      error = null
      h.removeAttribute('data-state')
      failure = null
    }
    const m = createPageMount({
      document: doc,
      page: untrack(() => page),
      host: h,
      transform: untrack(() => transform),
      store: doc.annotations,
      onActivate: (id) => ctx.setActivated(id),
      isCustom: () => custom,
      onError,
      onRendered,
    })
    mount = m
    applied = untrack(() => transform)
    let stopList: (() => void) | undefined
    if (custom) {
      const read = (): void => {
        const next = doc.annotations.byPage(untrack(() => page)).flatMap((a) => {
          const el = m.overlay.elementFor(a.id)
          return el ? [{ annotation: a, el }] : []
        })
        // A change elsewhere in the document leaves this page's targets as they were. The
        // first read runs inside the effect, which must not come to depend on its own list.
        if (
          !sameTargets(
            untrack(() => targets),
            next
          )
        )
          targets = next
      }
      stopList = doc.annotations.list.subscribe(read)
      read()
    }
    return () => {
      stopList?.()
      targets = []
      m.destroy()
      mount = null
      applied = null
      if (error) h.removeAttribute('data-state')
      failure = null
    }
  })

  $effect(() => {
    const t = transform
    const m = mount
    if (m && applied !== t) {
      applied = t
      m.update(t)
    }
  })
</script>

{#if failure}
  <div hidden {@attach portal(host)}>
    <div class="ink-page-error" data-ink-page-error="" role="alert">
      {#if pageError}
        {@render pageError({ error: failure, page })}
      {:else}
        <p>Page {page + 1} could not be shown.</p>
        <code class="ink-error-code">{failure.code}</code>
      {/if}
    </div>
  </div>
{/if}
{#if annotation}
  {#each targets as t (t.annotation.id)}
    <div hidden {@attach portal(t.el)}>
      <InkAnnotation annotation={t.annotation} element={t.el} children={annotation} />
    </div>
  {/each}
{/if}
