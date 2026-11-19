// Loaded natively by Node when Vite bundles a config that imports it, so it must stay
// free of extensionless relative imports. Browser code takes `browserAssets` from `./urls`.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'))

const TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.icc': 'application/vnd.iccprofile',
}

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

/**
 * The file `/fixtures/<name>.pdf` stands for: a corpus fixture's file lives in `corpus/` under the
 * name it has upstream, which the manifest gives, and every other fixture's in `pdf/`. Undefined
 * for a URL outside `/fixtures/`. Reads the manifest on each call, so it needs no JSON import.
 */
export function fixtureFileForUrl(url: string): string | undefined {
  const prefix = '/fixtures/'
  if (!url.startsWith(prefix)) return undefined
  const rel = decodeURIComponent(url.slice(prefix.length).split('?')[0] ?? '')
  if (rel.startsWith('corpus-') && rel.endsWith('.pdf')) {
    const manifest = JSON.parse(
      readFileSync(join(here, 'manifest.json'), 'utf8')
    ) as Record<string, { file: string } | undefined>
    const entry = manifest[rel.slice(0, -'.pdf'.length)]
    return entry && join(here, 'corpus', entry.file)
  }
  return join(here, 'pdf', rel)
}

/** Streams the file `resolve` gives for a URL as-is, bypassing Vite's transform pipeline. */
function serve(
  resolve: (url: string) => string | undefined,
  roots: string[]
): Middleware {
  const bases = roots.map((root) => normalize(root + sep))
  return (req, res, next) => {
    const path = req.url === undefined ? undefined : resolve(req.url)
    const file = path === undefined ? undefined : normalize(path)
    if (
      !file ||
      !bases.some((base) => file.startsWith(base)) ||
      !existsSync(file) ||
      statSync(file).isDirectory()
    ) {
      return next()
    }
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-store')
    createReadStream(file).pipe(res)
  }
}

/** Streams files under `dir` at `prefix`. */
function serveDir(prefix: string, dir: string): Middleware {
  return serve(
    (url) => {
      if (!url.startsWith(prefix)) return undefined
      return join(dir, decodeURIComponent(url.slice(prefix.length).split('?')[0] ?? ''))
    },
    [dir]
  )
}

/** Serves the fixture PDFs (and the corpus) at /fixtures/ and the installed pdfjs-dist at /pdfjs/ in Vite dev and preview servers. */
export function serveFixtures(): Plugin {
  const handlers = [
    serve(fixtureFileForUrl, [join(here, 'pdf'), join(here, 'corpus')]),
    serveDir('/pdfjs/', pdfjsRoot),
  ]
  return {
    name: 'inkbar-serve-fixtures',
    configureServer(server) {
      for (const h of handlers) server.middlewares.use(h)
    },
    configurePreviewServer(server) {
      for (const h of handlers) server.middlewares.use(h)
    },
  }
}
