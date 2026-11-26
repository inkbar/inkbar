// Compares two readers' JavaScript: the file's scripts and each page's actions. Each difference is
// one line naming the script or the key, PDF.js's value first.
import { pairDifferences, valueDifferences, type FileScripts } from './data'

/** What a reader gives of the file's JavaScript. */
export interface ScriptRead {
  /** `scripts()`. */
  scripts: FileScripts | undefined
  /** `pageScripts(page)` for every page of the file. */
  pages: Record<string, string[]>[]
}

/**
 * How the engine's JavaScript (`b`) differs from PDF.js's (`a`): whether the file has any; the
 * document scripts, by name and in order, each source as text; every other key of the scripts,
 * the calculation order and field entries included; and each page's actions. Empty when they
 * agree.
 */
export function scriptDifferences(a: ScriptRead, b: ScriptRead): string[] {
  const out: string[] = []
  if ((a.scripts === undefined) !== (b.scripts === undefined)) {
    out.push(
      `scripts: PDF.js ${a.scripts ? 'some' : 'none'}, engine ${b.scripts ? 'some' : 'none'}`
    )
  } else if (a.scripts && b.scripts) {
    const { document: da, ...ra } = a.scripts
    const { document: db, ...rb } = b.scripts
    out.push(
      ...pairDifferences(da, db, {
        noun: 'document script',
        plural: 'document scripts',
        keyName: 'name',
        keyOf: (s) => s.name,
        showKey: (name) => JSON.stringify(name),
        each: (x, y, at) => valueDifferences(x.source, y.source, `${at}: source`),
      }),
      ...valueDifferences(ra, rb)
    )
  }
  if (a.pages.length !== b.pages.length)
    out.push(`pages: PDF.js ${a.pages.length}, engine ${b.pages.length}`)
  a.pages.forEach((page, i) => {
    if (i < b.pages.length)
      out.push(...valueDifferences(page, b.pages[i], `page ${i + 1}`))
  })
  return out
}
