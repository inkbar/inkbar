<script module lang="ts">
  import type { ColorProperty } from '@inkbar/core/dom'
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  /**
   * A colour menu for one colour property (border, fill or text) of the selection or the
   * active tool. The trigger shows the current colour as a swatch: split when the selection
   * disagrees, slashed for no fill. The panel is a palette grid, plus "No fill" for `fill`
   * and "Custom…", which opens a native colour input. The menu disables when nothing
   * supports the property.
   */
  export interface InkColorMenuProps extends Omit<HTMLButtonAttributes, 'children'> {
    /** The colour this menu sets. */
    property: ColorProperty
    /** Accessible name; defaults to "Border colour", "Fill colour" or "Text colour". */
    label?: string | undefined
    /** Replaces the swatch. */
    children?: Snippet | undefined
  }
</script>

<script lang="ts">
  import {
    COLOR_COLUMNS,
    colorMenuModel,
    focusInitialMenuItem,
    handleMenuKeys,
    menuItems,
  } from '@inkbar/core/dom'
  import { Check } from '@inkbar/icons'
  import { Popover, Toolbar } from 'bits-ui'

  import { useToolStyle } from '../hooks/useToolStyle.svelte.js'

  import { asBitsProps } from './child-snippet.js'
  import InkIcon from './InkIcon.svelte'

  let {
    property,
    label,
    class: className,
    children,
    ...rest
  }: InkColorMenuProps = $props()

  const style = useToolStyle()
  let open = $state(false)

  const model = $derived(colorMenuModel(property, style.current, style.supported))
  const name = $derived(label ?? model.label)
  const trigger = $derived(model.trigger)

  let menu = $state<HTMLElement | null>(null)
  let customInput = $state<HTMLInputElement | null>(null)

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
        class={['ink-menu-trigger ink-color-menu', className]}
        data-ink-color-menu={property}
        data-state={open ? 'open' : 'closed'}
        data-mixed={model.mixed ? '' : undefined}
        aria-label={name}
        title={name}
        aria-haspopup="menu"
        onkeydown={onTriggerKeydown}
        disabled={!model.enabled}
      >
        {#if children}
          {@render children()}
        {:else}
          <span
            class="ink-swatch"
            data-ink-swatch=""
            data-property={property}
            data-kind={trigger.kind}
            data-color={trigger.kind === 'color' ? trigger.color : undefined}
            style={trigger.kind === 'color'
              ? `--ink-swatch: ${trigger.color}`
              : undefined}
            aria-hidden="true"
          ></span>
        {/if}
      </Toolbar.Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      bind:ref={menu}
      role="menu"
      aria-label={name}
      class="ink-select-content ink-menu-content"
      data-ink-select-content=""
      data-ink-menu={`color-${property}`}
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
      {#if model.noFill}
        {@const noFill = model.noFill}
        <button
          type="button"
          role="menuitemradio"
          class="ink-select-item ink-menu-item"
          data-ink-select-item=""
          tabindex={-1}
          aria-checked={noFill.checked}
          data-state={noFill.checked ? 'checked' : 'unchecked'}
          onclick={() => style.set(noFill.patch)}
        >
          No fill
          {#if noFill.checked}
            <span class="ink-select-indicator"><InkIcon icon={Check} size={16} /></span>
          {/if}
        </button>
      {/if}
      <div
        role="group"
        aria-label="Colours"
        class="ink-color-grid"
        data-ink-menu-columns={COLOR_COLUMNS}
      >
        {#each model.swatches as sw (sw.key)}
          <button
            type="button"
            role="menuitemradio"
            class="ink-swatch-item"
            tabindex={-1}
            aria-label={sw.label}
            aria-checked={sw.checked}
            data-state={sw.checked ? 'checked' : 'unchecked'}
            style={`--ink-swatch: ${sw.color}`}
            onclick={() => style.set(sw.patch)}
          ></button>
        {/each}
      </div>
      <button
        type="button"
        role="menuitem"
        class="ink-select-item ink-menu-item"
        data-ink-select-item=""
        tabindex={-1}
        onclick={() => customInput?.click()}
      >
        Custom…
      </button>
      <input
        bind:this={customInput}
        type="color"
        class="ink-color-input"
        aria-label="Custom colour"
        tabindex={-1}
        value={model.customValue.toLowerCase()}
        onchange={(e) => style.set(model.custom(e.currentTarget.value))}
      />
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
