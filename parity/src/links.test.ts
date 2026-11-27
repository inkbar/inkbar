import { describe, expect, it } from 'vitest'

import { resolveLinks } from './links'

import type { PageLink } from '@inkbar/core'

const link = (id: string, extra: Partial<PageLink> = {}): PageLink => ({
  id,
  page: 0,
  rect: { x: 10, y: 20, width: 100, height: 12 },
  order: 0,
  target: { kind: 'url', url: 'https://example.com/', newWindow: false },
  ...extra,
})

describe('resolveLinks', () => {
  it('replaces an explicit destination with where it resolves', async () => {
    const [a] = await resolveLinks(
      [link('a', { target: { kind: 'dest', raw: [1, { name: 'XYZ' }, 0, 700, null] } })],
      (raw) =>
        Promise.resolve({
          page: (raw as number[])[0]!,
          fit: 'xyz' as const,
          left: 0,
          top: 700,
        })
    )
    expect(a!.target).toEqual({
      kind: 'resolved',
      dest: { page: 1, fit: 'xyz', left: 0, top: 700 },
    })
  })

  it('leaves a link that is not a destination as it is', async () => {
    const url = link('a')
    const [a] = await resolveLinks([url], () => Promise.reject(new Error('not asked')))
    expect(a).toBe(url)
  })

  it('keeps the name of a named destination that does not resolve', async () => {
    const raw = { kind: 'dest' as const, raw: 'nowhere' }
    const [a] = await resolveLinks([link('a', { target: raw })], () =>
      Promise.resolve(undefined)
    )
    expect(a!.target).toEqual(raw)
  })

  it('empties an explicit destination that does not resolve', async () => {
    const [a] = await resolveLinks(
      [link('a', { target: { kind: 'dest', raw: [-1, { name: 'Fit' }] } })],
      () => Promise.resolve(undefined)
    )
    expect(a!.target).toEqual({ kind: 'dest', raw: [] })
  })
})
