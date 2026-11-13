<script module lang="ts">
  import type { SignatureTemplate } from '@inkbar/core'

  /**
   * "Create signature": a modal with Draw, Type and Image tabs. Draw is a pad with the draw
   * tool's renderer; Type sets a name in one of the host's handwriting fonts; Image takes a PNG
   * or JPEG scan. Save stores the template through InkRoot's signature store and, unless
   * `select` is false or no `signature` tool is registered, selects it for that tool. Escape, Cancel or a press outside
   * closes it.
   */
  export interface InkSignatureDialogProps {
    open?: boolean
    onOpenChange?: ((open: boolean) => void) | undefined
    /** The fonts the Type tab offers. Default: InkRoot's `signatureFonts`. */
    fonts?: readonly string[] | undefined
    /**
     * Whether saving selects the new signature for the `signature` tool, when one is
     * registered. Default true. False leaves the tool alone, for a dialog that signs a field
     * with it through `onSave`.
     */
    select?: boolean | undefined
    /** Called with the new template once it is saved (and selected, with `select`). */
    onSave?: ((template: SignatureTemplate) => void) | undefined
    /** Where focus goes on close; by default, back to what had it before. */
    onCloseAutoFocus?: ((event: Event) => void) | undefined
    class?: string | undefined
  }
</script>

<script lang="ts">
  import { Dialog } from 'bits-ui'

  import { useMessages } from '../messages.js'

  import { lockBody } from './body-lock.js'
  import SignatureForm from './SignatureForm.svelte'

  let {
    open = $bindable(false),
    onOpenChange,
    fonts,
    select = true,
    onSave,
    onCloseAutoFocus,
    class: className,
  }: InkSignatureDialogProps = $props()

  let content = $state<HTMLElement | null>(null)

  function setOpen(next: boolean): void {
    open = next
    onOpenChange?.(next)
  }
  const m = useMessages()
</script>

<Dialog.Root bind:open={() => open, setOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="ink-dialog-overlay" data-ink-dialog-overlay="" />
    <Dialog.Content
      bind:ref={content}
      class={['ink-dialog ink-signature-dialog', className]}
      data-ink-signature-dialog=""
      aria-modal="true"
      preventScroll={false}
      {@attach lockBody}
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        content
          ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
          ?.focus({ preventScroll: true })
      }}
      onCloseAutoFocus={(e) => onCloseAutoFocus?.(e)}
    >
      <Dialog.Title class="ink-dialog-title">{m.current.signature.dialog}</Dialog.Title>
      <SignatureForm
        {fonts}
        {select}
        onSaved={(t) => onSave?.(t)}
        onClose={() => setOpen(false)}
      />
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
