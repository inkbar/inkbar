import { cpSync, createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'

import type { Plugin, ResolvedConfig } from 'vite'

export interface InkbarPluginOptions {
  /** Directory under the build output, and URL path under `base`, for the PDF.js assets. Default `inkbar`. */
  assetsDir?: string
}

const VIRTUAL = 'virtual:inkbar-assets'
const RESOLVED = '\0' + VIRTUAL
const WORKER = 'pdf.worker.min.mjs'
const DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'] as const

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

  const prefix = () => `${withSlash(config.base)}${assetsDir}/`

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
      const p = prefix()
      const assets = {
        worker: `${p}${WORKER}`,
        cMaps: `${p}cmaps/`,
        standardFonts: `${p}standard_fonts/`,
        wasm: `${p}wasm/`,
        icc: `${p}iccs/`,
      }
      return `export const assets = ${JSON.stringify(assets)};\n`
    },
    // Registered directly, so it runs before Vite's transform middleware: the files are
    // streamed byte for byte and the worker is never rewritten.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        const p = prefix()
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
        createReadStream(file).pipe(res)
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
