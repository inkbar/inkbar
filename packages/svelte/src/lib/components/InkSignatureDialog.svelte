<script module lang="ts">
  import type { SignatureTemplate } from '@inkbar/core'

  /**
   * "Create signature": a modal with Draw, Type and Image tabs. Draw is a pad with the draw
   * tool's renderer; Type sets a name in one of the host's handwriting fonts; Image takes a PNG
   * or JPEG scan. Save stores the template through InkRoot's signature store and selects it
   * for the `signature` tool. Escape, Cancel or a press outside closes it.
   */
  export interface InkSignatureDialogProps {
    open?: boolean
    onOpenChange?: ((open: boolean) => void) | undefined
    /** The fonts the Type tab offers. Default: InkRoot's `signatureFonts`. */
    fonts?: readonly string[] | undefined
    /** Called with the new template once it is saved and selected. */
    onSave?: ((template: SignatureTemplate) => void) | undefined
    /** Where focus goes on close; by default, back to what had it before. */
    onCloseAutoFocus?: ((event: Event) => void) | undefined
    class?: string | undefined
  }
</script>

<script lang="ts">
  import { SIGNATURE_LABELS } from '@inkbar/core/dom'
  import { Dialog } from 'bits-ui'

  import SignatureForm from './SignatureForm.svelte'

  let {
    open = $bindable(false),
    onOpenChange,
    fonts,
    onSave,
    onCloseAutoFocus,
    class: className,
  }: InkSignatureDialogProps = $props()

  let content = $state<HTMLElement | null>(null)

  function setOpen(next: boolean): void {
    open = next
    onOpenChange?.(next)
  }
</script>

<Dialog.Root bind:open={() => open, setOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="ink-dialog-overlay" data-ink-dialog-overlay="" />
    <Dialog.Content
      bind:ref={content}
      class={['ink-dialog ink-signature-dialog', className]}
      data-ink-signature-dialog=""
      aria-modal="true"
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        content
          ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
          ?.focus({ preventScroll: true })
      }}
      onCloseAutoFocus={(e) => onCloseAutoFocus?.(e)}
    >
      <Dialog.Title class="ink-dialog-title">{SIGNATURE_LABELS.dialog}</Dialog.Title>
      <SignatureForm
        {fonts}
        onSaved={(t) => onSave?.(t)}
        onClose={() => setOpen(false)}
      />
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
