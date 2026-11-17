/*
 * Download and print for a document. Both hand over the PDF as a file: `document.save()` when
 * the document was opened with an `engine` loader (the file with this session's annotations and
 * changed form values written into it, or the opened bytes when nothing changed), else
 * `document.getData()`, the bytes it was opened from.
 */
import { isInkError, type InkError } from '../model/errors'
import { readonly, writable, type Readable, type Writable } from '../model/readable'

import type { InkMessages } from '../messages'
import type { InkDocument } from '../model/document'

export interface DownloadOptions {
  /** The name to save under. Default: the document's `fileName`. */
  filename?: string
}

/** Each document's busy state, made on first use. */
const busyByDoc = new WeakMap<
  InkDocument,
  { state: Writable<boolean>; view: Readable<boolean> }
>()

function busyOf(doc: InkDocument): { state: Writable<boolean>; view: Readable<boolean> } {
  let found = busyByDoc.get(doc)
  if (!found) {
    const state = writable(false)
    found = { state, view: readonly(state) }
    busyByDoc.set(doc, found)
  }
  return found
}

/**
 * True while a download or print of `doc` is writing its copy: from the moment one starts until
 * the copy is ready or has failed, not until the print dialog closes. Meanwhile another download
 * or print of `doc` does nothing. The same store on every call.
 */
export function fileBusy(doc: InkDocument): Readable<boolean> {
  return busyOf(doc).view
}

/**
 * The document's file as an object URL; revoke it when done. Marks `doc` busy until the URL is
 * made or the copy has failed; undefined, doing nothing, when `doc` is busy already.
 */
async function fileUrl(doc: InkDocument): Promise<string | undefined> {
  const { state } = busyOf(doc)
  if (state.get()) return undefined
  state.set(true)
  try {
    const data = await (doc._saves ? doc.save() : doc.getData())
    return URL.createObjectURL(new Blob([data.slice()], { type: 'application/pdf' }))
  } finally {
    state.set(false)
  }
}

/** How long an object URL outlives the click that starts a download from it. */
const REVOKE_AFTER_MS = 30_000

/**
 * Saves the document's file through the browser's download. Rejects with `SaveFailed`, having
 * downloaded nothing, when the copy could not be written. Does nothing while `fileBusy(doc)`.
 */
export async function downloadDocument(
  doc: InkDocument,
  opts: DownloadOptions = {}
): Promise<void> {
  const url = await fileUrl(doc)
  if (url === undefined) return
  const a = document.createElement('a')
  a.href = url
  a.download = opts.filename ?? doc.fileName
  a.hidden = true
  document.body.append(a)
  a.click()
  a.remove()
  // Some browsers read the URL after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}

/** iOS prints nothing from a frame: the PDF opens in a tab, where its own print is. */
function printsFromFrame(): boolean {
  const { platform, maxTouchPoints } = navigator
  const ios =
    /iP(hone|od|ad)/.test(platform) || (platform === 'MacIntel' && maxTouchPoints > 1)
  return !ios
}

/** The frame the last print loaded, kept so its dialog can finish, and its URL. */
let lastPrint: { frame: HTMLIFrameElement; url: string } | null = null

/**
 * Prints the document's file: it loads into a hidden frame and the browser's own PDF viewer
 * prints it, so text stays sharp. Where a frame cannot print (iOS), the PDF opens in a new tab:
 * the tab opens at once, inside the press that asked, since a tab opened once the copy is
 * written would be blocked, and goes to the file when it is ready. Resolves once the print
 * dialog has been asked for. Rejects with `SaveFailed`, having printed nothing and closed the
 * tab, when the copy could not be written. Does nothing while `fileBusy(doc)`.
 */
export async function printDocument(doc: InkDocument): Promise<void> {
  if (fileBusy(doc).get()) return
  if (!printsFromFrame()) return printInTab(doc)
  const url = await fileUrl(doc)
  if (url === undefined) return
  if (lastPrint) {
    lastPrint.frame.remove()
    URL.revokeObjectURL(lastPrint.url)
  }
  const frame = document.createElement('iframe')
  frame.setAttribute('data-ink-print-frame', '')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  // Out of sight, but laid out: a frame with display none never loads its PDF.
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none'
  lastPrint = { frame, url }
  const loaded = new Promise<void>((resolve) => {
    frame.addEventListener('load', () => resolve(), { once: true })
  })
  frame.src = url
  document.body.append(frame)
  await loaded
  frame.contentWindow?.focus()
  frame.contentWindow?.print()
}

/**
 * Opens a blank tab now, synchronously in the caller's press, then sends it to the file. It
 * cannot be opened with `noopener`, which hands back no window to send on; the tab's `opener`
 * is cleared at once instead, so the page it shows has no way back to this one.
 */
async function printInTab(doc: InkDocument): Promise<void> {
  const tab = window.open('', '_blank')
  if (tab) tab.opener = null
  let url: string | undefined
  try {
    url = await fileUrl(doc)
  } catch (error) {
    tab?.close()
    throw error
  }
  if (url === undefined) {
    tab?.close()
    return
  }
  // A blocked blank tab: one last try, as before the copy was written.
  if (tab) tab.location.replace(url)
  else window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}

/**
 * The error a download or print failed with, when it is one to tell the reader about (the copy
 * could not be written), with the words to tell them: `viewer.saveUnavailable` when the engine
 * could not be loaded or started, `viewer.saveFailed` otherwise. Undefined for any other
 * failure, such as the document closing meanwhile.
 */
export function fileActionFailure(
  error: unknown,
  messages: InkMessages
): { error: InkError; message: string } | undefined {
  if (!isInkError(error) || error.code !== 'SaveFailed') return undefined
  return {
    error,
    message:
      error.details['stage'] === 'engine'
        ? messages.viewer.saveUnavailable
        : messages.viewer.saveFailed,
  }
}

/**
 * Ctrl or Cmd+P prints and Ctrl or Cmd+S downloads, for keys pressed anywhere inside `el`,
 * while `doc()` gives a ready document. Then the key is taken from the browser, which would
 * print or save the web page; otherwise it is left alone. While `fileBusy` the key is still
 * taken, and does nothing. A download or print that fails passes its error to `onError`.
 * Returns a function that removes the listener.
 */
export function attachFileKeys(
  el: HTMLElement,
  doc: () => InkDocument | null | undefined,
  onError?: (error: unknown) => void
): () => void {
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.isComposing || e.altKey || e.shiftKey) return
    if (!(e.ctrlKey || e.metaKey)) return
    const key = e.key.toLowerCase()
    if (key !== 'p' && key !== 's') return
    const d = doc()
    if (!d || d.status.get().state !== 'ready') return
    e.preventDefault()
    void (key === 'p' ? printDocument(d) : downloadDocument(d)).catch((error: unknown) =>
      onError?.(error)
    )
  }
  el.addEventListener('keydown', onKeydown)
  return () => el.removeEventListener('keydown', onKeydown)
}
