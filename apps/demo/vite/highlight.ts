/*
 * `import source from './Demo.tsx?highlight'` gives `{ html, code }`: the file highlighted by
 * Shiki at build time, and its raw text for the copy button. Shiki never reaches the browser.
 */
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

import { createHighlighter, type Highlighter, type ThemeRegistration } from 'shiki'

import theme from './inkbar-ink.json' with { type: 'json' }

import type { Plugin } from 'vite'

const LANGS = { '.ts': 'ts', '.tsx': 'tsx', '.vue': 'vue', '.svelte': 'svelte' } as const
type Lang = (typeof LANGS)[keyof typeof LANGS]

const QUERY = '?highlight'
const PREFIX = '\0inkbar-demo-highlight:'

export function langFor(file: string): Lang {
  const lang = (LANGS as Record<string, Lang | undefined>)[extname(file)]
  if (!lang) throw new Error(`No highlighter language for ${file}`)
  return lang
}

let highlighter: Promise<Highlighter> | undefined

export async function highlight(code: string, lang: Lang): Promise<string> {
  highlighter ??= createHighlighter({
    themes: [theme as ThemeRegistration],
    langs: Object.values(LANGS),
  })
  return (await highlighter).codeToHtml(code, { lang, theme: theme.name })
}

export function highlightSource(): Plugin {
  return {
    name: 'inkbar-demo:highlight-source',
    enforce: 'pre',
    async resolveId(id, importer) {
      if (!id.endsWith(QUERY)) return null
      const target = await this.resolve(id.slice(0, -QUERY.length), importer, {
        skipSelf: true,
      })
      return target ? PREFIX + target.id.split('?')[0] : null
    },
    async load(id) {
      if (!id.startsWith(PREFIX)) return null
      const file = id.slice(PREFIX.length)
      this.addWatchFile(file)
      const code = await readFile(file, 'utf8')
      const html = await highlight(code, langFor(file))
      return `export default ${JSON.stringify({ html, code })}`
    },
  }
}
