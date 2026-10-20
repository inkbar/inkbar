/*
 * A split button for the shape tool. The main part activates the tool with the current
 * kind and draws that kind's icon; the chevron opens a two-column grid of kinds. Choosing a
 * kind switches to the tool with it.
 */
import {
  focusInitialMenuItem,
  handleMenuKeys,
  menuItems,
  SHAPE_COLUMNS,
  SHAPE_ICONS,
  SHAPE_KINDS,
  shapeMenuModel,
  type ShapeOptions,
} from '@inkbar/core/dom'
import { ChevronDown } from '@inkbar/icons'
import { Popover, Toolbar } from 'radix-ui'
import { useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'

import { cx } from '../class-names'
import { useTool } from '../hooks/useTool'
import { useToolOptions } from '../hooks/useToolOptions'

import { InkIcon } from './InkIcon'

export interface InkShapeMenuProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'children'
> {
  /** Replaces the main button's icon. */
  children?: ReactNode
}

export function InkShapeMenu({ className, children, ...rest }: InkShapeMenuProps) {
  const { tool, setTool } = useTool()
  const [options, setOptions] = useToolOptions<ShapeOptions>('shape')
  const [open, setOpen] = useState(false)
  const model = shapeMenuModel(options, SHAPE_KINDS)
  const active = tool === 'shape'
  /** ArrowDown opens on the first item; a click opens on the checked one. */
  const focusFirst = useRef(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div
          role="group"
          aria-label="Shape"
          className={cx('ink-split-button ink-shape-menu', className)}
          data-ink-shape-menu=""
          {...rest}
        >
          <Toolbar.Button
            className="ink-tool-button ink-shape-button"
            data-ink-tool-button=""
            data-ink-shape-button=""
            data-tool="shape"
            data-kind={model.kind}
            data-state={active ? 'on' : 'off'}
            aria-pressed={active}
            aria-label={model.label}
            title={model.label}
            onClick={() => setTool('shape')}
          >
            {children ?? <InkIcon icon={SHAPE_ICONS[model.kind]} />}
          </Toolbar.Button>
          <Toolbar.Button asChild>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="ink-menu-trigger ink-shape-menu-trigger"
                data-ink-shape-menu-trigger=""
                data-state={open ? 'open' : 'closed'}
                aria-label="Choose shape"
                title="Choose shape"
                aria-haspopup="menu"
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowDown' || e.defaultPrevented || open) return
                  e.preventDefault()
                  focusFirst.current = true
                  setOpen(true)
                }}
              >
                <InkIcon icon={ChevronDown} />
              </button>
            </Popover.Trigger>
          </Toolbar.Button>
          <Popover.Portal>
            <Popover.Content
              role="menu"
              aria-label="Shapes"
              className="ink-select-content ink-menu-content"
              data-ink-select-content=""
              data-ink-menu="shape"
              side="bottom"
              align="start"
              sideOffset={4}
              collisionPadding={8}
              onOpenAutoFocus={(e) => {
                e.preventDefault()
                const menu = e.currentTarget as HTMLElement
                if (focusFirst.current) menuItems(menu)[0]?.focus({ preventScroll: true })
                else focusInitialMenuItem(menu)
                focusFirst.current = false
              }}
              onKeyDown={(e) => handleMenuKeys(e.nativeEvent, e.currentTarget)}
            >
              <div
                role="group"
                aria-label="Shapes"
                className="ink-shape-grid"
                data-ink-menu-columns={SHAPE_COLUMNS}
              >
                {model.items.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    role="menuitemradio"
                    aria-checked={item.checked}
                    tabIndex={-1}
                    className="ink-select-item ink-menu-item ink-shape-item"
                    data-ink-select-item=""
                    data-key={item.kind}
                    data-state={item.checked ? 'checked' : 'unchecked'}
                    onClick={() => {
                      setOptions({ kind: item.kind })
                      setTool('shape')
                      setOpen(false)
                    }}
                  >
                    <InkIcon icon={SHAPE_ICONS[item.kind]} size={16} />
                    {item.label}
                  </button>
                ))}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </div>
      </Popover.Anchor>
    </Popover.Root>
  )
}
