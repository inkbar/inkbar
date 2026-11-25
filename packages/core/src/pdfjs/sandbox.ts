// The kept PDF.js scripting sandbox: where its module comes from, the patch to its scripting
// source, and the document actions in the format it is started with.
import type { QuickJSSandbox } from '#pdfjs-sandbox'
import type { FileScripts } from '../reader/file'

export { ACTION_COMMAND, patchSandboxSource } from './sandbox-patch'
export type { PdfjsSandbox } from '#pdfjs-sandbox'

/** Where the sandbox module comes from. An object, so tests can see whether it was loaded. */
export const sandboxLoader = {
  load: (): Promise<{ QuickJSSandbox: typeof QuickJSSandbox }> =>
    import('#pdfjs-sandbox'),
}

/**
 * The document's actions as the sandbox takes them, in the order PDF.js lists them: the event
 * actions, then the document's scripts in name order, then the open action. `null` when there
 * are none.
 *
 * @internal
 */
export function sandboxDocumentActions(
  scripts: FileScripts
): Map<string, string[]> | null {
  const out = new Map<string, string[]>()
  const { OpenAction: open, ...events } = scripts.documentActions
  for (const [name, sources] of Object.entries(events)) out.set(name, [...sources])
  for (const { name, source } of scripts.document) {
    const list = out.get(name)
    if (list) list.push(source)
    else out.set(name, [source])
  }
  if (open) out.set('OpenAction', [...open])
  return out.size > 0 ? out : null
}
