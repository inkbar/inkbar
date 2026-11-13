import { toolName, withHostTools, type ToolId } from '@inkbar/core/dom'
import { SquareDashedMousePointer, TextCursor } from '@inkbar/icons'
import { Toolbar } from 'radix-ui'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { hostLabel } from '../hooks/useMessages'
import { useRegisteredTool } from '../hooks/useRegisteredTool'
import { useTool } from '../hooks/useTool'

import { InkIcon } from './InkIcon'

import type { Label } from '@inkbar/core'
import type { IconNode } from '@inkbar/icons'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

const ICONS: Readonly<Partial<Record<ToolId, IconNode>>> = {
  'select-text': TextCursor,
  select: SquareDashedMousePointer,
}

const MISSING = {
  disabled: true,
  'aria-hidden': true,
  'aria-pressed': undefined,
  'aria-label': undefined,
  title: undefined,
  onClick: undefined,
} as const

export interface InkToolButtonProps extends Omit<
  ComponentPropsWithoutRef<'button'>,
  'children'
> {
  tool: ToolId
  /** A string, or a function read again whenever the root's `messages` change. */
  label?: Label | undefined
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
  const { hostTools, pluginHost, messages } = useInkContext('InkToolButton')
  const { tool: current, setTool } = useTool()
  const active = current === tool
  const registered = useRegisteredTool(tool)
  /** The registered tool by this id, for the name and icon core has none for. */
  const own = withHostTools([...(hostTools ?? []), ...(pluginHost?.tools ?? [])]).find(
    (t) => t.id === tool
  )
  // `label` and `children` win; then the tool's own name, else core's; then the id.
  const name = hostLabel(label, toolName(tool, own, messages))
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
      // A tool nobody registered leaves the button disabled, hidden from assistive tech and
      // unnamed, whatever the host passed.
      {...(registered ? {} : MISSING)}
    >
      {!registered
        ? null
        : typeof children === 'function'
          ? children({ active, label: name })
          : (children ?? (icon ? <InkIcon icon={icon} /> : null))}
    </Toolbar.Button>
  )
}
