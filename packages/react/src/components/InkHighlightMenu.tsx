/*
 * A split button for the highlight tool. The main part activates the tool with the current
 * markup kind and draws that kind's icon; the chevron opens a menu of the four kinds plus
 * the markup colour. Choosing a kind switches to the tool with it. The colour is a nested
 * `InkColorMenu` scoped to the `markup` style group, so it works whatever tool is active.
 */
import {
  focusInitialMenuItem,
  handleMenuKeys,
  highlightMenuModel,
  MARKUP_ICONS,
  MARKUP_KINDS,
  menuItems,
  type HighlightOptions,
} from '@inkbar/core/dom'
import { ChevronDown } from '@inkbar/icons'
import { Popover, Toolbar } from 'radix-ui'
import { useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'

import { cx } from '../class-names'
import { useTool } from '../hooks/useTool'
import { useToolOptions } from '../hooks/useToolOptions'

import { InkColorMenu } from './InkColorMenu'
import { InkIcon } from './InkIcon'

export interface InkHighlightMenuProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'children'
> {
  /** Replaces the main button's icon. */
  children?: ReactNode
}

export function InkHighlightMenu({
  className,
  children,
  ...rest
}: InkHighlightMenuProps) {
  const { tool, setTool } = useTool()
  const [options, setOptions] = useToolOptions<HighlightOptions>('highlight')
  const [open, setOpen] = useState(false)
  const model = highlightMenuModel(options, MARKUP_KINDS)
  const active = tool === 'highlight'
  /** ArrowDown opens on the first item; a click opens on the checked one. */
  const focusFirst = useRef(false)
  return (
    <div
      role="group"
      aria-label="Highlight"
      className={cx('ink-split-button ink-highlight-menu', className)}
      data-ink-highlight-menu=""
      {...rest}
    >
      <Toolbar.Button
        className="ink-tool-button ink-highlight-button"
        data-ink-tool-button=""
        data-ink-highlight-button=""
        data-tool="highlight"
        data-kind={model.kind}
        data-state={active ? 'on' : 'off'}
        aria-pressed={active}
        aria-label={model.label}
        title={model.label}
        onClick={() => setTool('highlight')}
      >
        {children ?? <InkIcon icon={MARKUP_ICONS[model.kind]} />}
      </Toolbar.Button>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Toolbar.Button asChild>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="ink-menu-trigger ink-highlight-menu-trigger"
              data-ink-highlight-menu-trigger=""
              data-state={open ? 'open' : 'closed'}
              aria-label="Choose highlight"
              title="Choose highlight"
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
            aria-label="Highlights"
            className="ink-select-content ink-menu-content"
            data-ink-select-content=""
            data-ink-menu="highlight"
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
            // Capture, so the arrow keys move on from the colour item before its own
            // ArrowDown opens the nested menu; keys from that menu's portalled panel, which
            // bubble here through React, are its own.
            onKeyDownCapture={(e) => {
              if (e.currentTarget.contains(e.target as Node))
                handleMenuKeys(e.nativeEvent, e.currentTarget)
            }}
          >
            <div role="group" aria-label="Kinds" className="ink-highlight-kinds">
              {model.items.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  role="menuitemradio"
                  aria-checked={item.checked}
                  tabIndex={-1}
                  className="ink-select-item ink-menu-item ink-highlight-item"
                  data-ink-select-item=""
                  data-key={item.kind}
                  data-state={item.checked ? 'checked' : 'unchecked'}
                  onClick={() => {
                    setOptions({ kind: item.kind })
                    setTool('highlight')
                    setOpen(false)
                  }}
                >
                  <InkIcon icon={MARKUP_ICONS[item.kind]} size={16} />
                  {item.label}
                </button>
              ))}
            </div>
            <div role="separator" className="ink-select-separator" />
            <div role="group" aria-label="Colour" className="ink-highlight-colour">
              <span className="ink-highlight-colour-label" aria-hidden="true">
                Colour
              </span>
              <InkColorMenu
                property="border"
                group="markup"
                label="Highlight colour"
                standalone
                role="menuitem"
                tabIndex={-1}
              />
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
