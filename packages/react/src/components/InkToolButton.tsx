import { TOOL_LABELS, type ToolId } from '@inkbar/core/dom'
import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useTool } from '../hooks/useTool'

import type { ComponentPropsWithoutRef, ReactNode } from 'react'

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
  const name = label ?? TOOL_LABELS[tool]
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
        : (children ?? name)}
    </Toolbar.Button>
  )
}
