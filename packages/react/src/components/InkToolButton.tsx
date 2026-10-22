import { TOOL_LABELS, type ToolId } from '@inkbar/core/dom'
import {
  Highlighter,
  MessageSquare,
  PenLine,
  PenTool,
  Signature,
  Square,
  SquareDashedMousePointer,
  TextCursor,
  Type,
} from '@inkbar/icons'
import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { useTool } from '../hooks/useTool'

import { InkIcon } from './InkIcon'

import type { IconNode } from '@inkbar/icons'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

const ICONS: Readonly<Partial<Record<ToolId, IconNode>>> = {
  'select-text': TextCursor,
  select: SquareDashedMousePointer,
  highlight: Highlighter,
  'redact-area': Square,
  sketch: PenTool,
  draw: PenLine,
  note: MessageSquare,
  freetext: Type,
  signature: Signature,
}

export interface InkToolButtonProps extends Omit<
  ComponentPropsWithoutRef<'button'>,
  'children'
> {
  tool: ToolId
  label?: string | undefined
  asChild?: boolean
  children?: ReactNode | ((props: { active: boolean; label: string }) => ReactNode)
}

export function InkToolButton({
  tool,
  label,
  asChild = false,
  className,
  children,
  onClick,
  ...rest
}: InkToolButtonProps) {
  const { hostTools, pluginHost } = useInkContext('InkToolButton')
  const { tool: current, setTool } = useTool()
  const active = current === tool
  /** A host or plugin tool by this id, for the name and icon core has none for. */
  const own = [...(hostTools ?? []), ...(pluginHost?.tools ?? [])].find(
    (t) => t.id === tool
  )
  // `label` and `children` win; then core's name and icon; then the tool's own.
  const name = label ?? TOOL_LABELS[tool] ?? own?.label ?? tool
  const icon = ICONS[tool] ?? own?.icon
  return (
    <Toolbar.Button
      asChild={asChild}
      className={cx('ink-tool-button', className)}
      data-ink-tool-button=""
      data-tool={tool}
      data-state={active ? 'on' : 'off'}
      aria-pressed={active}
      aria-label={name}
      title={name}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) setTool(tool)
      }}
      {...rest}
    >
      {typeof children === 'function'
        ? children({ active, label: name })
        : (children ?? (icon ? <InkIcon icon={icon} /> : null))}
    </Toolbar.Button>
  )
}
