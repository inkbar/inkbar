<script module lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements'

  /** Attributes for the trigger button. The listbox and its options are the component's own. */
  export type InkZoomSelectProps = Omit<HTMLButtonAttributes, 'value' | 'children'>
</script>

<script lang="ts">
  import { ZOOM_LEVELS, type ZoomValue } from '@inkbar/core/dom'
  import { Check, ChevronDown } from '@inkbar/icons'
  import { Select } from 'bits-ui'

  import { useZoom } from '../hooks/useZoom.svelte.js'

  import { asBitsProps } from './child-snippet.js'
  import InkIcon from './InkIcon.svelte'

  let { class: className, ...rest }: InkZoomSelectProps = $props()

  const CUSTOM = 'custom:'
  const FITS = [
    { value: 'fit-width', label: 'Fit width' },
    { value: 'fit-page', label: 'Fit page' },
  ]
  const level = (z: number) => ZOOM_LEVELS.find((l) => Math.abs(l - z) < 0.001)
  const percent = (z: number) => `${Math.round(z * 100)}%`

  const zoom = useZoom()
  /** A numeric zoom that is not one of the levels (zoom in and out multiply). */
  const custom = $derived(
    typeof zoom.zoom === 'number' && level(zoom.zoom) === undefined ? zoom.zoom : null
  )
  const value = $derived(
    typeof zoom.zoom !== 'number'
      ? zoom.zoom
      : custom === null
        ? String(level(zoom.zoom))
        : `${CUSTOM}${zoom.zoom}`
  )
  /** The levels, with a custom zoom in its place among them. */
  const levels = $derived.by(() => {
    const list = ZOOM_LEVELS.map((l) => ({ z: l, value: String(l), label: percent(l) }))
    if (custom !== null)
      list.push({ z: custom, value: `${CUSTOM}${custom}`, label: percent(zoom.scale) })
    return list.sort((a, b) => a.z - b.z)
  })
  // Every option, for the trigger's label and typeahead: the items mount only while it is open.
  const items = $derived([...FITS, ...levels])

  function onValueChange(v: string): void {
    if (v === value) return
    const next: ZoomValue =
      v === 'fit-width' || v === 'fit-page' ? v : Number(v.replace(CUSTOM, ''))
    zoom.setZoom(next)
  }
</script>

<!-- Bits UI's trigger is a plain button with a listbox popup; the role makes it the
     select-only combobox of the ARIA pattern, as Reka UI and Radix render it. -->
<Select.Root type="single" {items} bind:value={() => value, onValueChange}>
  <Select.Trigger
    class={['ink-zoom-select', 'ink-select-trigger', className]}
    data-ink-zoom-select=""
    role="combobox"
    aria-label="Zoom"
    {...asBitsProps(rest)}
  >
    <Select.Value class="ink-select-value" />
    <span class="ink-select-icon" aria-hidden="true">
      <InkIcon icon={ChevronDown} size={16} />
    </span>
  </Select.Trigger>
  <Select.Portal>
    <Select.Content
      class="ink-select-content"
      data-ink-select-content=""
      side="top"
      sideOffset={4}
    >
      <Select.Viewport>
        {#each items as o, i (o.value)}
          <!-- The fits, then the levels. -->
          {#if i === FITS.length}
            <div class="ink-select-separator" aria-hidden="true"></div>
          {/if}
          <Select.Item
            value={o.value}
            label={o.label}
            class="ink-select-item"
            data-ink-select-item=""
          >
            {#snippet children({ selected })}
              <span>{o.label}</span>
              {#if selected}
                <span class="ink-select-indicator">
                  <InkIcon icon={Check} size={16} />
                </span>
              {/if}
            {/snippet}
          </Select.Item>
        {/each}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>
