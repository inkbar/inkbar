/*
 * Download and print for a document. Both hand over the PDF as a file (`document.getData()`):
 * today the bytes it was opened from, without this session's annotations.
 */
import type { InkDocument } from '../model/document'

export interface DownloadOptions {
  /** The name to save under. Default: the document's `fileName`. */
  filename?: string
}

/** The document's file as an object URL; revoke it when done. */
async function fileUrl(doc: InkDocument): Promise<string> {
  const data = await doc.getData()
  return URL.createObjectURL(new Blob([data.slice()], { type: 'application/pdf' }))
}

/** How long an object URL outlives the click that starts a download from it. */
const REVOKE_AFTER_MS = 30_000

/** Saves the document's file through the browser's download. */
export async function downloadDocument(
  doc: InkDocument,
  opts: DownloadOptions = {}
): Promise<void> {
  const url = await fileUrl(doc)
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
 * prints it, so text stays sharp. Where a frame cannot print (iOS), the PDF opens in a new tab.
 * Resolves once the print dialog has been asked for.
 */
export async function printDocument(doc: InkDocument): Promise<void> {
  const url = await fileUrl(doc)
  if (!printsFromFrame()) {
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
    return
  }
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
 * Ctrl or Cmd+P prints and Ctrl or Cmd+S downloads, for keys pressed anywhere inside `el`,
 * while `doc()` gives a ready document. Then the key is taken from the browser, which would
 * print or save the web page; otherwise it is left alone. Returns a function that removes the
 * listener.
 */
export function attachFileKeys(
  el: HTMLElement,
  doc: () => InkDocument | null | undefined
): () => void {
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.isComposing || e.altKey || e.shiftKey) return
    if (!(e.ctrlKey || e.metaKey)) return
    const key = e.key.toLowerCase()
    if (key !== 'p' && key !== 's') return
    const d = doc()
    if (!d || d.status.get().state !== 'ready') return
    e.preventDefault()
    // Ready, so the file is there: nothing to report if the document goes meanwhile.
    void (key === 'p' ? printDocument(d) : downloadDocument(d)).catch(() => undefined)
  }
  el.addEventListener('keydown', onKeydown)
  return () => el.removeEventListener('keydown', onKeydown)
}
