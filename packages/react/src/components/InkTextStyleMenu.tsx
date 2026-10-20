/*
 * Font, size, text colour, bold, italic, underline and alignment for the selected text boxes or
 * the text tool. A popover panel rather than a menu list: it holds a select, a number input
 * with a stepper, toggle buttons and a radio group, each named and operable on its own. The
 * trigger carries `data-mixed` when the selection disagrees on any of them.
 */
import { handleRadioKeys, textStyleMenuModel } from '@inkbar/core/dom'
import {
  ALargeSmall,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Minus,
  Plus,
  Underline,
} from '@inkbar/icons'
import { Popover, Toolbar } from 'radix-ui'
import { useEffect, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { useToolStyle } from '../hooks/useToolStyle'

import { InkColorMenu } from './InkColorMenu'
import { InkIcon } from './InkIcon'

export interface InkTextStyleMenuProps extends Omit<
  ComponentPropsWithoutRef<'button'>,
  'children'
> {
  children?: ReactNode
}

const TOGGLE_ICONS = { bold: Bold, italic: Italic, underline: Underline }
const ALIGN_ICONS = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  justify: AlignJustify,
}

export function InkTextStyleMenu({
  className,
  children,
  ...rest
}: InkTextStyleMenuProps) {
  const { fonts } = useInkContext('InkTextStyleMenu')
  const { current, supported, set } = useToolStyle()
  const [open, setOpen] = useState(false)
  /** The size as typed, until it is committed with Enter or blur. */
  const [draft, setDraft] = useState<string | null>(null)
  const model = textStyleMenuModel(current, supported, fonts)
  // The menu closes when the control disables (the selection cleared while it was open).
  useEffect(() => {
    if (!model.enabled) setOpen(false)
  }, [model.enabled])

  const commitSize = () => {
    if (draft === null) return
    if (draft.trim() !== '') {
      const patch = model.size.commit(Number(draft))
      if (patch) set(patch)
    }
    setDraft(null)
  }
  const nudge = (direction: 1 | -1) => {
    const patch = model.size.nudge(direction)
    if (patch) set(patch)
    setDraft(null)
  }
  const sizeShown = draft ?? (model.size.value === null ? '' : String(model.size.value))

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Toolbar.Button asChild>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cx('ink-menu-trigger ink-text-style-menu', className)}
            data-ink-text-style-menu=""
            data-state={open ? 'open' : 'closed'}
            data-mixed={model.mixed ? '' : undefined}
            aria-label={model.label}
            title={model.label}
            aria-haspopup="dialog"
            disabled={!model.enabled}
            {...rest}
            onKeyDown={(e) => {
              rest.onKeyDown?.(e)
              if (e.key !== 'ArrowDown' || e.defaultPrevented || open || !model.enabled)
                return
              e.preventDefault()
              setOpen(true)
            }}
          >
            {children ?? <InkIcon icon={ALargeSmall} />}
          </button>
        </Popover.Trigger>
      </Toolbar.Button>
      <Popover.Portal>
        <Popover.Content
          aria-label={model.label}
          className="ink-select-content ink-menu-content ink-text-style-content"
          data-ink-select-content=""
          data-ink-menu="text-style"
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
        >
          <select
            className="ink-text-style-font"
            aria-label={model.font.label}
            value={model.font.value}
            onChange={(e) => set(model.font.patch(e.target.value))}
          >
            {model.font.value === '' ? (
              <option value="" disabled hidden>
                Mixed
              </option>
            ) : null}
            {model.font.options.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <div className="ink-text-style-row">
            <InkColorMenu property="textColor" standalone />
            <div className="ink-text-style-size" role="group" aria-label="Size">
              <button
                type="button"
                className="ink-text-style-button"
                aria-label="Decrease font size"
                onClick={() => nudge(-1)}
              >
                <InkIcon icon={Minus} size={16} />
              </button>
              <input
                type="number"
                className="ink-text-style-input"
                aria-label={model.size.label}
                min={model.size.min}
                max={model.size.max}
                step={model.size.step}
                value={sizeShown}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitSize}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitSize()
                  }
                }}
              />
              <button
                type="button"
                className="ink-text-style-button"
                aria-label="Increase font size"
                onClick={() => nudge(1)}
              >
                <InkIcon icon={Plus} size={16} />
              </button>
            </div>
          </div>
          <div className="ink-text-style-row" role="group" aria-label="Emphasis">
            {model.toggles.map((t) => (
              <button
                key={t.key}
                type="button"
                className="ink-text-style-button"
                aria-label={t.label}
                title={t.label}
                aria-pressed={t.pressed}
                data-state={t.pressed === true ? 'on' : 'off'}
                data-mixed={t.pressed === 'mixed' ? '' : undefined}
                onClick={() => set(t.patch)}
              >
                <InkIcon icon={TOGGLE_ICONS[t.key]} size={16} />
              </button>
            ))}
          </div>
          <div
            className="ink-text-style-row"
            role="radiogroup"
            aria-label={model.align.label}
            onKeyDown={(e) => handleRadioKeys(e.nativeEvent, e.currentTarget)}
          >
            {model.align.choices.map((c) => (
              <button
                key={c.key}
                type="button"
                role="radio"
                className="ink-text-style-button"
                aria-label={c.label}
                title={c.label}
                aria-checked={c.checked}
                tabIndex={c.tabStop ? 0 : -1}
                data-state={c.checked ? 'on' : 'off'}
                onClick={() => set(c.patch)}
              >
                <InkIcon icon={ALIGN_ICONS[c.key]} size={16} />
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
