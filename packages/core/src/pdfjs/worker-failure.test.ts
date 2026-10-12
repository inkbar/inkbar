import { fixtureBytes } from '@inkbar/fixtures'
import { expect, it } from 'vitest'

import { loadPdfjs, openProxy } from './load'
import { nodeAssets } from './node-assets'

// Own file: the worker URL latches on first load, so this needs a fresh module registry.
it('maps an unloadable worker to AssetLoadFailed, not InvalidPdf', async () => {
  const assets = { ...nodeAssets(), worker: '/nonexistent/pdf.worker.mjs' }
  const pdfjs = await loadPdfjs(assets)
  await expect(
    openProxy(pdfjs, await fixtureBytes('text-simple'), { assets, verbosity: 0 })
  ).rejects.toMatchObject({
    code: 'AssetLoadFailed',
    details: { url: '/nonexistent/pdf.worker.mjs' },
  })
})
