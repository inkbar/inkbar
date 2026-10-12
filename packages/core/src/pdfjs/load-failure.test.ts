import { describe, expect, it, vi } from 'vitest'

import { loadPdfjs } from './load'
import { nodeAssets } from './node-assets'

vi.mock('#pdfjs', () => {
  throw new Error('import exploded')
})

describe('loadPdfjs import failure', () => {
  it('maps a failed import to AssetLoadFailed and keeps the cause', async () => {
    const error = await loadPdfjs(nodeAssets()).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'AssetLoadFailed' })
    expect((error as Error).cause).toBeInstanceOf(Error)
  })
})
