// Core builds its schemas, and Gloss's, with Zod's `jitless` on, so none probes whether it may
// compile code, and then puts the setting back as it found it: it is global to every copy of
// Zod 4 on the page, and a host's own schemas are the host's.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

const PACKAGE = fileURLToPath(new URL('../../..', import.meta.url))

type Before = 'unset' | 'true' | 'false'
type Event = ['get', unknown] | ['set', unknown] | ['delete']

/**
 * Imports the built package in a new Node process, with `jitless` as `before` says, through a
 * global Zod config that records each read and write of `jitless` while the package loads.
 */
function loadBuilt(before: Before): {
  events: Event[]
  after: { set: boolean; value?: unknown }
  core: boolean
  gloss: boolean
  glossRejects: boolean
} {
  const script = `
    const before = process.env.JITLESS_BEFORE
    const settings = before === 'unset' ? {} : { jitless: before === 'true' }
    const events = []
    let loading = true
    globalThis.__zod_globalConfig = new Proxy(settings, {
      get(t, k, r) {
        if (k === 'jitless' && loading) events.push(['get', t.jitless])
        return Reflect.get(t, k, r)
      },
      set(t, k, v, r) {
        if (k === 'jitless' && loading) events.push(['set', v])
        return Reflect.set(t, k, v, r)
      },
      deleteProperty(t, k) {
        if (k === 'jitless' && loading) events.push(['delete'])
        return Reflect.deleteProperty(t, k)
      },
    })
    const core = await import('@inkbar/core')
    loading = false
    const gloss = await import('gloss-format')
    const after = Object.hasOwn(settings, 'jitless')
      ? { set: true, value: settings.jitless }
      : { set: false }
    console.log(JSON.stringify({
      events,
      after,
      core: core.FringeSchema.safeParse({ left: 1, top: 2, right: 3, bottom: 4 }).success,
      gloss: gloss.Rect.safeParse({ x: 1, y: 2, width: 3, height: 4 }).success,
      glossRejects: !gloss.Rect.safeParse({ x: 'a' }).success,
    }))
  `
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: PACKAGE,
    env: { ...process.env, JITLESS_BEFORE: before },
    encoding: 'utf8',
  })
  return JSON.parse(out) as ReturnType<typeof loadBuilt>
}

const found = (before: Before) =>
  before === 'unset' ? { set: false } : { set: true, value: before === 'true' }

describe('the built package', () => {
  for (const before of ['unset', 'true', 'false'] as const) {
    it(`builds every schema with jitless on and puts back ${before}`, () => {
      const { events, after, core, gloss, glossRejects } = loadBuilt(before)
      const on = events.findIndex(([kind, value]) => kind === 'set' && value === true)
      const off =
        events.length - 1 - [...events].reverse().findIndex(([kind]) => kind !== 'get')
      expect(on).toBeGreaterThanOrEqual(0)
      expect(off).toBeGreaterThan(on)
      // Before the setting goes on, only core's own look at what it finds: no schema, Gloss's
      // included, is built yet.
      expect(events.slice(0, on)).toEqual(
        before === 'unset' ? [] : [['get', before === 'true']]
      )
      // Every object schema, Gloss's and core's, reads `jitless` when it is built: all read it on.
      const built = events.slice(on + 1, off)
      expect(built.length).toBeGreaterThan(20)
      expect(built.every(([kind, value]) => kind === 'get' && value === true)).toBe(true)
      expect(events.slice(off + 1)).toEqual([])
      expect(events[off]).toEqual(
        before === 'unset' ? ['delete'] : ['set', before === 'true']
      )
      expect(after).toEqual(found(before))
      expect([core, gloss, glossRejects]).toEqual([true, true, true])
    })
  }
})

describe('the source', () => {
  for (const before of ['unset', 'true', 'false'] as const) {
    it(`puts back ${before} once core is imported`, async () => {
      const { config } = await import('zod')
      const settings = config()
      if (before === 'unset') delete settings.jitless
      else settings.jitless = before === 'true'
      vi.resetModules()
      const core = await import('../../index')
      const gloss = await import('gloss-format')
      expect(
        Object.hasOwn(settings, 'jitless')
          ? { set: true, value: settings.jitless }
          : { set: false }
      ).toEqual(found(before))
      expect(
        core.FringeSchema.safeParse({ left: 1, top: 2, right: 3, bottom: 4 }).success
      ).toBe(true)
      expect(core.FringeSchema.safeParse({ left: 'a' }).success).toBe(false)
      expect(gloss.Rect.safeParse({ x: 1, y: 2, width: 3, height: 4 }).success).toBe(true)
      delete settings.jitless
    })
  }
})
