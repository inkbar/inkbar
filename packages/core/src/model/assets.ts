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
   * URL of the engine's `worker.mjs`, from `@inkbar/engine`. Same origin as the page. Ignored in
   * Node, where the engine runs in the calling thread.
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

/**
 * Throws `AssetConfigMissing`, naming the first key that is wrong in `details.key`, unless
 * `value` is a `PdfAssets`: `engine`, `worker` and `sandbox` non-empty strings, and `fonts` a
 * non-empty string, an object or `false`.
 */
export function assertAssets(value: unknown): asserts value is PdfAssets {
  const key = firstBad(value)
  if (key === undefined) return
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
