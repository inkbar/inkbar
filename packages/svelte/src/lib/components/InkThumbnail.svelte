<script module lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'

  export interface InkThumbnailProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'children'
  > {
    /** 0-based. */
    page: number
    /** Width in CSS pixels; the height follows the page. Default 120 unless `height` is given. */
    width?: number | undefined
    /** Height in CSS pixels; the width follows the page. */
    height?: number | undefined
    /** Draw the page's annotations. Default true. */
    annotations?: boolean | undefined
    /** Draw plugin marks. Default true. */
    marks?: boolean | undefined
    /** The accessible name. Default "Page N". */
    label?: string | undefined
  }
</script>

<script lang="ts">
  /*
   * One page as a static image, with its live annotations and plugin marks: core's thumbnail
   * painter on this element, which sizes it, names it ("Page N" unless `label` says otherwise)
   * and draws it once it nears the visible area. It is not focusable and does nothing on click:
   * wrap it in the control you need. Inside `InkRoot`; it renders empty on the server.
   */
  import { createThumbnailPainter, type ThumbnailPainter } from '@inkbar/core/dom'
  import { untrack } from 'svelte'

  import { useInkContext } from '../context.js'
  import { toReadable } from '../to-readable.svelte.js'

  let {
    page,
    width,
    height,
    annotations = true,
    marks = true,
    label,
    class: className,
    ...rest
  }: InkThumbnailProps = $props()

  const ctx = useInkContext('InkThumbnail')
  const deps = {
    document: toReadable(() => ctx.document),
    pluginHost: toReadable(() => ctx.pluginHost),
  }
  const options = () => ({ page, width, height, annotations, marks, label })

  let el = $state<HTMLDivElement | null>(null)
  let painter: ThumbnailPainter | null = null
  // Before the painter is made, so a new painter does not take its first options twice.
  $effect(() => {
    const next = options()
    untrack(() => painter?.update(next))
  })
  $effect(() => {
    const target = el
    if (!target) return
    const p = untrack(() => createThumbnailPainter(target, deps, options()))
    painter = p
    return () => {
      p.destroy()
      painter = null
    }
  })
</script>

<!-- The class is the painter's too: kept here, a re-render never drops it. -->
<div {...rest} bind:this={el} class={['ink-thumbnail', className]}></div>
