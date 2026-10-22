<script module lang="ts">
  import type { StyleGroup } from '@inkbar/core'
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
    /**
     * Renders the trigger outside the toolbar's roving focus, for a menu nested in another
     * panel (the text style menu's text colour).
     */
    standalone?: boolean | undefined
    /**
     * Scopes the menu to one style group: it shows and sets that group's colour whatever
     * tool is active, and recolours the selection only when it is all in the group.
     */
    group?: StyleGroup | undefined
    /** The colour new annotations get while the style leaves it unset; the swatch shows it. */
    fallback?: string | undefined
  }
</script>

<script lang="ts">
  import { COLOR_COLUMNS, colorMenuModel, handleMenuKeys } from '@inkbar/core/dom'
  import { Check } from '@inkbar/icons'
  import { Popover, Toolbar } from 'bits-ui'

  import { useToolStyle } from '../hooks/useToolStyle.svelte.js'

  import { asBitsProps, composeHandlers } from './child-snippet.js'
  import InkIcon from './InkIcon.svelte'
  import { createMenuOpenFocus } from './menu-open-focus.js'

  let {
    property,
    label,
    class: className,
    children,
    standalone = false,
    group,
    fallback,
    disabled,
    onclick,
    onkeydown,
    ...rest
  }: InkColorMenuProps = $props()

  const style = useToolStyle(() => group)
  let open = $state(false)

  const model = $derived(
    colorMenuModel(property, style.current, style.supported, fallback)
  )
  const name = $derived(label ?? model.label)
  const trigger = $derived(model.trigger)

  let menu = $state<HTMLElement | null>(null)
  let triggerEl = $state<HTMLButtonElement | null>(null)
  let customInput = $state<HTMLInputElement | null>(null)

  // The menu closes when the control disables (the selection cleared while it was open).
  $effect(() => {
    if (!model.enabled) open = false
  })

  /** ArrowDown opens on the first item; a click opens on the checked one. */
  const openFocus = createMenuOpenFocus()
  $effect(() => {
    if (!open) openFocus.reset()
  })
  function onTriggerKeydown(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' || e.defaultPrevented || open || !model.enabled) return
    e.preventDefault()
    openFocus.first()
    open = true
  }

  const triggerAttrs = $derived({
    class: ['ink-menu-trigger ink-color-menu', className],
    'data-ink-color-menu': property,
    'data-state': open ? 'open' : 'closed',
    'data-mixed': model.mixed ? '' : undefined,
    'aria-label': name,
    title: name,
    'aria-haspopup': 'menu' as const,
    disabled: !!disabled || !model.enabled,
  })
  /** The trigger's handlers: the host's first, then Bits UI's and the menu's. */
  const handlers = (props: Record<string, unknown>) => ({
    onclick: composeHandlers(onclick, props.onclick),
    onkeydown: composeHandlers(onkeydown, props.onkeydown, onTriggerKeydown),
  })
</script>

{#snippet body()}
  {#if children}
    {@render children()}
  {:else}
    <span
      class="ink-swatch"
      data-ink-swatch=""
      data-property={property}
      data-kind={trigger.kind}
      data-color={trigger.kind === 'color' ? trigger.color : undefined}
      style={trigger.kind === 'color' ? `--ink-swatch: ${trigger.color}` : undefined}
      aria-hidden="true"
    ></span>
  {/if}
{/snippet}

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      {#if standalone}
        <button
          bind:this={triggerEl}
          {...props}
          {...asBitsProps(rest)}
          {...triggerAttrs}
          {...handlers(props)}
        >
          {@render body()}
        </button>
      {:else}
        <Toolbar.Button
          {...props}
          {...asBitsProps(rest)}
          {...triggerAttrs}
          {...handlers(props)}
        >
          {@render body()}
        </Toolbar.Button>
      {/if}
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
      onOpenAutoFocus={(e) => openFocus.onOpenAutoFocus(e, menu)}
      onfocusin={openFocus.onfocusin}
      onkeydown={(e) => {
        // Nested in another panel, Escape closes this menu alone; Bits would otherwise pick
        // the layer to close by registration order.
        if (standalone && e.key === 'Escape') {
          e.stopPropagation()
          e.preventDefault()
          open = false
          triggerEl?.focus()
          return
        }
        if (menu) handleMenuKeys(e, menu)
      }}
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
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
<input
  bind:this={customInput}
  type="color"
  class="ink-color-input"
  aria-label="Custom colour"
  data-ink-color-input={property}
  tabindex={-1}
  value={model.customValue.toLowerCase()}
  onchange={(e) => style.set(model.custom(e.currentTarget.value))}
/>
