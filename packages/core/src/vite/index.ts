import { cpSync, createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, normalize, posix, resolve, sep } from 'node:path'

import type { Plugin, ResolvedConfig } from 'vite'

export interface InkbarPluginOptions {
  /** Directory under the build output, and URL path under `base`, for the PDF.js assets. Default `inkbar`. */
  assetsDir?: string
}

const VIRTUAL = 'virtual:inkbar-assets'
const RESOLVED = '\0' + VIRTUAL
const WORKER = 'pdf.worker.min.mjs'
const DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'] as const
// Stands in for the path from the output chunk back to outDir when `base` is relative.
const ROOT_MARKER = '__INKBAR_RELATIVE_ROOT__'
const ROOT_MARKER_LITERAL = /(["'`])__INKBAR_RELATIVE_ROOT__\1/g

const TYPES: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.icc': 'application/vnd.iccprofile',
}

// Resolved from this package, not the consumer's root, so the served and copied files
// always match the PDF.js version that @inkbar/core itself loads.
function pdfjsRoot(): string {
  return dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
}

function withSlash(base: string): string {
  return base === '' || base.endsWith('/') ? base : base + '/'
}

/** Ships PDF.js's worker, CMaps, standard fonts, wasm and ICC files from the host origin and exposes their URLs as `virtual:inkbar-assets`. */
export function inkbar(options: InkbarPluginOptions = {}): Plugin {
  const assetsDir = (options.assetsDir ?? 'inkbar').replace(/^\/+|\/+$/g, '')
  const root = pdfjsRoot()
  const worker = join(root, 'build', WORKER)
  let config: ResolvedConfig

  /** A relative `base` (`./` or empty) only exists in builds; Vite serves dev from `/`. */
  const relativeBuild = () =>
    config.command === 'build' && (config.base === '' || config.base.startsWith('.'))

  /** URL path the dev server answers on: Vite treats a relative base as `/` and uses a URL base's path. */
  function servePrefix(): string {
    let base = config.base
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(base)) base = new URL(base).pathname
    if (!base.startsWith('/')) base = '/'
    return `${withSlash(base)}${assetsDir}/`
  }

  /** Maps a path under the assets prefix to a file in pdfjs-dist, or undefined if it is not an asset. */
  function source(rel: string): string | undefined {
    if (rel === WORKER) return worker
    const dir = DIRS.find((d) => rel.startsWith(d + '/'))
    if (!dir) return undefined
    const base = join(root, dir) + sep
    const file = normalize(join(root, rel))
    return file.startsWith(base) ? file : undefined
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
      const paths = {
        worker: WORKER,
        cMaps: 'cmaps/',
        standardFonts: 'standard_fonts/',
        wasm: 'wasm/',
        icc: 'iccs/',
      }
      if (relativeBuild()) {
        // Resolved at runtime against the chunk's own URL, so the app works from any
        // path. renderChunk swaps the marker for the chunk's path back to outDir.
        const entries = Object.entries(paths).map(
          ([key, path]) => `${key}: root + ${JSON.stringify(`${assetsDir}/${path}`)}`
        )
        return (
          `const root = new URL(/* @vite-ignore */ ${JSON.stringify(ROOT_MARKER)}, import.meta.url).href;\n` +
          `export const assets = { ${entries.join(', ')} };\n`
        )
      }
      const p =
        config.command === 'build'
          ? `${withSlash(config.base)}${assetsDir}/`
          : servePrefix()
      const assets = Object.fromEntries(Object.entries(paths).map(([k, v]) => [k, p + v]))
      return `export const assets = ${JSON.stringify(assets)};\n`
    },
    renderChunk(code, chunk) {
      if (!code.includes(ROOT_MARKER)) return null
      const up = posix.relative(posix.dirname(chunk.fileName), '.')
      const rel = up === '' ? './' : `${up}/`
      return { code: code.replace(ROOT_MARKER_LITERAL, JSON.stringify(rel)), map: null }
    },
    // Registered directly, so it runs before Vite's transform middleware: the files are
    // streamed byte for byte and the worker is never rewritten.
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
        const file = source(rel)
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
      const out = resolve(config.root, config.build.outDir, assetsDir)
      mkdirSync(out, { recursive: true })
      cpSync(worker, join(out, WORKER))
      for (const dir of DIRS) {
        const from = join(root, dir)
        if (existsSync(from)) cpSync(from, join(out, dir), { recursive: true })
      }
    },
  }
}
