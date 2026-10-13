import { ZOOM_LEVELS, type ZoomValue } from '@inkbar/core/dom'

import { cx } from '../class-names'
import { useZoom } from '../hooks/useZoom'

import type { ChangeEvent, ComponentPropsWithoutRef } from 'react'

const CUSTOM = 'custom:'
const level = (z: number) => ZOOM_LEVELS.find((l) => Math.abs(l - z) < 0.001)

export type InkZoomSelectProps = Omit<
  ComponentPropsWithoutRef<'select'>,
  'value' | 'onChange'
>

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
  function onChange(e: ChangeEvent<HTMLSelectElement>): void {
    const v = e.target.value
    const next: ZoomValue =
      v === 'fit-width' || v === 'fit-page' ? v : Number(v.replace(CUSTOM, ''))
    setZoom(next)
  }
  return (
    <select
      className={cx('ink-zoom-select', className)}
      data-ink-zoom-select=""
      aria-label="Zoom"
      value={value}
      onChange={onChange}
      {...rest}
    >
      <option value="fit-width">Fit width</option>
      <option value="fit-page">Fit page</option>
      {ZOOM_LEVELS.map((l) => (
        <option key={l} value={String(l)}>
          {Math.round(l * 100)}%
        </option>
      ))}
      {custom !== null ? (
        <option value={`${CUSTOM}${custom}`}>{Math.round(scale * 100)}%</option>
      ) : null}
    </select>
  )
}
