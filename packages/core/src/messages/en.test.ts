import { describe, expect, it } from 'vitest'

import { en } from './en'

describe('en', () => {
  it('renders the numbers every function key is given', () => {
    const nf = new Intl.NumberFormat('en')
    let checked = 0
    for (const [group, keys] of Object.entries(en)) {
      for (const [key, value] of Object.entries(keys as Record<string, unknown>)) {
        if (typeof value === 'string') {
          expect(value, `${group}.${key}`).not.toBe('')
          continue
        }
        const fn = value as ((p: Record<string, string | number>) => string) & {
          source: { text?: string; param?: string; forms?: Record<string, string> }
        }
        expect(typeof fn, `${group}.${key}`).toBe('function')
        const text = fn.source.text ?? Object.values(fn.source.forms!).join(' ')
        const names = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)
        for (const n of [0, 1, 2, 1000]) {
          const params: Record<string, string | number> = {}
          for (const name of new Set(names)) {
            // A name param takes a string; the rest take the number.
            params[name] = ['name', 'author', 'label', 'badge', 'kind'].includes(name)
              ? 'Ann'
              : n
          }
          const out = fn(params)
          expect(out, `${group}.${key}`).not.toBe('')
          for (const [name, v] of Object.entries(params)) {
            expect(out, `${group}.${key}`).toContain(
              typeof v === 'number' ? nf.format(v) : v
            )
            expect(name).toBeTruthy()
          }
        }
        checked++
      }
    }
    expect(checked).toBeGreaterThan(10)
  })
})
