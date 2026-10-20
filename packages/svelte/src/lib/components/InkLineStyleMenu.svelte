<script module lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  /**
   * Line weight, solid or dashed, and arrowheads, for the selection or the active tool. Each
   * section disables when nothing selected (or no active tool) supports its props. The
   * trigger carries `data-mixed` when the selection disagrees on any of them; a section with
   * no single value shows no checkmark.
   */
  export interface InkLineStyleMenuProps extends Omit<HTMLButtonAttributes, 'children'> {
    children?: Snippet | undefined
  }
</script>

<script lang="ts">
  import {
    focusInitialMenuItem,
    handleMenuKeys,
    lineStyleMenuModel,
    menuItems,
  } from '@inkbar/core/dom'
  import { Check, Minus } from '@inkbar/icons'
  import { Popover, Toolbar } from 'bits-ui'

  import { useToolStyle } from '../hooks/useToolStyle.svelte.js'

  import { asBitsProps } from './child-snippet.js'
  import InkIcon from './InkIcon.svelte'

  let { class: className, children, ...rest }: InkLineStyleMenuProps = $props()

  const style = useToolStyle()
  let open = $state(false)

  const model = $derived(lineStyleMenuModel(style.current, style.supported))

  let menu = $state<HTMLElement | null>(null)

  // The menu closes when the control disables (the selection cleared while it was open).
  $effect(() => {
    if (!model.enabled) open = false
  })

  /** ArrowDown opens on the first item; a click opens on the checked one. */
  let focusFirst = false
  // Bits runs the open-focus callback more than once, so the flag outlives it; reset on close.
  $effect(() => {
    if (!open) focusFirst = false
  })
  function onTriggerKeydown(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' || e.defaultPrevented || open || !model.enabled) return
    e.preventDefault()
    focusFirst = true
    open = true
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Toolbar.Button
        {...props}
        {...asBitsProps(rest)}
        class={['ink-menu-trigger ink-line-style-menu', className]}
        data-ink-line-style-menu=""
        data-state={open ? 'open' : 'closed'}
        data-mixed={model.mixed ? '' : undefined}
        aria-label="Line style"
        title="Line style"
        aria-haspopup="menu"
        onkeydown={onTriggerKeydown}
        disabled={!model.enabled}
      >
        {#if children}{@render children()}{:else}<InkIcon icon={Minus} />{/if}
      </Toolbar.Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      bind:ref={menu}
      role="menu"
      aria-label="Line style"
      class="ink-select-content ink-menu-content"
      data-ink-select-content=""
      data-ink-menu="line-style"
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
      onkeydown={(e) => menu && handleMenuKeys(e, menu)}
    >
      {#each model.sections as section (section.label)}
        <div
          role="group"
          class="ink-menu-group"
          aria-label={section.label}
          aria-disabled={section.disabled || undefined}
          data-disabled={section.disabled ? '' : undefined}
        >
          <div class="ink-menu-label" aria-hidden="true">{section.label}</div>
          {#each section.items as item (item.key)}
            <button
              type="button"
              role="menuitemradio"
              class="ink-select-item ink-menu-item"
              data-ink-select-item=""
              tabindex={-1}
              aria-checked={item.checked}
              disabled={section.disabled}
              data-state={item.checked ? 'checked' : 'unchecked'}
              onclick={() => style.set(item.patch)}
            >
              {item.label}
              {#if item.checked}
                <span class="ink-select-indicator"
                  ><InkIcon icon={Check} size={16} /></span
                >
              {/if}
            </button>
          {/each}
        </div>
      {/each}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
