import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

import { fixtureFileForUrl } from '@inkbar/fixtures/vite-serve'

import type { Plugin } from 'vite'

const TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
}

/**
 * The fixtures the smoke page and the measure page open, by name. `corpus-transfer-function`
 * stands in for a scan: two pages of JBIG2 and CCITT images and no text, the largest images of
 * the image-only fixtures. `text-search`, `links` and `outline` are for the checks of text,
 * search, links and the outline with the engine reading the file.
 */
export const SANDBOX_FIXTURES = [
  'text-simple',
  'unembedded-japanese',
  'corpus-transfer-function',
  'text-search',
  'links',
  'outline',
] as const

function fixtureFiles(): Record<string, string> {
  return Object.fromEntries(
    SANDBOX_FIXTURES.map((name) => {
      const file = fixtureFileForUrl(`/fixtures/${name}.pdf`)
      if (!file) throw new Error(`No fixture file for ${name}`)
      return [`fixtures/${name}.pdf`, file]
    })
  )
}

/**
 * Files served as they are under the base: a few fixtures at `<base>fixtures/`. The dev server
 * reads them from the fixtures package and the build emits them as assets, which `vite preview`
 * then serves. They are never copied into the source tree. The engine's files, its fallback
 * fonts and the form sandbox come from `inkbar()` in `@inkbar/core/vite`.
 */
export function staticFiles(): Plugin {
  const files = fixtureFiles()
  return {
    name: 'inkbar-sandbox:static-files',
    configureServer(server) {
      const base = server.config.base
      server.middlewares.use((req, res, next) => {
        // Only under the base, so a URL that ignores it fails here as it would once built.
        const url = req.url?.split('?')[0] ?? ''
        if (!url.startsWith(base)) return next()
        const path = url.slice(base.length)
        if (!Object.hasOwn(files, path)) return next()
        res.setHeader('Content-Type', TYPES[extname(path)] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-store')
        res.end(readFileSync(files[path]!))
      })
    },
    generateBundle() {
      for (const [fileName, file] of Object.entries(files))
        this.emitFile({ type: 'asset', fileName, source: readFileSync(file) })
    },
  }
}
