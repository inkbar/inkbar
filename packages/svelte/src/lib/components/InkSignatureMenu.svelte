<script module lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  /**
   * A split button for the signature tool. The main part activates the tool with the chosen
   * signature, or opens the menu when none is chosen; the chevron opens the saved signatures
   * as previews, each with a remove button, and "Create signature", which opens
   * `InkSignatureDialog`. Choosing a signature switches to the tool with it.
   */
  export interface InkSignatureMenuProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'children'
  > {
    /** Replaces the main button's icon. */
    children?: Snippet | undefined
    /** The fonts the dialog's Type tab offers. Default: InkRoot's `signatureFonts`. */
    fonts?: readonly string[] | undefined
  }
</script>

<script lang="ts">
  import { handleMenuKeys, SIGNATURE_LABELS, signatureMenuModel } from '@inkbar/core/dom'
  import { ChevronDown, Signature } from '@inkbar/icons'
  import { Popover, Toolbar } from 'bits-ui'
  import { untrack } from 'svelte'

  import { useInkContext } from '../context.js'
  import { useTool } from '../hooks/useTool.svelte.js'
  import { useToolOptions } from '../hooks/useToolOptions.svelte.js'
  import { useReadable } from '../use-readable.svelte.js'

  import InkIcon from './InkIcon.svelte'
  import InkSignatureDialog from './InkSignatureDialog.svelte'
  import { createMenuOpenFocus } from './menu-open-focus.js'
  import SignatureMenuPanel from './SignatureMenuPanel.svelte'

  import type { SignatureOptions, SignatureTemplate } from '@inkbar/core'

  let { class: className, children, fonts, ...rest }: InkSignatureMenuProps = $props()

  const NO_TEMPLATES: readonly SignatureTemplate[] = []

  const ctx = useInkContext('InkSignatureMenu')
  const current = useTool()
  const signature = useToolOptions<SignatureOptions>('signature')
  const templates = useReadable(() => ctx.signatures.templates, NO_TEMPLATES)
  // An old removal error is not news when the menu opens again.
  $effect(() => {
    if (open) untrack(() => ctx.signatures.clearRemoveError())
  })
  const model = $derived(signatureMenuModel(templates.current, signature.options))
  const active = $derived(current.tool === 'signature')
  let open = $state(false)
  /** The split button: the panel lines up under it rather than the chevron. */
  let group = $state<HTMLElement | null>(null)
  let creating = $state(false)
  let menu = $state<HTMLElement | null>(null)
  let main = $state<HTMLElement | null>(null)

  /** ArrowDown opens on the first item; a click opens on the checked one. */
  const openFocus = createMenuOpenFocus()
  $effect(() => {
    if (!open) openFocus.reset()
  })
  /** Set while the menu closes for the dialog, which takes focus instead of the trigger. */
  let toDialog = false

  function onTriggerKeydown(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' || e.defaultPrevented || open) return
    e.preventDefault()
    openFocus.first()
    open = true
  }

  function onMain(): void {
    if (model.selected) current.setTool('signature')
    else open = true
  }

  function choose(id: string): void {
    signature.setOptions({ templateId: id })
    current.setTool('signature')
    open = false
  }

  function create(): void {
    toDialog = true
    open = false
    creating = true
  }
</script>

<div
  bind:this={group}
  role="group"
  aria-label={SIGNATURE_LABELS.sign}
  class={['ink-split-button ink-signature-menu', className]}
  data-ink-signature-menu=""
  {...rest}
>
  <Toolbar.Button
    bind:ref={main}
    class="ink-tool-button ink-signature-button"
    data-ink-tool-button=""
    data-ink-signature-button=""
    data-tool="signature"
    data-state={active ? 'on' : 'off'}
    aria-pressed={active}
    aria-label={SIGNATURE_LABELS.sign}
    title={SIGNATURE_LABELS.sign}
    onclick={onMain}
  >
    {#if children}{@render children()}{:else}<InkIcon icon={Signature} />{/if}
  </Toolbar.Button>
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Toolbar.Button
          {...props}
          class="ink-menu-trigger ink-signature-menu-trigger"
          data-ink-signature-menu-trigger=""
          data-state={open ? 'open' : 'closed'}
          aria-label={SIGNATURE_LABELS.trigger}
          title={SIGNATURE_LABELS.trigger}
          aria-haspopup="menu"
          onkeydown={onTriggerKeydown}
        >
          <InkIcon icon={ChevronDown} />
        </Toolbar.Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        bind:ref={menu}
        role="menu"
        aria-label={SIGNATURE_LABELS.menu}
        class="ink-select-content ink-menu-content"
        data-ink-select-content=""
        data-ink-menu="signature"
        customAnchor={group}
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        onOpenAutoFocus={(e) => openFocus.onOpenAutoFocus(e, menu)}
        onfocusin={openFocus.onfocusin}
        onCloseAutoFocus={(e) => {
          if (toDialog) e.preventDefault()
          toDialog = false
        }}
        onkeydown={(e) => menu && handleMenuKeys(e, menu)}
      >
        <SignatureMenuPanel
          items={model.items}
          menu={() => menu}
          onChoose={(t) => choose(t.id)}
          onCreate={create}
        />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
  <InkSignatureDialog
    bind:open={creating}
    {fonts}
    onCloseAutoFocus={(e) => {
      e.preventDefault()
      main?.focus({ preventScroll: true })
    }}
  />
</div>
