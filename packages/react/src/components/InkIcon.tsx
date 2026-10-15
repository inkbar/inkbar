/*
 * An icon from `@inkbar/icons`, hidden from assistive technology: the control it sits in
 * carries the name. The theme sizes it with `--ink-icon-size`.
 */
import { ICON_ATTRIBUTES } from '@inkbar/icons'
import { createElement, type SVGProps } from 'react'

import type { IconNode } from '@inkbar/icons'

export interface InkIconProps {
  icon: IconNode
  size?: number
}

/** `stroke-width` to `strokeWidth`: React names SVG attributes in camelCase. */
const camel = (name: string) =>
  name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

const SVG_ATTRIBUTES = Object.fromEntries(
  Object.entries(ICON_ATTRIBUTES).map(([k, v]) => [camel(k), v])
) as SVGProps<SVGSVGElement>

export function InkIcon({ icon, size = 18 }: InkIconProps) {
  return (
    <svg
      {...SVG_ATTRIBUTES}
      width={size}
      height={size}
      className="ink-icon"
      aria-hidden="true"
    >
      {icon.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  )
}
