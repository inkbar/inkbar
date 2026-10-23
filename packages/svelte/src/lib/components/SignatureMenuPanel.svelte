<script lang="ts">
  /*
   * The signature menu's items: the saved signatures as previews, each with a remove button,
   * then "Create signature", and the store's removal error. The toolbar's `InkSignatureMenu`
   * and a signature field's `InkSignFieldPopover` both render it inside their `role="menu"`
   * content, which `menu` returns.
   */
  import { SIGNATURE_LABELS, signaturePreview } from '@inkbar/core/dom'
  import { Plus, Trash2 } from '@inkbar/icons'
  import { tick } from 'svelte'

  import { useInkContext } from '../context.js'
  import { useReadable } from '../use-readable.svelte.js'

  import InkIcon from './InkIcon.svelte'

  import type { SignatureTemplate } from '@inkbar/core'
  import type { SignatureMenuItem } from '@inkbar/core/dom'

  let {
    items,
    menu,
    onChoose,
    onCreate,
  }: {
    items: readonly SignatureMenuItem[]
    /** The menu element the items sit in, for moving focus after a removal. */
    menu: () => HTMLElement | null
    onChoose: (template: SignatureTemplate) => void
    onCreate: () => void
  } = $props()

  const ctx = useInkContext('SignatureMenuPanel')
  const removeError = useReadable(() => ctx.signatures.removeError, undefined)

  /** Removes a template; focus moves to the signature now in its row, else "Create signature". */
  function remove(id: string, row: number): void {
    ctx.signatures.remove(id).then(
      async () => {
        await tick()
        const panel = menu()
        if (!panel) return
        const rows = panel.querySelectorAll<HTMLElement>('.ink-signature-item')
        const next =
          rows[Math.min(row, rows.length - 1)] ??
          panel.querySelector<HTMLElement>('[data-ink-signature-create]')
        next?.focus({ preventScroll: true })
      },
      () => {
        // The host's store refused: the signature stays.
      }
    )
  }
</script>

{#if items.length > 0}
  <div
    role="group"
    aria-label={SIGNATURE_LABELS.saved}
    class="ink-signature-list"
    data-ink-menu-columns="2"
  >
    {#each items as item, row (item.id)}
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
        onclick={() => onChoose(item.template)}
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
  onclick={onCreate}
>
  <InkIcon icon={Plus} size={16} />
  {SIGNATURE_LABELS.create}
</button>
{#if removeError.current}
  <p
    class="ink-field-error ink-signature-remove-error"
    role="alert"
    data-ink-signature-remove-error=""
  >
    {removeError.current}
  </p>
{/if}
