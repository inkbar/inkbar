import { ZOOM_LEVELS, type ZoomValue } from '@inkbar/core/dom'
import { Check, ChevronDown } from '@inkbar/icons'
import { Select } from 'radix-ui'

import { cx } from '../class-names'
import { useMessages } from '../hooks/useMessages'
import { useZoom } from '../hooks/useZoom'

import { InkIcon } from './InkIcon'

import type { ComponentPropsWithoutRef } from 'react'

const CUSTOM = 'custom:'
const level = (z: number) => ZOOM_LEVELS.find((l) => Math.abs(l - z) < 0.001)
const percent = (z: number) => Math.round(z * 100)

/** Props of the select's trigger button; the options come from the zoom levels. */
export type InkZoomSelectProps = Omit<
  ComponentPropsWithoutRef<typeof Select.Trigger>,
  'children' | 'asChild'
>

function Item({ value, label }: { value: string; label: string }) {
  return (
    <Select.Item value={value} className="ink-select-item" data-ink-select-item="">
      <Select.ItemText>{label}</Select.ItemText>
      <Select.ItemIndicator className="ink-select-indicator">
        <InkIcon icon={Check} size={16} />
      </Select.ItemIndicator>
    </Select.Item>
  )
}

export function InkZoomSelect({ className, ...rest }: InkZoomSelectProps) {
  const { zoom, scale, setZoom } = useZoom()
  const m = useMessages()
  const fits = [
    { value: 'fit-width', label: m.toolbar.fitWidth },
    { value: 'fit-page', label: m.toolbar.fitPage },
  ]
  const label = (z: number) => m.toolbar.zoomPercent({ percent: percent(z) })
  /** A numeric zoom that is not one of the levels (zoom in and out multiply). */
  const custom = typeof zoom === 'number' && level(zoom) === undefined ? zoom : null
  const value =
    typeof zoom !== 'number'
      ? zoom
      : custom === null
        ? String(level(zoom))
        : `${CUSTOM}${zoom}`
  /** The levels, with a custom zoom in its place among them. */
  const levels = ZOOM_LEVELS.map((l) => ({ z: l, value: String(l), label: label(l) }))
  if (custom !== null)
    levels.push({ z: custom, value: `${CUSTOM}${custom}`, label: label(scale) })
  levels.sort((a, b) => a.z - b.z)
  /**
   * The trigger's text, from the current words: Radix's `Select.Value` would copy the selected
   * item's text once and keep it through a change of messages while the select is closed.
   */
  const shown = [...fits, ...levels].find((o) => o.value === value)?.label

  function onValueChange(v: string): void {
    if (v === value) return
    const next: ZoomValue =
      v === 'fit-width' || v === 'fit-page' ? v : Number(v.replace(CUSTOM, ''))
    setZoom(next)
  }
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger
        className={cx('ink-select ink-select-trigger ink-zoom-select', className)}
        data-ink-zoom-select=""
        aria-label={m.toolbar.zoom}
        {...rest}
      >
        <Select.Value className="ink-select-value">{shown}</Select.Value>
        <Select.Icon className="ink-select-icon">
          <InkIcon icon={ChevronDown} size={16} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="ink-select-content"
          data-ink-select-content=""
          position="popper"
          side="top"
          sideOffset={4}
        >
          <Select.Viewport>
            {fits.map((o) => (
              <Item key={o.value} value={o.value} label={o.label} />
            ))}
            <Select.Separator className="ink-select-separator" />
            {levels.map((o) => (
              <Item key={o.value} value={o.value} label={o.label} />
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
