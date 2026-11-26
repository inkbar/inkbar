// Tests only, never shipped: lint refuses an import of this module from any other file. PDF.js as
// a second reader, so a test can check that a file Inkbar wrote opens and reads elsewhere too.
//
// It imports pdfjs-dist itself: the legacy build in Node, which has no DOM, and the browser build
// in a browser. PDF.js's own files (worker, CMaps, standard fonts, wasm, ICC profiles) come from
// the installed package in Node, and in a browser from where the fixture server (`serveFixtures`)
// puts them, under `/pdfjs/`.
import type * as PdfjsModule from 'pdfjs-dist'

type Pdfjs = typeof PdfjsModule

/** Where PDF.js's files are, as `getDocument` and its worker take them. */
interface Files {
  worker: string
  cMaps: string
  standardFonts: string
  wasm: string
  icc: string
}

function files(): Files {
  if (typeof window !== 'undefined')
    return {
      worker: '/pdfjs/build/pdf.worker.min.mjs',
      cMaps: '/pdfjs/cmaps/',
      standardFonts: '/pdfjs/standard_fonts/',
      wasm: '/pdfjs/wasm/',
      icc: '/pdfjs/iccs/',
    }
  const nodeModule = process.getBuiltinModule('node:module')
  const path = process.getBuiltinModule('node:path')
  const require = nodeModule.createRequire(import.meta.url)
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'))
  return {
    worker: require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
    cMaps: path.join(root, 'cmaps') + '/',
    standardFonts: path.join(root, 'standard_fonts') + '/',
    wasm: path.join(root, 'wasm') + '/',
    icc: path.join(root, 'iccs') + '/',
  }
}

/** The legacy build, named through a variable so a browser test's bundler never fetches it. */
const LEGACY = 'pdfjs-dist/legacy/build/pdf.mjs'

let loaded: Promise<Pdfjs> | undefined

/** PDF.js, loaded once, its worker set. */
function load(): Promise<Pdfjs> {
  loaded ??= (
    typeof window === 'undefined'
      ? (import(/* @vite-ignore */ LEGACY) as Promise<Pdfjs>)
      : import('pdfjs-dist')
  ).then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = files().worker
    return pdfjs
  })
  return loaded
}

/** A text item as PDF.js reads it: its string, its transform and its size in user space. */
export interface SecondReaderText {
  str: string
  /** `[a, b, c, d, e, f]`; `e` and `f` are where the item starts. */
  transform: number[]
  width: number
  height: number
}

/** A file open in PDF.js. Pages are zero-based. */
export interface SecondReader {
  readonly pageCount: number
  /**
   * The page's annotations as PDF.js lists them, in its own shape. `intent: 'any'` lists hidden
   * ones too; by default only those a viewer shows.
   */
  annotations(page: number, options?: { intent?: 'display' | 'any' }): Promise<unknown[]>
  /** The page's text items, marked-content markers left out. */
  text(page: number): Promise<SecondReaderText[]>
  /** The page's viewport at `scale` CSS pixels a point, turned `rotation` degrees in all. */
  viewport(
    page: number,
    options: { scale: number; rotation?: number }
  ): Promise<{
    width: number
    height: number
    transform: number[]
    convertToViewportPoint(x: number, y: number): number[]
    convertToPdfPoint(x: number, y: number): number[]
  }>
  /**
   * Draws the page on white with every annotation the file holds, at `scale` CSS pixels a point,
   * into a new canvas sized to it. Browser only.
   */
  render(page: number, scale: number): Promise<HTMLCanvasElement>
  destroy(): Promise<void>
}

/** `bytes` open in PDF.js; `destroy()` it when done. PDF.js is given a copy of the bytes. */
export async function openSecondReader(
  bytes: Uint8Array,
  password?: string
): Promise<SecondReader> {
  const pdfjs = await load()
  const at = files()
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    ...(password !== undefined ? { password } : {}),
    // PDF.js's warnings about the files are not the tests' subject.
    verbosity: 0,
    cMapUrl: at.cMaps,
    cMapPacked: true,
    standardFontDataUrl: at.standardFonts,
    wasmUrl: at.wasm,
    iccUrl: at.icc,
  })
  const doc = await task.promise.catch(async (error: unknown) => {
    await task.destroy()
    throw error
  })
  const page = (index: number) => doc.getPage(index + 1)
  return {
    pageCount: doc.numPages,
    annotations: async (index, options) =>
      (await page(index)).getAnnotations(options) as Promise<unknown[]>,
    text: async (index) =>
      (await (await page(index)).getTextContent()).items.flatMap((item) =>
        'str' in item
          ? [
              {
                str: item.str,
                transform: item.transform as number[],
                width: item.width,
                height: item.height,
              },
            ]
          : []
      ),
    viewport: async (index, { scale, rotation }) =>
      (await page(index)).getViewport({
        scale,
        ...(rotation !== undefined ? { rotation } : {}),
      }),
    render: async (index, scale) => {
      const proxy = await page(index)
      const viewport = proxy.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await proxy.render({
        canvas,
        viewport,
        background: '#ffffff',
        annotationMode: pdfjs.AnnotationMode.ENABLE,
      }).promise
      return canvas
    },
    destroy: () => task.destroy(),
  }
}
