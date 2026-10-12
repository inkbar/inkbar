import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { build, createServer, resolveConfig } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'

import { inkbar } from './index'

import type { InkbarPluginOptions } from './index'

const pdfjsRoot = dirname(
  createRequire(import.meta.url).resolve('pdfjs-dist/package.json')
)
const workerFile = join(pdfjsRoot, 'build', 'pdf.worker.min.mjs')
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

const dirs: string[] = []

function project() {
  const dir = mkdtempSync(join(tmpdir(), 'inkbar-vite-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'index.html'), '<script type="module" src="/main.ts"></script>')
  writeFileSync(
    join(dir, 'main.ts'),
    "import { assets } from 'virtual:inkbar-assets'\nconsole.log(assets)\n"
  )
  return dir
}

/** Resolves a build config and returns what the virtual module exports under it. */
async function virtualAssets(base: string, options?: InkbarPluginOptions) {
  const config = await resolveConfig(
    { root: project(), base, logLevel: 'silent', plugins: [inkbar(options)] },
    'build'
  )
  const plugin = config.plugins.find((p) => p.name === 'inkbar-assets')!
  const resolveId = plugin.resolveId as (id: string) => string | undefined
  const load = plugin.load as (id: string) => string | undefined
  const id = resolveId('virtual:inkbar-assets')!
  const code = load(id)!
  const json = code.slice(code.indexOf('{'), code.lastIndexOf('}') + 1)
  return JSON.parse(json) as Record<string, string>
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('inkbar vite plugin', () => {
  it('copies PDF.js assets into the build untouched and emits URLs under base', async () => {
    const root = project()
    await build({
      root,
      base: '/app/',
      logLevel: 'silent',
      plugins: [inkbar()],
      build: { outDir: 'dist' },
    })
    const out = join(root, 'dist', 'inkbar')
    expect(sha(readFileSync(join(out, 'pdf.worker.min.mjs')))).toBe(
      sha(readFileSync(workerFile))
    )
    expect(readdirSync(join(out, 'cmaps')).length).toBeGreaterThan(100)
    expect(readdirSync(join(out, 'standard_fonts')).length).toBeGreaterThan(10)
    expect(readdirSync(join(out, 'wasm')).length).toBeGreaterThan(0)
    expect(readdirSync(join(out, 'iccs')).length).toBeGreaterThan(0)
    const js = readdirSync(join(root, 'dist', 'assets')).find((f) => f.endsWith('.js'))!
    const bundle = readFileSync(join(root, 'dist', 'assets', js), 'utf8')
    expect(bundle).toContain('/app/inkbar/pdf.worker.min.mjs')
    expect(bundle).toContain('/app/inkbar/cmaps/')
  })

  it('copies into a custom assetsDir', async () => {
    const root = project()
    await build({
      root,
      logLevel: 'silent',
      plugins: [inkbar({ assetsDir: '/static/pdf/' })],
      build: { outDir: 'dist' },
    })
    expect(existsSync(join(root, 'dist', 'static', 'pdf', 'pdf.worker.min.mjs'))).toBe(
      true
    )
    expect(existsSync(join(root, 'dist', 'inkbar'))).toBe(false)
  })

  it('builds virtual module URLs from the resolved base and assetsDir', async () => {
    expect(await virtualAssets('/app/')).toEqual({
      worker: '/app/inkbar/pdf.worker.min.mjs',
      cMaps: '/app/inkbar/cmaps/',
      standardFonts: '/app/inkbar/standard_fonts/',
      wasm: '/app/inkbar/wasm/',
      icc: '/app/inkbar/iccs/',
    })
    const custom = await virtualAssets('/app', { assetsDir: 'pdf' })
    expect(custom.worker).toBe('/app/pdf/pdf.worker.min.mjs')
    expect(custom.icc).toBe('/app/pdf/iccs/')
  })

  it('serves assets in dev untransformed and resolves the virtual module', async () => {
    const root = project()
    const server = await createServer({
      root,
      logLevel: 'silent',
      plugins: [inkbar({ assetsDir: 'pdf' })],
      server: { port: 0 },
    })
    await server.listen()
    try {
      const origin = server.resolvedUrls!.local[0]!.replace(/\/$/, '')
      const res = await fetch(`${origin}/pdf/pdf.worker.min.mjs`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('javascript')
      expect(sha(new Uint8Array(await res.arrayBuffer()))).toBe(
        sha(readFileSync(workerFile))
      )
      const cmap = await fetch(`${origin}/pdf/cmaps/Adobe-Japan1-UCS2.bcmap`)
      expect(cmap.status).toBe(200)
      await cmap.arrayBuffer()
      const escape = await fetch(`${origin}/pdf/..%2Fpackage.json`)
      expect(await escape.text()).not.toContain('"name": "pdfjs-dist"')
      const mod = await server.ssrLoadModule('virtual:inkbar-assets')
      expect(mod.assets).toEqual({
        worker: '/pdf/pdf.worker.min.mjs',
        cMaps: '/pdf/cmaps/',
        standardFonts: '/pdf/standard_fonts/',
        wasm: '/pdf/wasm/',
        icc: '/pdf/iccs/',
      })
    } finally {
      await server.close()
    }
  })

  it('serves assets under a non-root base in dev', async () => {
    const root = project()
    const server = await createServer({
      root,
      base: '/app/',
      logLevel: 'silent',
      plugins: [inkbar()],
      server: { port: 0 },
    })
    await server.listen()
    try {
      const url = new URL('inkbar/pdf.worker.min.mjs', server.resolvedUrls!.local[0])
      expect(url.pathname).toBe('/app/inkbar/pdf.worker.min.mjs')
      const res = await fetch(url)
      expect(res.status).toBe(200)
      expect(sha(new Uint8Array(await res.arrayBuffer()))).toBe(
        sha(readFileSync(workerFile))
      )
    } finally {
      await server.close()
    }
  })
})
