import {
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
} from 'react'

import { cx } from '../class-names'
import { usePage } from '../hooks/usePage'

export type InkPageInputProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'value' | 'onChange' | 'type' | 'min' | 'max'
>

export function InkPageInput({
  className,
  onBlur,
  onKeyDown: onKeyDownProp,
  ...rest
}: InkPageInputProps) {
  const { current, count, goTo } = usePage()
  const [draft, setDraft] = useState(String(current + 1))
  useEffect(() => {
    setDraft(String(current + 1))
  }, [current])

  /** 1-based in the input, 0-based in the viewport. Out of range resets to the current page. */
  function commit(): void {
    const n = Number(draft)
    if (Number.isInteger(n) && n >= 1 && n <= count) goTo(n - 1)
    else setDraft(String(current + 1))
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    onKeyDownProp?.(e)
    if (e.defaultPrevented || e.key !== 'Enter') return
    e.preventDefault()
    commit()
  }
  return (
    <input
      className={cx('ink-page-input', className)}
      data-ink-page-input=""
      type="number"
      inputMode="numeric"
      aria-label="Page"
      min={1}
      max={count}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        onBlur?.(e)
        // Only an edit commits on blur; a plain focus-then-blur must not move the viewport.
        if (!e.defaultPrevented && draft !== String(current + 1)) commit()
      }}
      onKeyDown={onKeyDown}
      {...rest}
    />
  )
}
