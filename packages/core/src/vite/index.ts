import { copyFileSync, createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, posix, resolve } from 'node:path'

import { fontFiles } from '@inkbar/fonts'

import type { Plugin, ResolvedConfig } from 'vite'

declare const __INKBAR_VERSION__: string

export interface InkbarPluginOptions {
  /**
   * Directory under the build output, and URL path under `base`, for Inkbar's files. Default
   * `inkbar`. The files go in a folder named after the version of `@inkbar/core` inside it.
   */
  assetsDir?: string
}

const VIRTUAL = 'virtual:inkbar-assets'
const RESOLVED = '\0' + VIRTUAL
// Stands in for the path from the output chunk back to outDir when `base` is relative.
const ROOT_MARKER = '__INKBAR_RELATIVE_ROOT__'
const ROOT_MARKER_LITERAL = /(["'`])__INKBAR_RELATIVE_ROOT__\1/g

const TYPES: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  // The licence files, which have no extension.
  '': 'text/plain; charset=utf-8',
}

/** A file the plugin ships: the package it comes from, and where it is on disk. */
interface Shipped {
  pkg: string
  from: string
}

/**
 * @internal `path` inside the package `pkg`, as installed for @inkbar/core, found through
 * `anchor`, a file the package exports. Throws an error that names both when it cannot be found.
 */
export function packageFile(
  pkg: string,
  path: string,
  resolve: (id: string) => string = createRequire(import.meta.url).resolve,
  anchor = 'package.json'
): string {
  try {
    const found = resolve(`${pkg}/${anchor}`)
    const root = anchor.split('/').reduce((dir) => dirname(dir), found)
    return join(root, path)
  } catch (cause) {
    throw new Error(
      `Inkbar's Vite plugin could not find ${path} in ${pkg}, which @inkbar/core depends on. ` +
        'Install your dependencies again.',
      { cause }
    )
  }
}

/** @internal Copies a shipped file to `to`, with an error that names its package and path. */
export function copyShipped(file: Shipped, to: string, rel: string): void {
  try {
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(file.from, to)
  } catch (cause) {
    throw new Error(
      `Inkbar's Vite plugin could not copy ${rel} from ${file.pkg} (${file.from}) into the build.`,
      { cause }
    )
  }
}

/**
 * Each file the plugin serves and copies, by its path under the versioned directory, with the
 * licence of each beside the files it covers. Resolved from this package, not the host's root, so
 * the files always match the versions @inkbar/core itself depends on.
 */
function files(): Map<string, Shipped> {
  const resolve = createRequire(import.meta.url).resolve
  const from =
    (pkg: string, anchor?: string) =>
    (path: string): Shipped => ({ pkg, from: packageFile(pkg, path, resolve, anchor) })
  const engine = from('@inkbar/engine')
  // @inkbar/fonts exports its fonts and not its package.json.
  const fonts = from('@inkbar/fonts', 'files/NotoSans-Regular.ttf')
  const pdfjs = from('pdfjs-dist')
  return new Map([
    ['inkbar-pdfium.wasm', engine('dist/inkbar-pdfium.wasm')],
    ['worker.mjs', engine('dist/worker.mjs')],
    // PDFium and the libraries linked into the binary.
    ['THIRD-PARTY-NOTICES', engine('dist/THIRD-PARTY-NOTICES')],
    ...Object.values(fontFiles).map((file): [string, Shipped] => [
      `fonts/${file}`,
      fonts(`files/${file}`),
    ]),
    ['fonts/OFL.txt', fonts('OFL.txt')],
    ['sandbox/quickjs-eval.js', pdfjs('wasm/quickjs-eval.js')],
    ['sandbox/quickjs-eval.wasm', pdfjs('wasm/quickjs-eval.wasm')],
    // pdfjs-dist ships the two files under its own licence, and no other for them.
    ['sandbox/LICENSE', pdfjs('LICENSE')],
  ])
}

/** The paths, under the versioned directory, that `assets` names. */
const PATHS = {
  engine: 'inkbar-pdfium.wasm',
  worker: 'worker.mjs',
  fonts: 'fonts/',
  sandbox: 'sandbox/',
}

function withSlash(base: string): string {
  return base === '' || base.endsWith('/') ? base : base + '/'
}

/**
 * Serves Inkbar's own files from the host origin in development and copies them into a client
 * build: the engine's binary and worker, the fallback fonts and the form script sandbox. Exposes
 * their URLs as `assets` from `virtual:inkbar-assets`.
 */
export function inkbar(options: InkbarPluginOptions = {}): Plugin {
  const assetsDir = (options.assetsDir ?? 'inkbar').replace(/^\/+|\/+$/g, '')
  /** The directory under `assetsDir` the files go in, so their URLs change with each release. */
  const versioned = `${assetsDir}/${__INKBAR_VERSION__}`
  const sources = files()
  let config: ResolvedConfig

  /** A relative `base` (`./` or empty) only exists in builds; Vite serves dev from `/`. */
  const relativeBuild = () =>
    config.command === 'build' && (config.base === '' || config.base.startsWith('.'))

  /** URL path the dev server answers on: Vite treats a relative base as `/` and uses a URL base's path. */
  function servePrefix(): string {
    let base = config.base
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(base)) base = new URL(base).pathname
    if (!base.startsWith('/')) base = '/'
    return `${withSlash(base)}${versioned}/`
  }

  return {
    name: 'inkbar-assets',
    configResolved(resolved) {
      config = resolved
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : undefined
    },
    load(id) {
      if (id !== RESOLVED) return undefined
      if (relativeBuild()) {
        // Resolved at runtime against the chunk's own URL, so the app works from any
        // path. renderChunk swaps the marker for the chunk's path back to outDir.
        const entries = Object.entries(PATHS).map(
          ([key, path]) => `${key}: root + ${JSON.stringify(`${versioned}/${path}`)}`
        )
        return (
          `const root = new URL(/* @vite-ignore */ ${JSON.stringify(ROOT_MARKER)}, import.meta.url).href;\n` +
          `export const assets = { ${entries.join(', ')} };\n`
        )
      }
      const p =
        config.command === 'build'
          ? `${withSlash(config.base)}${versioned}/`
          : servePrefix()
      const assets = Object.fromEntries(Object.entries(PATHS).map(([k, v]) => [k, p + v]))
      return `export const assets = ${JSON.stringify(assets)};\n`
    },
    renderChunk(code, chunk) {
      if (!code.includes(ROOT_MARKER)) return null
      const up = posix.relative(posix.dirname(chunk.fileName), '.')
      const rel = up === '' ? './' : `${up}/`
      return { code: code.replace(ROOT_MARKER_LITERAL, JSON.stringify(rel)), map: null }
    },
    // Registered directly, so it runs before Vite's transform middleware: the files are
    // streamed byte for byte and the worker is never rewritten. Only the files listed are
    // served; any other path goes to the next middleware.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        const p = servePrefix()
        if (!url.startsWith(p)) return next()
        let rel: string
        try {
          rel = decodeURIComponent(url.slice(p.length))
        } catch {
          return next()
        }
        const file = sources.get(rel)?.from
        if (!file || !existsSync(file) || statSync(file).isDirectory()) return next()
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-store')
        createReadStream(file)
          .on('error', (err) => (res.headersSent ? res.destroy(err) : next(err)))
          .pipe(res)
      })
    },
    writeBundle() {
      if (config.command !== 'build' || config.build.ssr) return
      if (this.environment && this.environment.config.consumer !== 'client') return
      const out = resolve(config.root, config.build.outDir, versioned)
      for (const [rel, file] of sources) copyShipped(file, join(out, rel), rel)
    },
  }
}
