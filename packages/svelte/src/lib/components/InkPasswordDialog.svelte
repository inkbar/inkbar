<script module lang="ts">
  /**
   * "Password required": a modal that asks for the password of a locked file. InkViewport
   * mounts it and drives `open`, `incorrect` and `pending` from the password prompt; place your
   * own to build another flow. It holds no password beyond the field: Open hands the value to
   * `onSubmit`, and the field is cleared when the dialog closes and after each wrong try.
   * Escape, Cancel or a press outside closes it.
   */
  export interface InkPasswordDialogProps {
    open?: boolean
    onOpenChange?: ((open: boolean) => void) | undefined
    /** The last try was wrong: shows the message. */
    incorrect: boolean
    /** A try is loading: Open is disabled until it ends. */
    pending: boolean
    /** The typed password, for one load. */
    onSubmit: (password: string) => void
    /** Where focus goes on close; by default, back to what had it before. */
    onCloseAutoFocus?: ((event: Event) => void) | undefined
    class?: string | undefined
  }
</script>

<script lang="ts">
  import { Dialog } from 'bits-ui'
  import { tick, untrack } from 'svelte'

  import { useMessages } from '../messages.js'

  import { lockBody } from './body-lock.js'

  let {
    open = $bindable(false),
    onOpenChange,
    incorrect,
    pending,
    onSubmit,
    onCloseAutoFocus,
    class: className,
  }: InkPasswordDialogProps = $props()

  const uid = $props.id()
  const inputId = `${uid}-input`
  const errorId = `${uid}-error`

  let input = $state<HTMLInputElement | null>(null)
  let value = $state('')
  /** Counts the tries that came back wrong, to key the alert so each one is announced. */
  let attempt = $state(0)
  const disabled = $derived(pending || value === '')

  function setOpen(next: boolean): void {
    open = next
    onOpenChange?.(next)
  }

  function submit(e: SubmitEvent): void {
    e.preventDefault()
    if (!disabled) onSubmit(value)
  }

  // A try that ends wrong: a new alert, an empty field, focus back in it. `incorrect` may
  // arrive after `pending` ends, so a finished try waits for it.
  let wasPending = false
  let finished = false
  $effect(() => {
    // Closed (a success closes it as the try ends): there is no verdict left to show.
    if (!open) {
      wasPending = false
      finished = false
      return
    }
    if (pending) {
      wasPending = true
      finished = false
      return
    }
    if (wasPending) {
      wasPending = false
      finished = true
    }
    if (finished && incorrect) {
      finished = false
      untrack(() => {
        attempt += 1
        value = ''
      })
      void tick().then(() => input?.focus({ preventScroll: true }))
    }
  })
  // Nothing typed outlives the dialog.
  $effect(() => {
    if (!open) value = ''
  })
  // Reopened or updated marked incorrect (the host's own wrong password) starts empty.
  $effect(() => {
    if (incorrect && !untrack(() => pending)) value = ''
  })
  const m = useMessages()
</script>

<Dialog.Root bind:open={() => open, setOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="ink-dialog-overlay" data-ink-dialog-overlay="" />
    <Dialog.Content
      class={['ink-dialog ink-password-dialog', className]}
      data-ink-password-dialog=""
      aria-modal="true"
      preventScroll={false}
      {@attach lockBody}
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        input?.focus({ preventScroll: true })
      }}
      onCloseAutoFocus={(e) => onCloseAutoFocus?.(e)}
    >
      <Dialog.Title class="ink-dialog-title">{m.current.password.dialog}</Dialog.Title>
      <Dialog.Description class="ink-dialog-description">
        {m.current.password.description}
      </Dialog.Description>
      <form class="ink-password-form" data-ink-password-form="" onsubmit={submit}>
        <label class="ink-password-label" for={inputId}>{m.current.password.field}</label>
        <input
          id={inputId}
          bind:this={input}
          bind:value
          class="ink-password-input"
          type="password"
          autocomplete="off"
          aria-invalid={incorrect ? 'true' : 'false'}
          aria-describedby={incorrect ? errorId : undefined}
        />
        {#if incorrect}
          {#key attempt}
            <p id={errorId} class="ink-password-error" role="alert">
              {m.current.password.incorrect}
            </p>
          {/key}
        {/if}
        <div class="ink-dialog-actions">
          <button type="button" class="ink-button" onclick={() => setOpen(false)}>
            {m.current.password.cancel}
          </button>
          <button type="submit" class="ink-button" data-variant="primary" {disabled}>
            {m.current.password.submit}
          </button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
