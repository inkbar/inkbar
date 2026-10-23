<script lang="ts">
  /*
   * A form script's `app.alert`: the message and OK, shown without blocking (no overlay, not
   * modal), so the form stays usable around it. InkViewport mounts it; hosts compose nothing.
   * OK, or Escape while focus is in the alert, closes it, and focus goes back where it was. A
   * press outside leaves it open, and Escape anywhere else stays with the viewer. A new message
   * replaces the one shown.
   *
   * The markup is core's `createFormAlert`, portalled to `<body>`. It is not a Bits UI dialog:
   * Bits UI's escape layer takes every Escape on the page while it is open (it prevents the
   * key's default), which would end the viewer's own use of the key.
   */
  import { FORM_LABELS } from '@inkbar/core/dom'
  import { Portal } from 'bits-ui'
  import { untrack } from 'svelte'

  let {
    message,
    shown,
    fallback,
    onClose,
  }: {
    /** The message to show (text, not markup); `null` while none is. */
    message: string | null
    /** Counts the times a message was shown, so the same text shown again takes focus again. */
    shown: number
    /** Where focus goes when nothing it can return to is left. */
    fallback: () => HTMLElement | null
    onClose: () => void
  } = $props()

  const uid = $props.id()
  let panel = $state<HTMLElement | null>(null)
  let ok = $state<HTMLButtonElement | null>(null)
  /** Where focus was when the alert opened. */
  let returnTo: HTMLElement | null = null
  let wasOpen = false
  const open = $derived(message !== null)

  // After the alert renders, before anything else moves focus: where focus was is read first.
  $effect(() => {
    const showing = open
    void shown
    const button = ok
    if (!showing) {
      wasOpen = false
      return
    }
    if (!button) return
    untrack(() => {
      if (!wasOpen) {
        wasOpen = true
        const active = document.activeElement
        returnTo =
          active instanceof HTMLElement && active !== document.body ? active : null
      }
      button.focus({ preventScroll: true })
    })
  })

  function close(): void {
    // Focus that moved elsewhere while the alert showed stays there.
    const hadFocus = !!panel?.contains(document.activeElement)
    const back = returnTo?.isConnected === true ? returnTo : fallback()
    onClose()
    if (hadFocus) back?.focus({ preventScroll: true })
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    e.preventDefault()
    e.stopPropagation()
    close()
  }
</script>

{#if message !== null}
  <Portal>
    <div
      bind:this={panel}
      role="alertdialog"
      aria-labelledby="{uid}-title"
      aria-describedby="{uid}-message"
      class="ink-dialog ink-form-alert"
      data-ink-form-alert=""
      data-state="open"
      tabindex="-1"
      {onkeydown}
    >
      <h2 id="{uid}-title" class="ink-dialog-title">{FORM_LABELS.alert}</h2>
      <p id="{uid}-message" class="ink-form-alert-message" data-ink-form-alert-message="">
        {message}
      </p>
      <div class="ink-dialog-actions">
        <button
          bind:this={ok}
          type="button"
          class="ink-button"
          data-variant="primary"
          data-ink-form-alert-ok=""
          onclick={close}
        >
          {FORM_LABELS.ok}
        </button>
      </div>
    </div>
  </Portal>
{/if}
