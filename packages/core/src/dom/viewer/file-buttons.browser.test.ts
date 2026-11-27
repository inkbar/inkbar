import { browserAssets, fixtureUrl } from '@inkbar/fixtures/urls'
import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { setEngineFactory } from '../../model/engine-factory'
import { stoppableEngines } from '../../test-support/stoppable-engines'
import { mountContainer, until } from '../test-utils'

import {
  createDownloadButton,
  createPrintButton,
  createToolbar,
  createUndo,
} from './controls'
import { createViewer, type CreateViewerOptions, type Viewer } from './create-viewer'

import type { InkError } from '../../model/errors'
import type { Engine } from '@inkbar/engine'

let cleanup: (() => void)[] = []
afterEach(() => {
  vi.restoreAllMocks()
  cleanup.forEach((f) => f())
  cleanup = []
  document.querySelectorAll('[data-ink-print-frame]').forEach((f) => f.remove())
})

/** Records the anchors a download clicks, without starting a real download. */
function catchDownloads(): HTMLAnchorElement[] {
  const clicked: HTMLAnchorElement[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    clicked.push(this)
  })
  return clicked
}

function make(opts: Partial<CreateViewerOptions> = {}): Viewer {
  const host = mountContainer(600, 450)
  const viewer = createViewer(host, {
    source: fixtureUrl('text-simple'),
    assets: browserAssets(),
    ...opts,
  })
  cleanup.push(() => {
    viewer.destroy()
    host.remove()
  })
  return viewer
}

describe('download and print', () => {
  it('the buttons wait for the document, then download and print its file', async () => {
    const clicked = catchDownloads()
    const viewer = make()
    const download = createDownloadButton(viewer)
    const print = createPrintButton(viewer)
    expect(download.getAttribute('aria-label')).toBe('Download')
    expect(print.getAttribute('aria-label')).toBe('Print')
    expect(download.dataset.inkDownload).toBe('')
    expect(print.dataset.inkPrint).toBe('')
    expect(download.disabled).toBe(true)
    expect(print.disabled).toBe(true)
    await until(() => viewer.status.get().state === 'ready')
    expect(download.disabled).toBe(false)
    expect(print.disabled).toBe(false)

    download.click()
    await until(() => clicked.length === 1)
    // The URL's last segment names the file.
    expect(clicked[0]!.download).toBe('text-simple.pdf')

    print.click()
    await until(() => document.querySelector('[data-ink-print-frame]') !== null)
  })

  it('a download button takes a file name of its own', async () => {
    const clicked = catchDownloads()
    const viewer = make()
    const download = createDownloadButton(viewer, { filename: 'Lease.pdf' })
    await until(() => !download.disabled)
    download.click()
    await until(() => clicked.length === 1)
    expect(clicked[0]!.download).toBe('Lease.pdf')
  })

  it('Ctrl+S in the viewer downloads; the methods do nothing with no document', async () => {
    const clicked = catchDownloads()
    const viewer = make()
    await viewer.download()
    expect(clicked).toHaveLength(0)
    await until(() => viewer.status.get().state === 'ready')
    const scroll = viewer.element.querySelector<HTMLElement>('[data-ink-scroll]')!
    const taken = !scroll.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    )
    expect(taken).toBe(true)
    await until(() => clicked.length === 1)
  })
})

/**
 * The real engine as the engine every document reads and writes with, the writes of every
 * document opened in it held: `finish()` lets a write save, `fail(e)` makes it reject with `e`.
 * `writes` counts the writes asked for.
 */
function heldEngine() {
  let settle: { finish: () => void; fail: (e: Error) => void } | undefined
  let writes = 0
  const writing = () => settle !== undefined
  const write = () => {
    writes++
    return new Promise<void>((resolve, reject) => {
      settle = {
        finish: () => {
          settle = undefined
          resolve()
        },
        fail: (e) => {
          settle = undefined
          reject(e)
        },
      }
    })
  }
  /** `real`, with the writes of every document it opens held. */
  const holdingWrites = (real: Engine): Engine =>
    new Proxy(real, {
      get(target, key) {
        const value = Reflect.get(target, key, target) as unknown
        if (key !== 'open')
          return typeof value === 'function'
            ? (value as (...a: unknown[]) => unknown).bind(target)
            : value
        return async (...args: Parameters<Engine['open']>) => {
          const doc = await target.open(...args)
          return new Proxy(doc, {
            get(d, name) {
              if (name === 'write') return write
              const member = Reflect.get(d, name, d) as unknown
              return typeof member === 'function'
                ? (member as (...a: unknown[]) => unknown).bind(d)
                : member
            },
          })
        }
      },
    })
  setEngineFactory(async () => {
    const { createEngine } = await import('@inkbar/engine')
    return holdingWrites(await createEngine())
  })
  cleanup.push(() => setEngineFactory(undefined))
  return {
    writes: () => writes,
    writing,
    finish: () => settle!.finish(),
    fail: (e: Error) => settle!.fail(e),
  }
}

const addSquare = (viewer: Viewer) =>
  viewer.document.get()!.annotations.add({
    type: 'square',
    page: 0,
    rect: { x: 72, y: 600, width: 120, height: 60 },
  })

const alertText = () =>
  document.querySelector('[data-ink-form-alert-message]')?.textContent ?? null

/** Busy as the controls show it: `aria-busy`, and `aria-disabled` without losing focus. */
const busy = (b: HTMLButtonElement) =>
  b.getAttribute('aria-busy') === 'true' && b.getAttribute('aria-disabled') === 'true'

describe('with changes to write', () => {
  afterEach(() =>
    document.querySelectorAll('[data-ink-form-alert]').forEach((a) => a.remove())
  )

  it('the buttons are busy while the copy is written, then download it', async () => {
    const clicked = catchDownloads()
    const held = heldEngine()
    const viewer = make()
    const download = createDownloadButton(viewer)
    const print = createPrintButton(viewer)
    viewer.element.prepend(download, print)
    await until(() => viewer.status.get().state === 'ready')
    expect(download.getAttribute('aria-busy')).toBe('false')
    addSquare(viewer)
    download.focus()
    download.click()
    await until(held.writing)
    expect(busy(download)).toBe(true)
    expect(busy(print)).toBe(true)
    // Focus stays on the pressed button, and pressing again does nothing.
    expect(document.activeElement).toBe(download)
    download.click()
    print.click()
    held.finish()
    await until(() => clicked.length === 1)
    expect(busy(download)).toBe(false)
    expect(download.disabled).toBe(false)
    expect(print.disabled).toBe(false)
    expect(held.writes()).toBe(1)
    expect(document.querySelector('[data-ink-print-frame]')).toBeNull()
    expect(clicked).toHaveLength(1)
  })

  it('the theme shows a busy button as disabled, with the progress cursor', async () => {
    const style = document.createElement('style')
    style.textContent = themeCss
    document.head.append(style)
    cleanup.push(() => style.remove())
    catchDownloads()
    const held = heldEngine()
    const viewer = make()
    const bar = createToolbar()
    const download = createDownloadButton(viewer)
    // Nothing to undo: natively disabled, the look a busy button should share.
    const undo = createUndo(viewer)
    bar.append(download, undo)
    viewer.element.prepend(bar)
    await until(() => viewer.status.get().state === 'ready')
    const look = (b: HTMLElement) => {
      const s = getComputedStyle(b)
      return { opacity: s.opacity, cursor: s.cursor, background: s.backgroundColor }
    }
    const idle = look(download)
    expect(idle.opacity).toBe('1')
    expect(idle.cursor).toBe('pointer')
    // Measured before the change below, which gives Undo something to undo.
    const disabled = look(undo)
    expect(undo.disabled).toBe(true)
    addSquare(viewer)
    download.click()
    await until(held.writing)
    await userEvent.hover(download)
    const busyLook = look(download)
    expect(busyLook.opacity).toBe(disabled.opacity)
    expect(busyLook.opacity).toBe('0.5')
    expect(busyLook.cursor).toBe('progress')
    // No hover background while it cannot be pressed.
    expect(busyLook.background).toBe(idle.background)
    held.finish()
    await until(() => download.getAttribute('aria-busy') === 'false')
    expect(look(download).opacity).toBe('1')
  })

  it('a copy that cannot be written downloads nothing, tells the reader and onError', async () => {
    const clicked = catchDownloads()
    const held = heldEngine()
    const errors: InkError[] = []
    const viewer = make({ onError: (e) => errors.push(e) })
    const download = createDownloadButton(viewer)
    const print = createPrintButton(viewer)
    await until(() => viewer.status.get().state === 'ready')
    addSquare(viewer)
    print.click()
    await until(held.writing)
    expect(busy(print)).toBe(true)
    held.fail(new Error('write failed'))
    await until(() => errors.length === 1)
    expect(errors[0]).toMatchObject({ code: 'SaveFailed', details: { stage: 'write' } })
    expect(alertText()).toBe('Your changes could not be written into this file.')
    expect(document.querySelector('[data-ink-print-frame]')).toBeNull()
    expect(busy(print)).toBe(false)
    expect(busy(download)).toBe(false)
    expect(print.disabled).toBe(false)

    // The same from the method, which rejects too.
    const saving = viewer.download()
    await until(held.writing)
    held.fail(new Error('write failed'))
    await expect(saving).rejects.toMatchObject({ code: 'SaveFailed' })
    expect(errors).toHaveLength(2)
    expect(clicked).toHaveLength(0)
  })

  it('Ctrl+S that fails is reported as the button is', async () => {
    const held = heldEngine()
    const errors: InkError[] = []
    const viewer = make({ onError: (e) => errors.push(e) })
    await until(() => viewer.status.get().state === 'ready')
    addSquare(viewer)
    const scroll = viewer.element.querySelector<HTMLElement>('[data-ink-scroll]')!
    scroll.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    )
    await until(held.writing)
    held.fail(new Error('write failed'))
    await until(() => errors.length === 1)
    expect(errors[0]!.code).toBe('SaveFailed')
    expect(alertText()).toBe('Your changes could not be written into this file.')
  })

  it('says saving is unavailable while the document has stopped', async () => {
    const clicked = catchDownloads()
    const engines = stoppableEngines()
    cleanup.push(() => engines.restore())
    const errors: InkError[] = []
    const viewer = make({ onError: (e) => errors.push(e) })
    const download = createDownloadButton(viewer)
    viewer.element.prepend(download)
    await until(() => viewer.status.get().state === 'ready')
    addSquare(viewer)
    await engines.stop(viewer.document.get()!)
    // The stop, reported as it happens.
    expect(errors.map((e) => e.code)).toEqual(['EngineUnavailable'])
    download.click()
    await until(() => errors.length === 2)
    // The press that found it stopped reports its own failure, as a failed download does.
    expect(errors.map((e) => e.code)).toEqual(['EngineUnavailable', 'EngineUnavailable'])
    expect(alertText()).toBe('Saving is not available while the viewer is stopped.')
    expect(clicked).toHaveLength(0)
    expect(busy(download)).toBe(false)
  })

  it('with no changes downloads the opened file and writes nothing', async () => {
    const clicked = catchDownloads()
    const held = heldEngine()
    const viewer = make()
    await until(() => viewer.status.get().state === 'ready')
    await viewer.download()
    expect(clicked).toHaveLength(1)
    expect(held.writes()).toBe(0)
  })
})
