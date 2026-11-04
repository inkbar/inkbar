import { DOCUMENT_NAMES, makeDocument } from './documents/index.ts'
import { makeSample } from './make-sample.ts'

import type { Plugin } from 'vite'

/** Every generated PDF by its path under the base, with what builds it. */
const PDFS: Record<string, () => Promise<Uint8Array>> = {
  'sample.pdf': makeSample,
  ...Object.fromEntries(
    DOCUMENT_NAMES.map((name) => [`documents/${name}.pdf`, () => makeDocument(name)])
  ),
}

/**
 * The generated PDFs: `<base>sample.pdf` and `<base>documents/<name>.pdf`, one per scenario.
 * The dev server serves them from memory and the build emits them as assets (which
 * `vite preview` then serves). They are never written into the source tree.
 */
export function generatedPdfs(): Plugin {
  const built = new Map<string, Promise<Uint8Array>>()
  const pdf = (path: string): Promise<Uint8Array> => {
    let bytes = built.get(path)
    if (!bytes) built.set(path, (bytes = PDFS[path]!()))
    return bytes
  }
  return {
    name: 'inkbar-sandbox:generated-pdfs',
    configureServer(server) {
      const base = server.config.base
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        const path = url.startsWith(base) ? url.slice(base.length) : url.slice(1)
        if (!Object.hasOwn(PDFS, path)) return next()
        pdf(path).then((data) => {
          res.setHeader('Content-Type', 'application/pdf')
          res.setHeader('Cache-Control', 'no-store')
          res.end(data)
        }, next)
      })
    },
    async generateBundle() {
      for (const fileName of Object.keys(PDFS))
        this.emitFile({ type: 'asset', fileName, source: await pdf(fileName) })
    },
  }
}
