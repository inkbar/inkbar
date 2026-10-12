// Loaded natively by Node when Vite bundles a config that imports it, so it must stay
// free of extensionless relative imports. Browser code takes `browserAssets` from `./urls`.
import { createReadStream, existsSync, statSync } from 'node:fs'
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

/** Streams files under `dir` as-is at `prefix`, bypassing Vite's transform pipeline. */
function serve(prefix: string, dir: string): Middleware {
  const root = normalize(dir + sep)
  return (req, res, next) => {
    if (!req.url?.startsWith(prefix)) return next()
    const rel = decodeURIComponent(req.url.slice(prefix.length).split('?')[0] ?? '')
    const file = normalize(join(root, rel))
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      return next()
    }
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-store')
    createReadStream(file).pipe(res)
  }
}

/** Serves the fixture PDFs at /fixtures/ and the installed pdfjs-dist at /pdfjs/ in Vite dev and preview servers. */
export function serveFixtures(): Plugin {
  const handlers = [serve('/fixtures/', join(here, 'pdf')), serve('/pdfjs/', pdfjsRoot)]
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
