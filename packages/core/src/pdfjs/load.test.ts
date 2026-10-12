import { fixtureBytes } from '@inkbar/fixtures'
import { describe, expect, it, vi } from 'vitest'

import { InkError } from '../model/errors'

import { assertAssets, loadPdfjs, mapLoadError, openProxy } from './load'
import { nodeAssets } from './node-assets'

function thrownBy(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('expected the function to throw')
}

function named(name: string, message = 'boom', extra: object = {}): Error {
  return Object.assign(new Error(message), { name }, extra)
}

// Errors-only: PDF.js warns while reconstructing or decrypting these fixtures.
const QUIET = 0

describe('assertAssets', () => {
  it('throws AssetConfigMissing when assets are absent', () => {
    const error = thrownBy(() => assertAssets(undefined))
    expect(error).toBeInstanceOf(InkError)
    expect(error).toMatchObject({
      code: 'AssetConfigMissing',
      details: { missing: ['worker', 'cMaps', 'standardFonts', 'wasm'] },
    })
  })

  it('names the missing keys when incomplete', () => {
    expect(thrownBy(() => assertAssets({ worker: 'x' }))).toMatchObject({
      code: 'AssetConfigMissing',
      details: { missing: ['cMaps', 'standardFonts', 'wasm'] },
    })
  })

  it('treats empty strings as missing', () => {
    expect(thrownBy(() => assertAssets({ ...nodeAssets(), wasm: '' }))).toMatchObject({
      details: { missing: ['wasm'] },
    })
  })

  it('accepts a complete config', () => {
    expect(() => assertAssets(nodeAssets())).not.toThrow()
  })
})

describe('loadPdfjs', () => {
  it('rejects incomplete assets', async () => {
    await expect(loadPdfjs({ worker: 'x' } as never)).rejects.toMatchObject({
      code: 'AssetConfigMissing',
    })
  })

  it('refuses a different worker URL after the first load', async () => {
    const assets = nodeAssets()
    const pdfjs = await loadPdfjs(assets)
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe(assets.worker)
    await expect(
      loadPdfjs({ ...assets, worker: assets.worker + '?other' })
    ).rejects.toMatchObject({
      code: 'AssetConfigMissing',
      details: { configured: assets.worker, requested: assets.worker + '?other' },
    })
    expect(await loadPdfjs(assets)).toBe(pdfjs)
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe(assets.worker)
  })
})

describe('openProxy', () => {
  it('opens a valid document', async () => {
    const pdfjs = await loadPdfjs(nodeAssets())
    const { task, proxy } = await openProxy(pdfjs, await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
      verbosity: QUIET,
    })
    expect(proxy.numPages).toBe(3)
    await task.destroy()
  })

  it('maps a missing password to PasswordRequired', async () => {
    const pdfjs = await loadPdfjs(nodeAssets())
    await expect(
      openProxy(pdfjs, await fixtureBytes('encrypted-aes'), {
        assets: nodeAssets(),
        verbosity: QUIET,
      })
    ).rejects.toMatchObject({
      code: 'PasswordRequired',
      details: { passwordSupplied: false, incorrect: false },
    })
  })

  it('flags a wrong password as incorrect', async () => {
    const pdfjs = await loadPdfjs(nodeAssets())
    await expect(
      openProxy(pdfjs, await fixtureBytes('encrypted-aes'), {
        assets: nodeAssets(),
        password: 'nope',
        verbosity: QUIET,
      })
    ).rejects.toMatchObject({
      code: 'PasswordRequired',
      details: { passwordSupplied: true, incorrect: true },
    })
  })

  it.each(['encrypted-aes', 'encrypted-rc4'] as const)(
    'opens %s with the right password',
    async (name) => {
      const pdfjs = await loadPdfjs(nodeAssets())
      const { task, proxy } = await openProxy(pdfjs, await fixtureBytes(name), {
        assets: nodeAssets(),
        password: 'inkbar',
        verbosity: QUIET,
      })
      expect(proxy.numPages).toBe(1)
      await task.destroy()
    }
  )

  it('maps a truncated file to InvalidPdf and keeps the cause', async () => {
    const pdfjs = await loadPdfjs(nodeAssets())
    const error = await openProxy(pdfjs, await fixtureBytes('malformed-truncated'), {
      assets: nodeAssets(),
      verbosity: QUIET,
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(InkError)
    expect(error).toMatchObject({ code: 'InvalidPdf' })
    expect((error as InkError).cause).toBeInstanceOf(Error)
  })

  it('opens a file with a missing xref by reconstruction', async () => {
    const pdfjs = await loadPdfjs(nodeAssets())
    const { task, proxy } = await openProxy(
      pdfjs,
      await fixtureBytes('malformed-missing-xref'),
      {
        assets: nodeAssets(),
        verbosity: QUIET,
      }
    )
    expect(proxy.numPages).toBeGreaterThan(0)
    await task.destroy()
  })

  it('destroys the loading task when loading fails, and survives a failing destroy', async () => {
    const destroy = vi.fn().mockRejectedValue(new Error('destroy failed'))
    const cause = named('InvalidPDFException', 'Invalid PDF structure.')
    const fake = {
      getDocument: vi.fn(() => ({ promise: Promise.reject(cause), destroy })),
    }
    await expect(
      openProxy(fake as never, new Uint8Array(), { assets: nodeAssets() })
    ).rejects.toMatchObject({ code: 'InvalidPdf', cause })
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('does not pass undefined options to PDF.js', async () => {
    const getDocument = vi.fn(() => ({
      promise: Promise.reject(named('InvalidPDFException')),
      destroy: () => Promise.resolve(),
    }))
    const { icc: _icc, ...assets } = nodeAssets()
    await openProxy({ getDocument } as never, new Uint8Array(), { assets }).catch(
      () => undefined
    )
    const params = (getDocument.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect('password' in params).toBe(false)
    expect('verbosity' in params).toBe(false)
    expect('iccUrl' in params).toBe(false)
    expect(params).toMatchObject({ cMapPacked: true })
  })
})

describe('mapLoadError', () => {
  it('maps PasswordException by code', () => {
    expect(
      mapLoadError(named('PasswordException', 'x', { code: 1 }), false)
    ).toMatchObject({
      code: 'PasswordRequired',
      details: { passwordSupplied: false, incorrect: false },
    })
    expect(
      mapLoadError(named('PasswordException', 'x', { code: 2 }), true)
    ).toMatchObject({
      code: 'PasswordRequired',
      details: { passwordSupplied: true, incorrect: true },
    })
  })

  it.each([
    'InvalidPDFException',
    'FormatError',
    'UnknownErrorException',
    'MissingPDFException',
    'UnexpectedResponseException',
    'ResponseException',
    'SomethingElse',
  ])('maps %s to InvalidPdf with the PDF.js message and cause', (name) => {
    const cause = named(name, `pdfjs says ${name}`)
    const error = mapLoadError(cause)
    expect(error).toMatchObject({
      code: 'InvalidPdf',
      message: `pdfjs says ${name}`,
      details: { pdfjsErrorName: name, pdfjsMessage: `pdfjs says ${name}` },
    })
    expect(error.cause).toBe(cause)
  })

  it.each([['a string'], [undefined], [null], [42]])(
    'never swallows non-Error value %j',
    (cause) => {
      const error = mapLoadError(cause)
      expect(error.code).toBe('InvalidPdf')
      expect(error.cause).toBe(cause)
    }
  )
})
