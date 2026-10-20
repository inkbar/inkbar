import { fixtureBytes } from '@inkbar/fixtures'
import { describe, expect, it } from 'vitest'

import { readXref } from './xref'

describe('readXref', () => {
  it('reads object-stream fixtures through their xref stream', async () => {
    const xref = await readXref(await fixtureBytes('object-streams'))
    expect(xref).toBeDefined()
    const kinds = new Set([...xref!.entries.values()].map((e) => e.type))
    expect(kinds.has('compressed')).toBe(true)
    expect(xref!.trailer.entries.has('Root')).toBe(true)
  })

  it('follows /Prev with the newest entry first', async () => {
    const xref = await readXref(await fixtureBytes('incremental-saved'))
    expect(xref?.trailer.entries.has('Prev')).toBe(true)
    expect(xref!.entries.size).toBeGreaterThan(2)
  })

  it('returns undefined when the xref cannot be read', async () => {
    expect(await readXref(await fixtureBytes('malformed-truncated'))).toBeUndefined()
    expect(await readXref(await fixtureBytes('malformed-missing-xref'))).toBeUndefined()
  })

  it('survives a /Prev loop', async () => {
    const head = '%PDF-1.4\n'
    const text = `${head}xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 /Prev ${head.length} >>\nstartxref\n${head.length}\n%%EOF\n`
    const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0))
    expect((await readXref(bytes))?.entries.size).toBe(1)
  })
})
