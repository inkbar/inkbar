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
/** The fallback fonts' directory in the installed `@inkbar/fonts`. */
const fontsDir = dirname(require.resolve('@inkbar/fonts/files/NotoSans-Regular.ttf'))
/**
 * The engine's build in this repository: `@inkbar/engine` takes this package as a development
 * dependency, so this one cannot take the engine.
 */
const engineDist = join(here, '..', 'packages', 'engine', 'dist')

const TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.icc': 'application/vnd.iccprofile',
}

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

/** A URL path decoded, or undefined when it holds a malformed `%` sequence. */
function decoded(path: string): string | undefined {
  try {
    return decodeURIComponent(path)
  } catch {
    return undefined
  }
}

/** The manifest, read once, on the first corpus request: this file takes no JSON import. */
let manifestCache: Record<string, { file: string } | undefined> | undefined
const corpusManifest = () =>
  (manifestCache ??= JSON.parse(
    readFileSync(join(here, 'manifest.json'), 'utf8')
  ) as Record<string, { file: string } | undefined>)

/**
 * The file `/fixtures/<name>.pdf` stands for: a corpus fixture's file lives in `corpus/` under the
 * name it has upstream, which the manifest gives, and every other fixture's in `pdf/`. Undefined
 * for a URL outside `/fixtures/` or one that does not decode.
 */
export function fixtureFileForUrl(url: string): string | undefined {
  const prefix = '/fixtures/'
  if (!url.startsWith(prefix)) return undefined
  const rel = decoded(url.slice(prefix.length).split('?')[0] ?? '')
  if (rel === undefined) return undefined
  if (rel.startsWith('corpus-') && rel.endsWith('.pdf')) {
    const entry = corpusManifest()[rel.slice(0, -'.pdf'.length)]
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
      const rel = decoded(url.slice(prefix.length).split('?')[0] ?? '')
      return rel === undefined ? undefined : join(dir, rel)
    },
    [dir]
  )
}

/**
 * Serves, in Vite dev and preview servers, the fixture PDFs (and the corpus) at /fixtures/, and
 * the files `browserAssets()` names: the engine's binary and worker at /inkbar-engine/, the
 * fallback fonts at /inkbar-fonts/, and the installed pdfjs-dist at /pdfjs/: its sandbox files,
 * and its reader, which tests open saved files with.
 */
export function serveFixtures(): Plugin {
  const handlers = [
    serve(fixtureFileForUrl, [join(here, 'pdf'), join(here, 'corpus')]),
    serveDir('/inkbar-engine/', engineDist),
    serveDir('/inkbar-fonts/', fontsDir),
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
