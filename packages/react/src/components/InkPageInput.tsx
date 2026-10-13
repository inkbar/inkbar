import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
} from 'react'

import { cx } from '../class-names'
import { usePage } from '../hooks/usePage'
import { useLatest } from '../use-latest'

export type InkPageInputProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'value' | 'onChange' | 'type' | 'min' | 'max'
>

export function InkPageInput({
  className,
  onKeyDown: onKeyDownProp,
  ...rest
}: InkPageInputProps) {
  const { current, count, goTo } = usePage()
  const [draft, setDraft] = useState(String(current + 1))
  useEffect(() => {
    setDraft(String(current + 1))
  }, [current])
  const input = useRef<HTMLInputElement>(null)
  const latest = useLatest({ current, count, goTo })

  /** 1-based in the input, 0-based in the viewport. Out of range resets to the current page. */
  const commit = useCallback(
    (value: string) => {
      const { current: page, count: total, goTo: go } = latest.current
      const n = Number(value)
      if (Number.isInteger(n) && n >= 1 && n <= total) {
        if (n - 1 !== page) go(n - 1)
      } else setDraft(String(page + 1))
    },
    [latest]
  )
  // The native `change` event fires when an edit is committed: on blur after typing, and on
  // each step of the spinner or the arrow keys. React's `onChange` is the `input` event, which
  // fires for every keystroke, so the commit listens to the DOM event itself.
  useEffect(() => {
    const el = input.current
    if (!el) return
    const onNativeChange = (): void => commit(el.value)
    el.addEventListener('change', onNativeChange)
    return () => el.removeEventListener('change', onNativeChange)
  }, [commit])

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    onKeyDownProp?.(e)
    if (e.defaultPrevented || e.key !== 'Enter') return
    e.preventDefault()
    commit(draft)
  }
  return (
    <input
      ref={input}
      className={cx('ink-page-input', className)}
      data-ink-page-input=""
      type="number"
      inputMode="numeric"
      aria-label="Page"
      min={1}
      max={count}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      {...rest}
    />
  )
}
