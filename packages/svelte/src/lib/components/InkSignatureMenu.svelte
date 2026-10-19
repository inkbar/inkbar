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
  import {
    focusInitialMenuItem,
    handleMenuKeys,
    menuItems,
    SIGNATURE_LABELS,
    signatureMenuModel,
    signaturePreview,
  } from '@inkbar/core/dom'
  import { ChevronDown, Plus, Signature, Trash2 } from '@inkbar/icons'
  import { Popover, Toolbar } from 'bits-ui'
  import { tick } from 'svelte'

  import { useInkContext } from '../context.js'
  import { useTool } from '../hooks/useTool.svelte.js'
  import { useToolOptions } from '../hooks/useToolOptions.svelte.js'
  import { useReadable } from '../use-readable.svelte.js'

  import InkIcon from './InkIcon.svelte'
  import InkSignatureDialog from './InkSignatureDialog.svelte'

  import type { SignatureOptions, SignatureTemplate } from '@inkbar/core'

  let { class: className, children, fonts, ...rest }: InkSignatureMenuProps = $props()

  const NO_TEMPLATES: readonly SignatureTemplate[] = []

  const ctx = useInkContext('InkSignatureMenu')
  const current = useTool()
  const signature = useToolOptions<SignatureOptions>('signature')
  const templates = useReadable(() => ctx.signatures.templates, NO_TEMPLATES)
  const model = $derived(signatureMenuModel(templates.current, signature.options))
  const active = $derived(current.tool === 'signature')
  let open = $state(false)
  let creating = $state(false)
  let menu = $state<HTMLElement | null>(null)
  let main = $state<HTMLElement | null>(null)

  /** ArrowDown opens on the first item; a click opens on the checked one. */
  let focusFirst = false
  // Bits runs the open-focus callback more than once, so the flag outlives it; reset on close.
  $effect(() => {
    if (!open) focusFirst = false
  })
  /** Set while the menu closes for the dialog, which takes focus instead of the trigger. */
  let toDialog = false

  function onTriggerKeydown(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' || e.defaultPrevented || open) return
    e.preventDefault()
    focusFirst = true
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

  /** Removes a template; focus moves to the signature now in its row, else "Create signature". */
  function remove(id: string, row: number): void {
    ctx.signatures.remove(id).then(
      async () => {
        await tick()
        if (!menu) return
        const rows = menu.querySelectorAll<HTMLElement>('.ink-signature-item')
        const next =
          rows[Math.min(row, rows.length - 1)] ??
          menu.querySelector<HTMLElement>('[data-ink-signature-create]')
        next?.focus({ preventScroll: true })
      },
      () => {
        // The host's store refused: the signature stays.
      }
    )
  }

  function create(): void {
    toDialog = true
    open = false
    creating = true
  }
</script>

<div
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
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          if (menu) {
            if (focusFirst) menuItems(menu)[0]?.focus({ preventScroll: true })
            else focusInitialMenuItem(menu)
          }
        }}
        onCloseAutoFocus={(e) => {
          if (toDialog) e.preventDefault()
          toDialog = false
        }}
        onkeydown={(e) => menu && handleMenuKeys(e, menu)}
      >
        {#if model.items.length > 0}
          <div
            role="group"
            aria-label={SIGNATURE_LABELS.saved}
            class="ink-signature-list"
            data-ink-menu-columns="2"
          >
            {#each model.items as item, row (item.id)}
              {@const preview =
                item.template.kind === 'ink' ? signaturePreview(item.template) : null}
              <button
                type="button"
                role="menuitemradio"
                aria-checked={item.checked}
                aria-label={item.label}
                tabindex={-1}
                class="ink-select-item ink-menu-item ink-signature-item"
                data-ink-select-item=""
                data-key={item.id}
                data-state={item.checked ? 'checked' : 'unchecked'}
                onclick={() => choose(item.id)}
              >
                <span class="ink-signature-preview" data-kind={item.template.kind}>
                  {#if item.template.kind === 'image'}
                    <img src={item.template.imagedata} alt="" draggable="false" />
                  {:else if preview}
                    <svg viewBox={preview.viewBox} aria-hidden="true">
                      {#each preview.paths as d, i (i)}
                        <path {d} fill="currentColor" />
                      {/each}
                    </svg>
                  {/if}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                aria-label={item.removeLabel}
                title={item.removeLabel}
                tabindex={-1}
                class="ink-menu-item ink-signature-remove"
                data-ink-signature-remove=""
                data-key={item.id}
                onclick={() => remove(item.id, row)}
              >
                <InkIcon icon={Trash2} size={16} />
              </button>
            {/each}
          </div>
          <div role="separator" class="ink-select-separator"></div>
        {/if}
        <button
          type="button"
          role="menuitem"
          tabindex={-1}
          class="ink-select-item ink-menu-item ink-signature-create"
          data-ink-select-item=""
          data-ink-signature-create=""
          onclick={create}
        >
          <InkIcon icon={Plus} size={16} />
          {SIGNATURE_LABELS.create}
        </button>
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
