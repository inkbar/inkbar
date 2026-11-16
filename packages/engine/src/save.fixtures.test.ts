import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { fixtureBytes, manifest, type FixtureName } from '@inkbar/fixtures'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createEngine, type Engine } from './index.ts'

import type { SaveMode } from './types.ts'

const run = promisify(execFile)
const MODES: SaveMode[] = ['rewrite', 'incremental']

let engine: Engine
let qpdfAvailable = false

beforeAll(async () => {
  engine = await createEngine({
    wasm: await readFile(new URL('../vendor/inkbar-pdfium.wasm', import.meta.url)),
    worker: false,
  })
  qpdfAvailable = await run('qpdf', ['--version']).then(
    () => true,
    () => false
  )
  if (!qpdfAvailable && process.env.CI) {
    throw new Error('qpdf is required in CI and was not found on PATH.')
  }
})

afterAll(async () => {
  await engine.destroy()
})

async function pdfjsPageCount(saved: Uint8Array, password?: string): Promise<number> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(saved), password })
  try {
    return (await task.promise).numPages
  } finally {
    await task.destroy()
  }
}

async function qpdfCheck(
  saved: Uint8Array,
  password?: string
): Promise<{ ok: true } | { ok: false; output: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'inkbar-qpdf-'))
  const file = join(dir, 'saved.pdf')
  try {
    await writeFile(file, saved)
    const args = ['--check', ...(password ? [`--password=${password}`] : []), file]
    const result = await run('qpdf', args).then(
      ({ stdout, stderr }) => ({ code: 0, output: stdout + stderr }),
      (e: { code?: number; stdout?: string; stderr?: string }) => ({
        code: typeof e.code === 'number' ? e.code : -1,
        output: (e.stdout ?? '') + (e.stderr ?? ''),
      })
    )
    const hasError = /(^|\n)[^\n]*\berror\b/i.test(
      result.output.replace(/no errors/gi, '')
    )
    return (result.code === 0 || result.code === 3) && !hasError
      ? { ok: true }
      : { ok: false, output: result.output }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const openable = Object.entries(manifest).filter(([, meta]) => meta.opens) as [
  FixtureName,
  (typeof manifest)[FixtureName],
][]

describe.each(openable)('%s', (name, meta) => {
  describe.each(MODES)('save (%s)', (mode) => {
    const recorded =
      mode === 'rewrite' ? meta.engine?.saveRewrite : meta.engine?.saveIncremental
    const title = recorded
      ? `${name} saves (${mode}) as recorded: ${recorded}`
      : `${name} saves (${mode}) and reopens`

    test(title, async () => {
      const doc = await engine.open(
        await fixtureBytes(name),
        meta.password ? { password: meta.password } : {}
      )
      try {
        let saved: Uint8Array
        try {
          saved = await doc.save({ mode })
        } catch (error) {
          if (recorded) return
          throw error
        }
        const again = await engine.open(
          saved,
          meta.password ? { password: meta.password } : {}
        )
        expect(again.pageCount).toBe(meta.pages)
        await again.close()
        expect(await pdfjsPageCount(saved, meta.password)).toBe(meta.pages)
        if (!qpdfAvailable) return // qpdf is not on PATH; CI installs it and fails without it
        expect(await qpdfCheck(saved, meta.password)).toEqual({ ok: true })
      } finally {
        await doc.close()
      }
    })
  })
})

describe.each(['encrypted-aes', 'encrypted-rc4'] as const)('%s', (name) => {
  test.each(MODES)('a file saved (%s) still needs the password', async (mode) => {
    const password = manifest[name].password
    const doc = await engine.open(await fixtureBytes(name), password ? { password } : {})
    const saved = await doc.save({ mode })
    await doc.close()
    await expect(engine.open(saved)).rejects.toMatchObject({ code: 'password-required' })
  })
})
