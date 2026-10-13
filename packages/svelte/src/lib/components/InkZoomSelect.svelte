<script module lang="ts">
  import type { HTMLSelectAttributes } from 'svelte/elements'

  export type InkZoomSelectProps = Omit<
    HTMLSelectAttributes,
    'value' | 'onchange' | 'children'
  >
</script>

<script lang="ts">
  import { ZOOM_LEVELS, type ZoomValue } from '@inkbar/core/dom'

  import { useZoom } from '../hooks/useZoom.svelte.js'

  let { class: className, ...rest }: InkZoomSelectProps = $props()

  const CUSTOM = 'custom:'
  const level = (z: number) => ZOOM_LEVELS.find((l) => Math.abs(l - z) < 0.001)

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
  function onchange(e: Event & { currentTarget: HTMLSelectElement }): void {
    const v = e.currentTarget.value
    const next: ZoomValue =
      v === 'fit-width' || v === 'fit-page' ? v : Number(v.replace(CUSTOM, ''))
    zoom.setZoom(next)
  }
</script>

<select
  class={['ink-zoom-select', className]}
  data-ink-zoom-select=""
  aria-label="Zoom"
  {value}
  {onchange}
  {...rest}
>
  <option value="fit-width">Fit width</option>
  <option value="fit-page">Fit page</option>
  {#each ZOOM_LEVELS as l (l)}
    <option value={String(l)}>{Math.round(l * 100)}%</option>
  {/each}
  {#if custom !== null}
    <option value={`${CUSTOM}${custom}`}>{Math.round(zoom.scale * 100)}%</option>
  {/if}
</select>
