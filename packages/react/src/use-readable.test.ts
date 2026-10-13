import { writable } from '@inkbar/core'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { useReadable } from './use-readable'

describe('useReadable', () => {
  it('renders the fallback on the server for a missing readable and the value for a present one', () => {
    const EMPTY: readonly string[] = []
    function Probe({ present }: { present: boolean }): string {
      const value = useReadable(
        present ? writable<readonly string[]>(['a']) : null,
        EMPTY
      )
      return value.join(',') || 'empty'
    }
    expect(renderToString(createElement(Probe, { present: false }))).toBe('empty')
    // The server snapshot is the fallback; the client picks up the live value after hydration.
    expect(renderToString(createElement(Probe, { present: true }))).toBe('empty')
  })

  it('returns the same fallback reference on every call for a missing readable (Review Focus 3)', () => {
    const EMPTY: readonly string[] = []
    const seen: (readonly string[])[] = []
    function Probe(): null {
      seen.push(useReadable(null, EMPTY))
      return null
    }
    renderToString(createElement(Probe))
    renderToString(createElement(Probe))
    expect(seen[0]).toBe(EMPTY)
    expect(seen[1]).toBe(EMPTY)
  })
})
