/*
 * Line weight, solid or dashed, and arrowheads, for the selection or the active tool. Each
 * section disables when nothing selected (or no active tool) supports its props. The trigger
 * carries `data-mixed` when the selection disagrees on any of them; a section with no single
 * value shows no checkmark.
 */
import {
  focusInitialMenuItem,
  handleMenuKeys,
  lineStyleMenuModel,
  menuItems,
} from '@inkbar/core/dom'
import { Check, Minus } from '@inkbar/icons'
import { Popover, Toolbar } from 'radix-ui'
import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'

import { cx } from '../class-names'
import { useToolStyle } from '../hooks/useToolStyle'

import { InkIcon } from './InkIcon'

export interface InkLineStyleMenuProps extends Omit<
  ComponentPropsWithoutRef<'button'>,
  'children'
> {
  children?: ReactNode
}

interface ItemProps {
  label: string
  checked: boolean
  disabled: boolean
  onSelect: () => void
  children?: ReactNode
}

function Item({ label, checked, disabled, onSelect, children }: ItemProps) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      disabled={disabled}
      tabIndex={-1}
      className="ink-select-item ink-menu-item"
      data-ink-select-item=""
      data-state={checked ? 'checked' : 'unchecked'}
      onClick={onSelect}
    >
      {children ?? label}
      {checked ? (
        <span className="ink-select-indicator">
          <InkIcon icon={Check} size={16} />
        </span>
      ) : null}
    </button>
  )
}

function Group({
  label,
  disabled,
  children,
}: {
  label: string
  disabled: boolean
  children: ReactNode
}) {
  return (
    <div
      role="group"
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-disabled={disabled ? '' : undefined}
      className="ink-menu-group"
    >
      <div className="ink-menu-label" aria-hidden="true">
        {label}
      </div>
      {children}
    </div>
  )
}

export function InkLineStyleMenu({
  className,
  children,
  disabled,
  ...rest
}: InkLineStyleMenuProps) {
  const { current, supported, set } = useToolStyle()
  const [open, setOpen] = useState(false)
  const model = lineStyleMenuModel(current, supported)
  /** ArrowDown opens on the first item; a click opens on the checked one. */
  const focusFirst = useRef(false)
  // The menu closes when the control disables (the selection cleared while it was open).
  useEffect(() => {
    if (!model.enabled) setOpen(false)
  }, [model.enabled])
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Toolbar.Button asChild>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cx('ink-menu-trigger ink-line-style-menu', className)}
            data-ink-line-style-menu=""
            data-state={open ? 'open' : 'closed'}
            data-mixed={model.mixed ? '' : undefined}
            aria-label="Line style"
            title="Line style"
            aria-haspopup="menu"
            disabled={disabled === true || !model.enabled}
            {...rest}
            onKeyDown={(e) => {
              rest.onKeyDown?.(e)
              if (e.key !== 'ArrowDown' || e.defaultPrevented || open || !model.enabled)
                return
              e.preventDefault()
              focusFirst.current = true
              setOpen(true)
            }}
          >
            {children ?? <InkIcon icon={Minus} />}
          </button>
        </Popover.Trigger>
      </Toolbar.Button>
      <Popover.Portal>
        <Popover.Content
          role="menu"
          aria-label="Line style"
          className="ink-select-content ink-menu-content"
          data-ink-select-content=""
          data-ink-menu="line-style"
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
          {model.sections.map((section) => (
            <Group key={section.label} label={section.label} disabled={section.disabled}>
              {section.items.map((item) => (
                <Item
                  key={item.key}
                  label={item.label}
                  checked={item.checked}
                  disabled={section.disabled}
                  onSelect={() => set(item.patch)}
                />
              ))}
            </Group>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
