<script module lang="ts">
  import type { Annotation } from '@inkbar/core'
  import type { AnnotationSlotProps } from '@inkbar/core/dom'
  import type { Snippet } from 'svelte'

  export interface InkAnnotationProps {
    annotation: Annotation
    /** The overlay element; its `data-state` (which includes hover) drives `state`. */
    element?: HTMLElement | undefined
    children: Snippet<[AnnotationSlotProps]>
  }
</script>

<script lang="ts">
  /*
   * Slot props for one annotation. It renders only its children: the overlay already draws the
   * default visual for every annotation that is not custom, so this never draws a second one.
   * InkPage portals it into the annotation's overlay element.
   */
  import { useInkContext } from '../context.js'

  import type { AnnotationState } from '@inkbar/core/dom'

  let { annotation, element, children }: InkAnnotationProps = $props()

  const ctx = useInkContext('InkAnnotation')

  function readState(el: HTMLElement): AnnotationState | null {
    const s = el.dataset.state
    return s === 'idle' || s === 'hover' || s === 'selected' ? s : null
  }

  let observed = $state.raw<AnnotationState | null>(null)
  const observedEl = $derived(element)
  $effect(() => {
    const el = observedEl
    if (!el) {
      observed = null
      return
    }
    observed = readState(el)
    const observer = new MutationObserver(() => {
      observed = readState(el)
    })
    observer.observe(el, { attributes: true, attributeFilter: ['data-state'] })
    return () => observer.disconnect()
  })

  const locked = $derived(annotation.locked === true)
  const selected = $derived(ctx.selection.includes(annotation.id))
  const store = () => ctx.document?.annotations
  const slotProps = $derived<AnnotationSlotProps>({
    annotation,
    state: observed ?? (selected ? 'selected' : 'idle'),
    locked,
    select: () => store()?.select([annotation.id]),
    remove: () => void store()?.remove(annotation.id),
  })
</script>

{@render children(slotProps)}
