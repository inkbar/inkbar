import { Search } from '@inkbar/icons'
import { Toolbar } from 'radix-ui'
import { flushSync } from 'react-dom'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { useDocument } from '../hooks/useDocument'
import { useSearch } from '../hooks/useSearch'

import { InkIcon } from './InkIcon'

import type { ComponentPropsWithoutRef } from 'react'

export type InkSearchButtonProps = ComponentPropsWithoutRef<typeof Toolbar.Button>

/**
 * Opens the find bar; pressed while it is open. Pressing it again focuses the field. Place it
 * in a toolbar next to `InkFindBar`, which it needs for the field to focus. Disabled until a
 * document is open.
 */
export function InkSearchButton({
  asChild = false,
  className,
  children,
  onClick,
  ...rest
}: InkSearchButtonProps) {
  const { rootEl } = useInkContext('InkSearchButton')
  const { state, open } = useSearch()
  const { isReady } = useDocument()
  return (
    <Toolbar.Button
      asChild={asChild}
      className={cx('ink-search-button', className)}
      data-ink-search-button=""
      aria-label="Find"
      title="Find"
      aria-pressed={state.open}
      data-state={state.open ? 'on' : 'off'}
      disabled={!isReady}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented) return
        // The bar shows once this render commits; its field takes focus then.
        flushSync(() => open())
        const field = rootEl?.querySelector<HTMLInputElement>('[data-ink-find-bar] input')
        field?.focus()
        field?.select()
      }}
    >
      {children ?? <InkIcon icon={Search} />}
    </Toolbar.Button>
  )
}
