<script module lang="ts">
  import type { SuggestionCardSlotProps } from '@inkbar/core/dom'
  import type { Snippet } from 'svelte'

  export interface InkSuggestionCardProps {
    children?: Snippet<[SuggestionCardSlotProps]> | undefined
  }
</script>

<script lang="ts">
  /*
   * Review card for a suggested redaction: opens when the activated annotation, or the only
   * selected one, is a redaction with `origin: 'suggested'`. Locked suggestions cannot be
   * dismissed, so they get no Dismiss button. A press on the overlay selects and activates, so a
   * click opens it whatever the tool. Closing clears `activated` and the selection.
   */
  import { confidenceBucket } from '@inkbar/core'
  import { Popover } from 'bits-ui'

  import { useInkContext } from '../context.js'
  import { useAnnotations } from '../hooks/useAnnotations.svelte.js'

  import { useAnnotationElement } from './annotation-element.svelte.js'
  import { keepOpenOnAnnotation, useFocusReturn } from './popover-focus.js'

  import type { ConfidenceBucket, RedactAnnotation } from '@inkbar/core'

  let { children }: InkSuggestionCardProps = $props()

  const ctx = useInkContext('InkSuggestionCard')
  const store = useAnnotations()

  function suggestion(id: string | null | undefined): RedactAnnotation | null {
    const a = id ? store.annotations.find((x) => x.id === id) : undefined
    return a?.type === 'redact' && a.origin === 'suggested' ? a : null
  }
  // The activated annotation when it is a suggestion; otherwise the only selected one (a
  // marquee selects without activating).
  const target = $derived(
    suggestion(ctx.activated) ??
      (store.selection.length === 1 ? suggestion(store.selection[0]) : null)
  )
  const anchorRef = useAnnotationElement(
    () => ctx.rootEl,
    () => target?.id ?? null
  )
  const anchor = $derived(anchorRef.current)
  const focusReturn = useFocusReturn(ctx)
  const open = $derived(target !== null && anchor !== null)
  const bucket = $derived<ConfidenceBucket | undefined>(
    target?.suggestion ? confidenceBucket(target.suggestion.confidence) : undefined
  )

  function close(): void {
    ctx.setActivated(null)
    store.select([])
  }
  function accept(): void {
    if (target) store.accept(target.id)
    close()
  }
  /** Locked annotations cannot be removed: dismissing one does nothing and keeps the card. */
  function dismiss(): void {
    if (!target || target.locked) return
    focusReturn.beforeRemove(anchor, '[data-origin="suggested"]')
    store.dismiss(target.id)
    close()
  }
  function onOpenChange(next: boolean): void {
    if (!next) close()
  }
</script>

<Popover.Root bind:open={() => open, onOpenChange}>
  <Popover.Portal>
    {#if target && anchor}
      <Popover.Content
        class="ink-suggestion-card"
        data-ink-suggestion-card=""
        role="dialog"
        side="bottom"
        sideOffset={6}
        collisionPadding={8}
        aria-label="Suggested redaction"
        customAnchor={anchor}
        onInteractOutside={keepOpenOnAnnotation}
        onCloseAutoFocus={(e) => focusReturn.onCloseAutoFocus(e, anchor)}
      >
        {#if children}
          {@render children({
            annotation: target,
            suggestion: target.suggestion,
            bucket,
            accept,
            dismiss,
            close,
          })}
        {:else}
          <p class="ink-suggestion-reason">
            <strong>{target.suggestion?.reason ?? 'Suggested redaction'}</strong>
            {#if bucket}
              <span class="ink-suggestion-confidence" data-confidence={bucket}>
                {bucket} confidence
              </span>
            {/if}
          </p>
          {#if target.suggestion?.explanation}
            <p class="ink-suggestion-explanation">{target.suggestion.explanation}</p>
          {/if}
          <div class="ink-suggestion-actions">
            <button type="button" onclick={accept}>Accept</button>
            {#if !target.locked}
              <button type="button" onclick={dismiss}>Dismiss</button>
            {/if}
          </div>
        {/if}
      </Popover.Content>
    {/if}
  </Popover.Portal>
</Popover.Root>
