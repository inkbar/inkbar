import { ZOOM_LEVELS, type ZoomValue } from '@inkbar/core/dom'
import { Check, ChevronDown } from '@inkbar/icons'
import { Select } from 'radix-ui'

import { cx } from '../class-names'
import { useZoom } from '../hooks/useZoom'

import { InkIcon } from './InkIcon'

import type { ComponentPropsWithoutRef } from 'react'

const CUSTOM = 'custom:'
const level = (z: number) => ZOOM_LEVELS.find((l) => Math.abs(l - z) < 0.001)
const percent = (z: number) => `${Math.round(z * 100)}%`

const FITS = [
  { value: 'fit-width', label: 'Fit width' },
  { value: 'fit-page', label: 'Fit page' },
]

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
  /** A numeric zoom that is not one of the levels (zoom in and out multiply). */
  const custom = typeof zoom === 'number' && level(zoom) === undefined ? zoom : null
  const value =
    typeof zoom !== 'number'
      ? zoom
      : custom === null
        ? String(level(zoom))
        : `${CUSTOM}${zoom}`
  /** The levels, with a custom zoom in its place among them. */
  const levels = ZOOM_LEVELS.map((l) => ({ z: l, value: String(l), label: percent(l) }))
  if (custom !== null)
    levels.push({ z: custom, value: `${CUSTOM}${custom}`, label: percent(scale) })
  levels.sort((a, b) => a.z - b.z)

  function onValueChange(v: string): void {
    if (v === value) return
    const next: ZoomValue =
      v === 'fit-width' || v === 'fit-page' ? v : Number(v.replace(CUSTOM, ''))
    setZoom(next)
  }
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger
        className={cx('ink-zoom-select ink-select-trigger', className)}
        data-ink-zoom-select=""
        aria-label="Zoom"
        {...rest}
      >
        <Select.Value className="ink-select-value" />
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
            {FITS.map((o) => (
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
