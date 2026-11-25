// The file's JavaScript as PDF.js reads it, in core's shape: `/CO`, the document's scripts and
// actions, and each page's actions.
import type { PdfjsDocument } from './types'
import type { FileScripts } from '../reader/file'

/** The document action events PDF.js lists among the document's scripts. */
const DOCUMENT_EVENTS: ReadonlySet<string> = new Set([
  'OpenAction',
  'WillClose',
  'WillSave',
  'DidSave',
  'WillPrint',
  'DidPrint',
])

/**
 * The file's JavaScript, or `undefined` when neither the document nor any field has any. PDF.js
 * gives the document's scripts and actions as one list by name; a script named like an event
 * stays with that event's actions.
 *
 * @internal
 */
export async function fileScriptsFromPdfjs(
  proxy: PdfjsDocument
): Promise<FileScripts | undefined> {
  // Cheap, and never misses JavaScript; the stricter check below needs the field objects.
  if (!(await proxy.hasJSActions())) return undefined
  const [objects, ids, actions] = await Promise.all([
    proxy.getFieldObjects(),
    proxy.getCalculationOrderIds(),
    proxy.getJSActions() as Promise<Map<string, string[]> | null>,
  ])
  const hasFieldScripts = [...(objects?.values() ?? [])].some((list) =>
    list.some((o) => hasEntries((o as { actions?: unknown }).actions))
  )
  if (!hasFieldScripts && !hasEntries(actions)) return undefined

  const names = new Map<string, string>()
  const fields: FileScripts['fields'] = []
  for (const [name, list] of objects ?? []) {
    let container: string | undefined
    const widgets: string[] = []
    for (const o of list) {
      const { id, type } = o as { id?: unknown; type?: unknown }
      if (typeof id !== 'string') continue
      if (!names.has(id)) names.set(id, name)
      if (type !== '') widgets.push(id)
      else container ??= id
    }
    if (widgets.length > 0)
      fields.push({
        name,
        ...(container !== undefined ? { id: container } : {}),
        widgets,
      })
  }
  const document: FileScripts['document'] = []
  const documentActions: FileScripts['documentActions'] = {}
  for (const [name, sources] of actions ?? []) {
    if (DOCUMENT_EVENTS.has(name)) documentActions[name] = [...sources]
    else for (const source of sources) document.push({ name, source })
  }
  return {
    calculationOrder: (ids ?? []).flatMap((id) => names.get(id) ?? []),
    calculationOrderIds: [...(ids ?? [])],
    document,
    documentActions,
    fields,
  }
}

/**
 * The page's actions by event, `{}` when it has none. Read straight from PDF.js, not through the
 * document's page cache, as the form's scripts always have.
 *
 * @internal
 */
export async function pageScriptsFromPdfjs(
  proxy: PdfjsDocument,
  page: number
): Promise<Record<string, string[]>> {
  const actions = (await (await proxy.getPage(page + 1)).getJSActions()) as Map<
    string,
    string[]
  > | null
  return actions ? Object.fromEntries(actions) : {}
}

function hasEntries(value: unknown): boolean {
  if (value instanceof Map) return value.size > 0
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0
}
