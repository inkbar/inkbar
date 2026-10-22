<script module lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  /**
   * A split button for the shape tool. The main part activates the tool with the current
   * kind and draws that kind's icon; the chevron opens a two-column grid of kinds. Choosing
   * a kind switches to the tool with it.
   */
  export interface InkShapeMenuProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'children'
  > {
    /** Replaces the main button's icon. */
    children?: Snippet | undefined
  }
</script>

<script lang="ts">
  import {
    handleMenuKeys,
    SHAPE_COLUMNS,
    SHAPE_ICONS,
    SHAPE_KINDS,
    shapeMenuModel,
    type ShapeKind,
    type ShapeOptions,
  } from '@inkbar/core/dom'
  import { ChevronDown } from '@inkbar/icons'
  import { Popover, Toolbar } from 'bits-ui'

  import { useTool } from '../hooks/useTool.svelte.js'
  import { useToolOptions } from '../hooks/useToolOptions.svelte.js'

  import InkIcon from './InkIcon.svelte'
  import { createMenuOpenFocus } from './menu-open-focus.js'

  let { class: className, children, ...rest }: InkShapeMenuProps = $props()

  const current = useTool()
  const shape = useToolOptions<ShapeOptions>('shape')
  let open = $state(false)
  /** The split button: the panel lines up under it rather than the chevron. */
  let group = $state<HTMLElement | null>(null)

  const model = $derived(shapeMenuModel(shape.options, SHAPE_KINDS))
  const active = $derived(current.tool === 'shape')

  let menu = $state<HTMLElement | null>(null)

  /** ArrowDown opens on the first item; a click opens on the checked one. */
  const openFocus = createMenuOpenFocus()
  $effect(() => {
    if (!open) openFocus.reset()
  })
  function onTriggerKeydown(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' || e.defaultPrevented || open) return
    e.preventDefault()
    openFocus.first()
    open = true
  }

  function choose(kind: ShapeKind): void {
    shape.setOptions({ kind })
    current.setTool('shape')
    open = false
  }
</script>

<div
  bind:this={group}
  role="group"
  aria-label="Shape"
  class={['ink-split-button ink-shape-menu', className]}
  data-ink-shape-menu=""
  {...rest}
>
  <Toolbar.Button
    class="ink-tool-button ink-shape-button"
    data-ink-tool-button=""
    data-ink-shape-button=""
    data-tool="shape"
    data-kind={model.kind}
    data-state={active ? 'on' : 'off'}
    aria-pressed={active}
    aria-label={model.label}
    title={model.label}
    onclick={() => current.setTool('shape')}
  >
    {#if children}{@render children()}{:else}<InkIcon
        icon={SHAPE_ICONS[model.kind]}
      />{/if}
  </Toolbar.Button>
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Toolbar.Button
          {...props}
          class="ink-menu-trigger ink-shape-menu-trigger"
          data-ink-shape-menu-trigger=""
          data-state={open ? 'open' : 'closed'}
          aria-label="Choose shape"
          title="Choose shape"
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
        aria-label="Shapes"
        class="ink-select-content ink-menu-content"
        data-ink-select-content=""
        data-ink-menu="shape"
        customAnchor={group}
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        onOpenAutoFocus={(e) => openFocus.onOpenAutoFocus(e, menu)}
        onfocusin={openFocus.onfocusin}
        onkeydown={(e) => menu && handleMenuKeys(e, menu)}
      >
        <div
          role="group"
          aria-label="Shapes"
          class="ink-shape-grid"
          data-ink-menu-columns={SHAPE_COLUMNS}
        >
          {#each model.items as item (item.kind)}
            <button
              type="button"
              role="menuitemradio"
              class="ink-select-item ink-menu-item ink-shape-item"
              data-ink-select-item=""
              tabindex={-1}
              data-key={item.kind}
              aria-checked={item.checked}
              data-state={item.checked ? 'checked' : 'unchecked'}
              onclick={() => choose(item.kind)}
            >
              <InkIcon icon={SHAPE_ICONS[item.kind]} size={16} />
              {item.label}
            </button>
          {/each}
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</div>
