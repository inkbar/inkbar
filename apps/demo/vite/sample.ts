import { makeSample } from './make-sample.ts'

import type { Plugin } from 'vite'

/**
 * The sample PDF at `<base>sample.pdf`: served from memory by the dev server, emitted as a
 * build asset (which `vite preview` then serves). It is never written into the source tree.
 */
export function samplePdf(): Plugin {
  let bytes: Promise<Uint8Array> | undefined
  const sample = (): Promise<Uint8Array> => (bytes ??= makeSample())
  return {
    name: 'inkbar-demo:sample-pdf',
    configureServer(server) {
      const base = server.config.base
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0]
        if (path !== '/sample.pdf' && path !== `${base}sample.pdf`) return next()
        sample().then((data) => {
          res.setHeader('Content-Type', 'application/pdf')
          res.setHeader('Cache-Control', 'no-store')
          res.end(data)
        }, next)
      })
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sample.pdf', source: await sample() })
    },
  }
}
