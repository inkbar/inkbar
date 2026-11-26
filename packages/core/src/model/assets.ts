// The files a document needs from the host, and the check `openDocument` makes of them before
// anything loads.
import { InkError } from './errors'

import type { FontKey } from '@inkbar/engine/bare'

/**
 * Where Inkbar's own files are served from. The Vite plugin (`@inkbar/core/vite`) copies them
 * and gives this object as `assets` from `virtual:inkbar-assets`. A host that serves them by hand
 * copies them from Inkbar's packages, matched to the installed version.
 */
export interface PdfAssets {
  /** URL of `inkbar-pdfium.wasm`, from `@inkbar/engine`. In Node, a file path or `file:` URL. */
  engine: string
  /**
   * URL of the engine's `worker.mjs`, from `@inkbar/engine`. On another origin than the page, that
   * origin must send CORS headers for it. Ignored in Node, where the engine runs in the calling
   * thread.
   */
  worker: string
  /**
   * Fallback fonts for text a file does not embed: a directory URL holding the five files of
   * `@inkbar/fonts` (a `/` is added when it does not end in one), or one URL per font, or `false`
   * for none. A font that cannot be fetched is reported with `console.warn` and its text drawn
   * with a substitute.
   */
  fonts: string | Partial<Record<FontKey, string>> | false
  /**
   * Directory URL, ending in `/`, holding `quickjs-eval.js` and `quickjs-eval.wasm` from
   * `pdfjs-dist/wasm/`, which run a form's scripts. When they cannot be loaded the form reports a
   * `FormScriptError` and stays fillable.
   */
  sandbox: string
}

const STRINGS = ['engine', 'worker'] as const

/** The first key of `value` that is not as `PdfAssets` describes, or `undefined`. */
function firstBad(value: unknown): keyof PdfAssets | undefined {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >
  const filled = (key: string) => typeof record[key] === 'string' && record[key] !== ''
  for (const key of STRINGS) if (!filled(key)) return key
  const fonts = record['fonts']
  const fontsOk =
    fonts === false ||
    (typeof fonts === 'string' && fonts !== '') ||
    (typeof fonts === 'object' && fonts !== null && !Array.isArray(fonts))
  if (!fontsOk) return 'fonts'
  if (!filled('sandbox')) return 'sandbox'
  return undefined
}

/** The first key of `assets` holding a URL that cannot be read against the page, and the URL. */
function firstUnreadable(
  assets: PdfAssets
): { key: keyof PdfAssets; url: string } | undefined {
  const base = (globalThis as { document?: { baseURI?: string } }).document?.baseURI
  // With no page (Node) the engine may be a file path: nothing to read it against.
  if (!base) return undefined
  const { fonts } = assets
  const urls: [keyof PdfAssets, string][] = [
    ['engine', assets.engine],
    ['worker', assets.worker],
    ...(typeof fonts === 'string'
      ? [['fonts', fonts] as [keyof PdfAssets, string]]
      : fonts === false
        ? []
        : Object.values(fonts).flatMap((url): [keyof PdfAssets, string][] =>
            typeof url === 'string' ? [['fonts', url]] : []
          )),
    ['sandbox', assets.sandbox],
  ]
  for (const [key, url] of urls) {
    try {
      new URL(url, base)
    } catch {
      return { key, url }
    }
  }
  return undefined
}

/**
 * Throws `AssetConfigMissing`, naming the first key that is wrong in `details.key`, unless
 * `value` is a `PdfAssets`: `engine`, `worker` and `sandbox` non-empty strings, and `fonts` a
 * non-empty string, an object or `false`, each URL one that can be read against the page.
 */
export function assertAssets(value: unknown): asserts value is PdfAssets {
  const key = firstBad(value)
  if (key === undefined) {
    const unreadable = firstUnreadable(value as PdfAssets)
    if (!unreadable) return
    throw new InkError(
      'AssetConfigMissing',
      `The \`${unreadable.key}\` URL in the \`assets\` option, ${JSON.stringify(unreadable.url)}, is not a valid URL.`,
      { key: unreadable.key }
    )
  }
  throw new InkError(
    'AssetConfigMissing',
    `openDocument needs an \`assets\` option with \`${key}\` set: \`engine\`, \`worker\` and \`sandbox\` are URLs, and \`fonts\` a URL, a map of URLs or false. ` +
      'Vite users: add the @inkbar/core/vite plugin and pass `assets` from "virtual:inkbar-assets".',
    { key }
  )
}

/**
 * `url` resolved against the page, so a relative URL means the same wherever it is used: in the
 * engine's worker, whose own URL is the worker script's, or in a dynamic import, which resolves
 * against the importing chunk. Unchanged where there is no page (Node).
 */
export function fromPage(url: string): string {
  const base = (globalThis as { document?: { baseURI?: string } }).document?.baseURI
  return base ? new URL(url, base).href : url
}

/**
 * The sandbox's directory as its loader takes it: resolved against the page, ending in `/`. The
 * loader names its files by adding their names to it.
 */
export function sandboxDirectory(assets: Pick<PdfAssets, 'sandbox'>): string {
  const dir = assets.sandbox.endsWith('/') ? assets.sandbox : `${assets.sandbox}/`
  return fromPage(dir)
}
