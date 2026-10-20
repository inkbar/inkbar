import { TOOL_LABELS, type ToolId } from '@inkbar/core/dom'
import { Hand, Highlighter, MessageSquare, MousePointer2, Square } from '@inkbar/icons'
import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useTool } from '../hooks/useTool'

import { InkIcon } from './InkIcon'

import type { IconNode } from '@inkbar/icons'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

const ICONS: Readonly<Partial<Record<ToolId, IconNode>>> = {
  view: Hand,
  select: MousePointer2,
  highlight: Highlighter,
  'redact-area': Square,
  note: MessageSquare,
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
  const { tool: current, setTool } = useTool()
  const active = current === tool
  // A host tool has no built-in name or icon: `label` and `children` supply them.
  const name = label ?? TOOL_LABELS[tool] ?? tool
  const icon = ICONS[tool]
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
