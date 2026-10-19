<script module lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  /**
   * Font, size, text colour, bold, italic, underline and alignment for the selected text
   * boxes or the text tool. A popover panel rather than a menu list: it holds a select, a
   * number input with a stepper, toggle buttons and a radio group, each named and operable on
   * its own. The trigger carries `data-mixed` when the selection disagrees on any of them.
   */
  export interface InkTextStyleMenuProps extends Omit<HTMLButtonAttributes, 'children'> {
    children?: Snippet | undefined
  }
</script>

<script lang="ts">
  import { handleRadioKeys, textStyleMenuModel } from '@inkbar/core/dom'
  import {
    ALargeSmall,
    AlignCenter,
    AlignJustify,
    AlignLeft,
    AlignRight,
    Bold,
    Italic,
    Minus,
    Plus,
    Underline,
  } from '@inkbar/icons'
  import { Popover, Toolbar } from 'bits-ui'

  import { useInkContext } from '../context.js'
  import { useToolStyle } from '../hooks/useToolStyle.svelte.js'

  import { asBitsProps } from './child-snippet.js'
  import InkColorMenu from './InkColorMenu.svelte'
  import InkIcon from './InkIcon.svelte'

  let { class: className, children, ...rest }: InkTextStyleMenuProps = $props()

  const ctx = useInkContext('InkTextStyleMenu')
  const style = useToolStyle()
  let open = $state(false)
  let trigger = $state<HTMLElement | null>(null)
  /** The size as typed, until it is committed with Enter or blur. */
  let draft = $state<string | null>(null)

  const model = $derived(textStyleMenuModel(style.current, style.supported, ctx.fonts))
  const sizeShown = $derived(
    draft ?? (model.size.value === null ? '' : String(model.size.value))
  )

  const TOGGLE_ICONS = { bold: Bold, italic: Italic, underline: Underline }
  const ALIGN_ICONS = {
    left: AlignLeft,
    center: AlignCenter,
    right: AlignRight,
    justify: AlignJustify,
  }

  // The menu closes when the control disables (the selection cleared while it was open).
  $effect(() => {
    if (!model.enabled) open = false
  })

  function onTriggerKeydown(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' || e.defaultPrevented || open || !model.enabled) return
    e.preventDefault()
    open = true
  }

  function commitSize(): void {
    if (draft === null) return
    if (draft.trim() !== '') {
      const patch = model.size.commit(Number(draft))
      if (patch) style.set(patch)
    }
    draft = null
  }
  function nudge(direction: 1 | -1): void {
    const patch = model.size.nudge(direction)
    if (patch) style.set(patch)
    draft = null
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Toolbar.Button
        bind:ref={trigger}
        {...props}
        {...asBitsProps(rest)}
        class={['ink-menu-trigger ink-text-style-menu', className]}
        data-ink-text-style-menu=""
        data-state={open ? 'open' : 'closed'}
        data-mixed={model.mixed ? '' : undefined}
        aria-label={model.label}
        title={model.label}
        aria-haspopup="dialog"
        onkeydown={onTriggerKeydown}
        disabled={!model.enabled}
      >
        {#if children}{@render children()}{:else}<InkIcon icon={ALargeSmall} />{/if}
      </Toolbar.Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      role="dialog"
      aria-label={model.label}
      class="ink-select-content ink-menu-content ink-text-style-content"
      data-ink-select-content=""
      data-ink-menu="text-style"
      side="bottom"
      align="start"
      sideOffset={4}
      collisionPadding={8}
      onCloseAutoFocus={(e) => {
        // Focus may be inside the nested colour menu when the panel closes.
        e.preventDefault()
        trigger?.focus()
      }}
    >
      <select
        class="ink-text-style-font"
        aria-label={model.font.label}
        value={model.font.value}
        onchange={(e) => style.set(model.font.patch(e.currentTarget.value))}
      >
        {#if model.font.value === ''}
          <option value="" disabled hidden>Mixed</option>
        {/if}
        {#each model.font.options as f (f)}
          <option value={f}>{f}</option>
        {/each}
      </select>
      <div class="ink-text-style-row">
        <InkColorMenu property="textColor" standalone />
        <div class="ink-text-style-size" role="group" aria-label="Size">
          <button
            type="button"
            class="ink-text-style-button"
            aria-label="Decrease font size"
            onclick={() => nudge(-1)}
          >
            <InkIcon icon={Minus} size={16} />
          </button>
          <input
            type="number"
            class="ink-text-style-input"
            aria-label={model.size.label}
            min={model.size.min}
            max={model.size.max}
            step={model.size.step}
            value={sizeShown}
            oninput={(e) => (draft = e.currentTarget.value)}
            onblur={commitSize}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitSize()
              }
            }}
          />
          <button
            type="button"
            class="ink-text-style-button"
            aria-label="Increase font size"
            onclick={() => nudge(1)}
          >
            <InkIcon icon={Plus} size={16} />
          </button>
        </div>
      </div>
      <div class="ink-text-style-row" role="group" aria-label="Emphasis">
        {#each model.toggles as t (t.key)}
          <button
            type="button"
            class="ink-text-style-button"
            aria-label={t.label}
            title={t.label}
            aria-pressed={t.pressed}
            data-state={t.pressed === true ? 'on' : 'off'}
            data-mixed={t.pressed === 'mixed' ? '' : undefined}
            onclick={() => style.set(t.patch)}
          >
            <InkIcon icon={TOGGLE_ICONS[t.key]} size={16} />
          </button>
        {/each}
      </div>
      <div
        class="ink-text-style-row"
        role="radiogroup"
        aria-label={model.align.label}
        tabindex="-1"
        onkeydown={(e) => handleRadioKeys(e, e.currentTarget)}
      >
        {#each model.align.choices as c (c.key)}
          <button
            type="button"
            role="radio"
            class="ink-text-style-button"
            aria-label={c.label}
            title={c.label}
            aria-checked={c.checked}
            tabindex={c.tabStop ? 0 : -1}
            data-state={c.checked ? 'on' : 'off'}
            onclick={() => style.set(c.patch)}
          >
            <InkIcon icon={ALIGN_ICONS[c.key]} size={16} />
          </button>
        {/each}
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
