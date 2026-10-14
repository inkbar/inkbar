<script module lang="ts">
  import type { InkError } from '@inkbar/core'
  import type { AnnotationSlotProps, PageMount } from '@inkbar/core/dom'
  import type { Snippet } from 'svelte'

  export interface InkPageProps {
    page: number
    host: HTMLElement
    /** The engine's page mount in `host`. */
    mount: PageMount
    /** The engine's error for this page, `null` while it renders. */
    error: InkError | null
    /** Fixed for the life of the mount: the engine rebuilds when it changes. */
    customAnnotations?: boolean
    annotation?: Snippet<[AnnotationSlotProps]> | undefined
    pageError?: Snippet<[{ error: InkError; page: number }]> | undefined
  }
</script>

<script lang="ts">
  /*
   * One page the viewer engine mounted. Renders nothing visible in place; the portal attachment
   * moves the page error into the host and each custom annotation's content into its overlay
   * element.
   *
   * The overlay creates and removes those elements as the annotation list changes, outside
   * Svelte. So the portal targets come from a list read after every overlay render: this
   * component subscribes to the store after the overlay does (the engine created the mount
   * first), and core notifies subscribers in order, so the elements already exist when the list
   * arrives here.
   *
   * The engine tracks page errors and sets `data-state="error"` on the host; this component
   * portals the page error into it while `error` is set.
   */
  import { untrack } from 'svelte'

  import { useInkContext } from '../context.js'

  import InkAnnotation from './InkAnnotation.svelte'
  import { portal } from './portal.js'

  import type { Annotation } from '@inkbar/core'

  let {
    page,
    host,
    mount,
    error,
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
  let targets = $state.raw<Target[]>([])

  // Targets are read from the current mount, and read again when InkViewport hands this page a
  // new one (the page left and came back within one tick, under the same key). The props are
  // read through deriveds, which notify only when the value changes: InkViewport replaces this
  // page's whole entry when its error changes, and that invalidates every prop without
  // changing the mount.
  const listPage = $derived(page)
  const listMount = $derived(mount)
  const listCustom = $derived(customAnnotations)
  $effect(() => {
    const p = listPage
    const m = listMount
    const custom = listCustom
    const doc = untrack(() => ctx.document)
    if (!doc || !custom) {
      if (untrack(() => targets).length > 0) targets = []
      return
    }
    const read = (): void => {
      const next = doc.annotations.byPage(p).flatMap((a) => {
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
    const stop = doc.annotations.list.subscribe(read)
    read()
    return stop
  })
</script>

{#if error}
  <div hidden {@attach portal(host)}>
    <div class="ink-page-error" data-ink-page-error="" role="alert">
      {#if pageError}
        {@render pageError({ error, page })}
      {:else}
        <p>Page {page + 1} could not be shown.</p>
        <code class="ink-error-code">{error.code}</code>
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
