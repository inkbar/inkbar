/*
 * A colour menu for one colour property (border, fill or text) of the selection or the active
 * tool. The trigger shows the current colour as a swatch: split when the selection disagrees,
 * slashed for no fill. The panel is a palette grid, plus "No fill" for `fill` and "Custom…",
 * which opens a native colour input. The menu disables when nothing supports the property.
 */
import {
  COLOR_COLUMNS,
  colorMenuModel,
  focusInitialMenuItem,
  handleMenuKeys,
  menuItems,
  type ColorProperty,
} from '@inkbar/core/dom'
import { Check } from '@inkbar/icons'
import { Popover, Toolbar } from 'radix-ui'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
} from 'react'

import { cx } from '../class-names'
import { useToolStyle } from '../hooks/useToolStyle'

import { InkIcon } from './InkIcon'

export interface InkColorMenuProps extends Omit<
  ComponentPropsWithoutRef<'button'>,
  'children'
> {
  /** The colour this menu sets. */
  property: ColorProperty
  /** Accessible name; defaults to "Border colour", "Fill colour" or "Text colour". */
  label?: string
  /** Replaces the swatch. */
  children?: ReactNode
}

export function InkColorMenu({
  property,
  label,
  className,
  children,
  ...rest
}: InkColorMenuProps) {
  const { current, supported, set } = useToolStyle()
  const [open, setOpen] = useState(false)
  const model = colorMenuModel(property, current, supported)
  const name = label ?? model.label
  /** ArrowDown opens on the first item; a click opens on the checked one. */
  const focusFirst = useRef(false)
  const input = useRef<HTMLInputElement | null>(null)
  // The native `change` fires once the picker commits; React's `onChange` fires on every drag.
  const apply = useRef((_hex: string) => {})
  apply.current = (hex) => set(model.custom(hex))
  const bindInput = useCallback((el: HTMLInputElement | null) => {
    input.current = el
    el?.addEventListener('change', () => apply.current(el.value))
  }, [])
  // The input outlives the panel, so it follows the current colour rather than mount time.
  useEffect(() => {
    if (input.current) input.current.value = model.customValue.toLowerCase()
  }, [model.customValue])
  // The menu closes when the control disables (the selection cleared while it was open).
  useEffect(() => {
    if (!model.enabled) setOpen(false)
  }, [model.enabled])
  const trigger = model.trigger
  const swatchStyle =
    trigger.kind === 'color'
      ? ({ '--ink-swatch': trigger.color } as CSSProperties)
      : undefined
  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Toolbar.Button asChild>
          <Popover.Trigger asChild>
            <button
              type="button"
              className={cx('ink-menu-trigger ink-color-menu', className)}
              data-ink-color-menu={property}
              data-state={open ? 'open' : 'closed'}
              data-mixed={model.mixed ? '' : undefined}
              aria-label={name}
              title={name}
              aria-haspopup="menu"
              disabled={!model.enabled}
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
              {children ?? (
                <span
                  className="ink-swatch"
                  data-ink-swatch=""
                  data-property={property}
                  data-kind={trigger.kind}
                  data-color={trigger.kind === 'color' ? trigger.color : undefined}
                  style={swatchStyle}
                  aria-hidden="true"
                />
              )}
            </button>
          </Popover.Trigger>
        </Toolbar.Button>
        <Popover.Portal>
          <Popover.Content
            role="menu"
            aria-label={name}
            className="ink-select-content ink-menu-content"
            data-ink-select-content=""
            data-ink-menu={`color-${property}`}
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
            {model.noFill ? (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={model.noFill.checked}
                tabIndex={-1}
                className="ink-select-item ink-menu-item"
                data-ink-select-item=""
                data-state={model.noFill.checked ? 'checked' : 'unchecked'}
                onClick={() => set(model.noFill!.patch)}
              >
                No fill
                {model.noFill.checked ? (
                  <span className="ink-select-indicator">
                    <InkIcon icon={Check} size={16} />
                  </span>
                ) : null}
              </button>
            ) : null}
            <div
              role="group"
              aria-label="Colours"
              className="ink-color-grid"
              data-ink-menu-columns={COLOR_COLUMNS}
            >
              {model.swatches.map((sw) => (
                <button
                  key={sw.key}
                  type="button"
                  role="menuitemradio"
                  aria-label={sw.label}
                  aria-checked={sw.checked}
                  tabIndex={-1}
                  className="ink-swatch-item"
                  data-state={sw.checked ? 'checked' : 'unchecked'}
                  style={{ '--ink-swatch': sw.color } as CSSProperties}
                  onClick={() => set(sw.patch)}
                />
              ))}
            </div>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="ink-select-item ink-menu-item"
              data-ink-select-item=""
              onClick={() => input.current?.click()}
            >
              Custom…
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <input
        ref={bindInput}
        type="color"
        className="ink-color-input"
        aria-label="Custom colour"
        data-ink-color-input={property}
        tabIndex={-1}
        defaultValue={model.customValue.toLowerCase()}
      />
    </>
  )
}
