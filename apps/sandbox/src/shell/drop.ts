/*
 * Opening your own PDF: a file dropped on the viewer, or picked with the file input. A file
 * that is not a PDF is refused with a message; a broken PDF reaches the viewer, which shows
 * its own error. The latest file wins: a read that finishes after a newer one began, or after
 * `reset`, is dropped.
 */
import type { DocumentSource } from '@inkbar/core'

export interface DropOptions {
  /** The element a file is dropped on. */
  target: HTMLElement
  input: HTMLInputElement
  /** Where "Opened…" and "…is not a PDF." are written. */
  status: HTMLElement
  /** Returns whether a viewer took the source; false when no viewer can. */
  open(this: void, source: DocumentSource): boolean
}

export interface DropHandle {
  /** Forgets any read still under way and clears the status. */
  reset(): void
}

const isPdf = (file: File): boolean =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

const isFileDrag = (e: DragEvent): boolean =>
  e.dataTransfer?.types.includes('Files') ?? false

let windowGuarded = false

/** A file dropped outside the viewer would make the browser navigate to it. */
function guardWindow(): void {
  if (windowGuarded) return
  windowGuarded = true
  window.addEventListener('dragover', (e) => {
    if (isFileDrag(e)) e.preventDefault()
  })
  window.addEventListener('drop', (e) => {
    if (isFileDrag(e)) e.preventDefault()
  })
}

export function handleDrops({ target, input, status, open }: DropOptions): DropHandle {
  let latest = 0

  async function read(file: File): Promise<void> {
    const request = ++latest
    if (!isPdf(file)) {
      status.textContent = `${file.name} is not a PDF.`
      return
    }
    let data: Uint8Array
    try {
      data = new Uint8Array(await file.arrayBuffer())
    } catch {
      if (request === latest) status.textContent = `${file.name} could not be read.`
      return
    }
    if (request !== latest) return
    const taken = open({
      data,
      key: `file:${file.name}:${file.size}:${file.lastModified}`,
    })
    status.textContent = taken
      ? `Opened ${file.name}.`
      : `There is no viewer to open ${file.name} in.`
  }

  guardWindow()
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    input.value = ''
    if (file) void read(file)
  })
  target.addEventListener('dragover', (e) => {
    if (!isFileDrag(e)) return
    e.preventDefault()
    target.dataset.drop = ''
  })
  target.addEventListener('dragleave', (e) => {
    // Moving over a child of the target fires dragleave too; only clear when truly outside.
    if (e.relatedTarget instanceof Node && target.contains(e.relatedTarget)) return
    delete target.dataset.drop
  })
  target.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files[0]
    if (!file) return
    e.preventDefault()
    delete target.dataset.drop
    void read(file)
  })

  return {
    reset() {
      latest++
      status.textContent = ''
    },
  }
}
