<script module lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  /**
   * A split button for the highlight tool. The main part activates the tool with the current
   * markup kind and draws that kind's icon; the chevron opens a menu of the four kinds plus
   * the markup colour. Choosing a kind switches to the tool with it. The colour is a nested
   * `InkColorMenu` scoped to the `markup` style group, so it works whatever tool is active.
   */
  export interface InkHighlightMenuProps extends Omit<
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
    highlightMenuModel,
    MARKUP_ICONS,
    MARKUP_KINDS,
    type HighlightOptions,
    type MarkupKind,
  } from '@inkbar/core/dom'
  import { ChevronDown } from '@inkbar/icons'
  import { Popover, Toolbar } from 'bits-ui'

  import { useDocument } from '../hooks/useDocument.svelte.js'
  import { useTool } from '../hooks/useTool.svelte.js'
  import { useToolOptions } from '../hooks/useToolOptions.svelte.js'

  import InkColorMenu from './InkColorMenu.svelte'
  import InkIcon from './InkIcon.svelte'
  import { createMenuOpenFocus } from './menu-open-focus.js'

  let { class: className, children, ...rest }: InkHighlightMenuProps = $props()

  const current = useTool()
  const inkDocument = useDocument()
  const highlight = useToolOptions<HighlightOptions>('highlight')
  let open = $state(false)
  /** The split button: the panel lines up under it rather than the chevron. */
  let group = $state<HTMLElement | null>(null)

  const model = $derived(highlightMenuModel(highlight.options, MARKUP_KINDS))
  /** The colour the chosen kind gets while the markup style leaves it unset. */
  const fallback = $derived(inkDocument.document?.annotations.defaults.color(model.kind))
  const active = $derived(current.tool === 'highlight')

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

  function choose(kind: MarkupKind): void {
    highlight.setOptions({ kind })
    current.setTool('highlight')
    open = false
  }
</script>

<div
  bind:this={group}
  role="group"
  aria-label="Highlight"
  class={['ink-split-button ink-highlight-menu', className]}
  data-ink-highlight-menu=""
  {...rest}
>
  <Toolbar.Button
    class="ink-tool-button ink-highlight-button"
    data-ink-tool-button=""
    data-ink-highlight-button=""
    data-tool="highlight"
    data-kind={model.kind}
    data-state={active ? 'on' : 'off'}
    aria-pressed={active}
    aria-label={model.label}
    title={model.label}
    onclick={() => current.setTool('highlight')}
  >
    {#if children}{@render children()}{:else}<InkIcon
        icon={MARKUP_ICONS[model.kind]}
      />{/if}
  </Toolbar.Button>
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Toolbar.Button
          {...props}
          class="ink-menu-trigger ink-highlight-menu-trigger"
          data-ink-highlight-menu-trigger=""
          data-state={open ? 'open' : 'closed'}
          aria-label="Choose highlight"
          title="Choose highlight"
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
        aria-label="Highlights"
        class="ink-select-content ink-menu-content"
        data-ink-select-content=""
        data-ink-menu="highlight"
        customAnchor={group}
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        onOpenAutoFocus={(e) => openFocus.onOpenAutoFocus(e, menu)}
        onfocusin={openFocus.onfocusin}
        onkeydowncapture={(e: KeyboardEvent) => menu && handleMenuKeys(e, menu)}
      >
        <div role="group" aria-label="Kinds" class="ink-highlight-kinds">
          {#each model.items as item (item.kind)}
            <button
              type="button"
              role="menuitemradio"
              class="ink-select-item ink-menu-item ink-highlight-item"
              data-ink-select-item=""
              tabindex={-1}
              data-key={item.kind}
              aria-checked={item.checked}
              data-state={item.checked ? 'checked' : 'unchecked'}
              onclick={() => choose(item.kind)}
            >
              <InkIcon icon={MARKUP_ICONS[item.kind]} size={16} />
              {item.label}
            </button>
          {/each}
        </div>
        <div role="separator" class="ink-select-separator"></div>
        <div role="group" aria-label="Colour" class="ink-highlight-colour">
          <span class="ink-highlight-colour-label" aria-hidden="true">Colour</span>
          <!-- Capture on the panel moves on from this item before its own ArrowDown opens it. -->
          <InkColorMenu
            property="border"
            group="markup"
            label="Highlight colour"
            standalone
            {fallback}
            role="menuitem"
            tabindex={-1}
          />
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</div>
