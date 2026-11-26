import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { fontFiles } from '@inkbar/fonts'
import { build, createServer, resolveConfig } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'

import pkg from '../../package.json' with { type: 'json' }

import { inkbar } from './index'

import type { InkbarPluginOptions } from './index'
import type { PdfAssets } from '../model/assets'

const require = createRequire(import.meta.url)
const engineDist = join(dirname(require.resolve('@inkbar/engine/package.json')), 'dist')
const fontsDir = dirname(require.resolve('@inkbar/fonts/files/NotoSans-Regular.ttf'))
const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'))
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const version = pkg.version

/** Every file the plugin ships, by its path under the versioned directory, and where it comes from. */
const SHIPPED: Record<string, string> = {
  'inkbar-pdfium.wasm': join(engineDist, 'inkbar-pdfium.wasm'),
  'worker.mjs': join(engineDist, 'worker.mjs'),
  ...Object.fromEntries(
    Object.values(fontFiles).map((f) => [`fonts/${f}`, join(fontsDir, f)])
  ),
  'sandbox/quickjs-eval.js': join(pdfjsRoot, 'wasm', 'quickjs-eval.js'),
  'sandbox/quickjs-eval.wasm': join(pdfjsRoot, 'wasm', 'quickjs-eval.wasm'),
}

/** Scratch projects live inside the package, not in a RAM-backed temporary directory. */
const scratch = fileURLToPath(new URL('../../.tmp/', import.meta.url))
const dirs: string[] = []

function project(
  main = "import { assets } from 'virtual:inkbar-assets'\nconsole.log(assets)\n"
) {
  mkdirSync(scratch, { recursive: true })
  const dir = mkdtempSync(join(scratch, 'inkbar-vite-'))
  dirs.push(dir)
  writeFileSync(
    join(dir, 'index.html'),
    '<script type="module" src="./main.ts"></script>'
  )
  writeFileSync(join(dir, 'main.ts'), main)
  return dir
}

/** Every file under `dir`, as paths relative to it with `/` separators. */
function listed(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split('\\').join('/'))
    .sort()
}

type Middleware = (
  req: { url: string },
  res: unknown,
  next: (err?: unknown) => void
) => void

/** Returns the dev middleware the plugin registers, under a resolved serve config. */
async function devMiddleware(options?: InkbarPluginOptions): Promise<Middleware> {
  const config = await resolveConfig(
    { root: project(), logLevel: 'silent', plugins: [inkbar(options)] },
    'serve'
  )
  const plugin = config.plugins.find((p) => p.name === 'inkbar-assets')!
  let handler: Middleware | undefined
  const configureServer = plugin.configureServer as (server: unknown) => void
  configureServer({ middlewares: { use: (fn: Middleware) => (handler = fn) } })
  return handler!
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
  it("copies Inkbar's files, and nothing else, into a versioned directory untouched", async () => {
    const root = project()
    await build({
      root,
      base: '/app/',
      logLevel: 'silent',
      plugins: [inkbar()],
      build: { outDir: 'dist' },
    })
    const out = join(root, 'dist', 'inkbar', version)
    expect(listed(join(root, 'dist', 'inkbar'))).toEqual(
      Object.keys(SHIPPED)
        .map((p) => `${version}/${p}`)
        .sort()
    )
    for (const [path, from] of Object.entries(SHIPPED))
      expect(sha(readFileSync(join(out, path))), path).toBe(sha(readFileSync(from)))
    const js = readdirSync(join(root, 'dist', 'assets')).find((f) => f.endsWith('.js'))!
    const bundle = readFileSync(join(root, 'dist', 'assets', js), 'utf8')
    expect(bundle).toContain(`/app/inkbar/${version}/inkbar-pdfium.wasm`)
    expect(bundle).toContain(`/app/inkbar/${version}/fonts/`)
  })

  it('copies into a custom assetsDir', async () => {
    const root = project()
    await build({
      root,
      logLevel: 'silent',
      plugins: [inkbar({ assetsDir: '/static/pdf/' })],
      build: { outDir: 'dist' },
    })
    expect(existsSync(join(root, 'dist', 'static', 'pdf', version, 'worker.mjs'))).toBe(
      true
    )
    expect(existsSync(join(root, 'dist', 'inkbar'))).toBe(false)
  })

  it('builds virtual module URLs from the resolved base, assetsDir and version', async () => {
    expect(await virtualAssets('/app/')).toEqual({
      engine: `/app/inkbar/${version}/inkbar-pdfium.wasm`,
      worker: `/app/inkbar/${version}/worker.mjs`,
      fonts: `/app/inkbar/${version}/fonts/`,
      sandbox: `/app/inkbar/${version}/sandbox/`,
    })
    const custom = await virtualAssets('/app', { assetsDir: 'pdf' })
    expect(custom['worker']).toBe(`/app/pdf/${version}/worker.mjs`)
    expect(custom['sandbox']).toBe(`/app/pdf/${version}/sandbox/`)
  })

  it('resolves URLs against the bundle when base is relative, matching where the files land', async () => {
    for (const base of ['./', '']) {
      const root = project(
        "import { assets } from 'virtual:inkbar-assets'\n(globalThis as any).__inkbarAssets = assets\n"
      )
      await build({
        root,
        base,
        logLevel: 'silent',
        plugins: [inkbar()],
        build: { outDir: 'dist', modulePreload: { polyfill: false } },
      })
      const js = readdirSync(join(root, 'dist', 'assets')).find((f) => f.endsWith('.js'))!
      const g = globalThis as { __inkbarAssets?: PdfAssets }
      delete g.__inkbarAssets
      await import(pathToFileURL(join(root, 'dist', 'assets', js)).href)
      const out = pathToFileURL(join(root, 'dist', 'inkbar', version)).href
      expect(g.__inkbarAssets).toEqual({
        engine: `${out}/inkbar-pdfium.wasm`,
        worker: `${out}/worker.mjs`,
        fonts: `${out}/fonts/`,
        sandbox: `${out}/sandbox/`,
      })
      const assets = g.__inkbarAssets!
      expect(existsSync(new URL(assets.engine))).toBe(true)
      expect(existsSync(new URL(assets.worker))).toBe(true)
      expect(existsSync(new URL(fontFiles.japanese, assets.fonts as string))).toBe(true)
      expect(existsSync(new URL('quickjs-eval.wasm', assets.sandbox))).toBe(true)
      delete g.__inkbarAssets
    }
  })

  it('passes paths other than the files it ships to the next middleware', async () => {
    const handler = await devMiddleware({ assetsDir: 'pdf' })
    for (const url of [
      `/pdf/${version}/../package.json`,
      `/pdf/${version}/..%2Fpackage.json`,
      `/pdf/${version}/%2e%2e/package.json`,
      `/pdf/${version}/fonts/../../package.json`,
      `/pdf/${version}/fonts/..%2F..%2Fpackage.json`,
      `/pdf/${version}/fonts/`,
      `/pdf/${version}/sandbox/quickjs-eval.mjs`,
      `/pdf/${version}/index.mjs`,
      '/pdf/worker.mjs',
      `/pdf/${version}/%E0%A4%A`,
    ]) {
      const next = vi.fn()
      const res = { setHeader: vi.fn() }
      handler({ url }, res, next)
      expect(next, url).toHaveBeenCalledOnce()
      expect(res.setHeader, url).not.toHaveBeenCalled()
    }
  })

  it('serves every file in dev untransformed and resolves the virtual module', async () => {
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
      for (const [path, from] of Object.entries(SHIPPED)) {
        const res = await fetch(`${origin}/pdf/${version}/${path}`)
        expect(res.status, path).toBe(200)
        expect(sha(new Uint8Array(await res.arrayBuffer())), path).toBe(
          sha(readFileSync(from))
        )
      }
      const worker = await fetch(`${origin}/pdf/${version}/worker.mjs`)
      expect(worker.headers.get('content-type')).toContain('javascript')
      await worker.arrayBuffer()
      const mod = await server.ssrLoadModule('virtual:inkbar-assets')
      expect(mod.assets).toEqual({
        engine: `/pdf/${version}/inkbar-pdfium.wasm`,
        worker: `/pdf/${version}/worker.mjs`,
        fonts: `/pdf/${version}/fonts/`,
        sandbox: `/pdf/${version}/sandbox/`,
      })
    } finally {
      await server.close()
    }
  })

  it('serves under a non-root base in dev', async () => {
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
      const url = new URL(`inkbar/${version}/worker.mjs`, server.resolvedUrls!.local[0])
      expect(url.pathname).toBe(`/app/inkbar/${version}/worker.mjs`)
      const res = await fetch(url)
      expect(res.status).toBe(200)
      expect(sha(new Uint8Array(await res.arrayBuffer()))).toBe(
        sha(readFileSync(SHIPPED['worker.mjs']!))
      )
    } finally {
      await server.close()
    }
  })

  it('serves from the root in dev when base is relative', async () => {
    const root = project()
    const server = await createServer({
      root,
      base: './',
      logLevel: 'silent',
      plugins: [inkbar()],
      server: { port: 0 },
    })
    await server.listen()
    try {
      const origin = server.resolvedUrls!.local[0]!.replace(/\/$/, '')
      const { assets } = (await server.ssrLoadModule('virtual:inkbar-assets')) as {
        assets: PdfAssets
      }
      expect(assets.engine).toBe(`/inkbar/${version}/inkbar-pdfium.wasm`)
      const res = await fetch(`${origin}${assets.engine}`)
      expect(res.status).toBe(200)
      expect(sha(new Uint8Array(await res.arrayBuffer()))).toBe(
        sha(readFileSync(SHIPPED['inkbar-pdfium.wasm']!))
      )
    } finally {
      await server.close()
    }
  })
})
