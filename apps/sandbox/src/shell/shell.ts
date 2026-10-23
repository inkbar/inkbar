/*
 * The page around each framework's viewer, and around the plugin page's: header, intro, file
 * control, viewer slot and source panel. It knows nothing about any framework: each page
 * passes a `mount` function and the shell calls it again with a new source when the reader
 * opens a file.
 */
import '../styles/framework.css'

import { FRAMEWORK_ORDER, FRAMEWORKS, PLUGIN_PAGE, type PageId } from './frameworks'
import { LOGO_SVG } from './logo'

import type { DocumentSource } from '@inkbar/core'

export interface SourceFile {
  /** Relative to `apps/sandbox/`. */
  path: string
  source: { html: string; code: string }
  /** A line or two above the code, saying what the file does. */
  note?: string
}

export interface ShellOptions {
  page: PageId
  files: SourceFile[]
  /** Mounts the viewer for `source` into `el` and returns a function that unmounts it. */
  mount(el: HTMLElement, source: DocumentSource): () => void
}

const REPO = 'https://github.com/inkbar/inkbar'
const BASE = import.meta.env.BASE_URL
const SAMPLE: DocumentSource = { url: `${BASE}sample.pdf`, key: 'sample' }

const isPdf = (file: File): boolean =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

function fileSection(file: SourceFile, index: number): string {
  const name = file.path.split('/').pop() ?? file.path
  return `<section class="source-file" aria-label="${name}">
  <div class="source-head">
    <h3>${name}</h3>
    <button type="button" class="text-button" data-copy="${index}">Copy</button>
    <a class="text-link" href="${REPO}/blob/main/apps/sandbox/${file.path}">View on GitHub</a>
  </div>
  ${file.note ? `<p class="source-note">${file.note}</p>` : ''}
  ${file.source.html}
</section>`
}

const COPY_ICON =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>'

export function startShell(opts: ShellOptions): void {
  const isPlugin = opts.page === 'plugin'
  const fw = opts.page === 'plugin' ? PLUGIN_PAGE : FRAMEWORKS[opts.page]
  const current = (page: PageId): string =>
    page === opts.page ? ' aria-current="page"' : ''
  const heading = isPlugin
    ? 'Writing a <span class="mark">plugin</span>'
    : `Inkbar in <span class="mark">${fw.name}</span>`
  const sourceIntro = isPlugin
    ? `<h2 id="source-title">The plugin</h2>
      <p class="caption">Every file is in <code>src/plugin</code>. The viewer above is the TypeScript page's.</p>`
    : `<h2 id="source-title">The whole integration</h2>
      <p class="caption">This file is everything this page does with Inkbar. The plugin it registers is on <a class="text-link" href="${BASE}plugin/">its own page</a>, and the page around them is in <code>src/shell</code>.</p>`
  document.title = `${fw.name} · Inkbar sandbox`
  const app = document.getElementById('app')!
  app.innerHTML = `
<header class="site-header">
  <div class="container site-header-inner">
    <a class="brand" href="${BASE}">${LOGO_SVG}<span class="wordmark">inkbar</span><span class="wordmark-suffix">sandbox</span><span class="visually-hidden"> home</span></a>
    <nav aria-label="Frameworks">
      <ul class="frameworks">
        ${FRAMEWORK_ORDER.map(
          (id) =>
            `<li><a href="${BASE}${id}/"${current(id)}>${FRAMEWORKS[id].name}</a></li>`
        ).join('')}
      </ul>
    </nav>
    <nav class="site-nav" aria-label="Main">
      <a href="${BASE}plugin/"${current('plugin')}>${PLUGIN_PAGE.name}</a>
      <a href="https://inkbar.dev/docs/">Docs</a>
      <a href="${REPO}">GitHub</a>
    </nav>
  </div>
</header>
<main class="container page">
  <div class="intro">
    <div class="intro-copy">
      <h1>${heading}</h1>
      <p class="lede">${fw.blurb}</p>
    </div>
    <div class="install-box">
      <code class="install"><span aria-hidden="true">$</span>${fw.install}</code>
      <button type="button" class="icon-button" data-copy-install aria-label="Copy install command">${COPY_ICON}</button>
    </div>
  </div>
  <section class="viewer-section" aria-label="Viewer">
    <div class="viewer-bar">
      <p class="caption">A tour of every annotation, then a form to fill in. Drop a PDF on the viewer to try your own. It stays in your browser.</p>
      <p class="caption" role="status" data-file-status></p>
      <label class="file-link">
        <input type="file" accept="application/pdf,.pdf" class="visually-hidden" />
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 18v-6M9 15l3-3 3 3"/></svg>
        Open a PDF
      </label>
    </div>
    <div class="viewer" data-viewer></div>
  </section>
  <section class="source" aria-labelledby="source-title">
    <div class="source-intro">
      ${sourceIntro}
    </div>
    ${opts.files.map(fileSection).join('')}
  </section>
</main>
<footer class="site-footer">
  <div class="container site-footer-inner">
    <p>MIT licensed. From the team behind <a href="https://redactr.io">Redactr</a>.</p>
    <nav aria-label="Footer">
      <a href="${BASE}">All sandboxes</a>
      <a href="${BASE}plugin/">${PLUGIN_PAGE.name}</a>
      <a href="https://inkbar.dev/docs/">Docs</a>
      <a href="${REPO}">GitHub</a>
    </nav>
  </div>
</footer>`

  const viewer = app.querySelector<HTMLElement>('[data-viewer]')!
  const input = app.querySelector<HTMLInputElement>('input[type=file]')!
  const status = app.querySelector<HTMLElement>('[data-file-status]')!

  let unmount = opts.mount(viewer, SAMPLE)
  /** Latest wins: each call takes a number, and a read that finishes after a newer call began is dropped. */
  let latest = 0

  async function open(file: File): Promise<void> {
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
    status.textContent = `Opened ${file.name}.`
    unmount()
    unmount = opts.mount(viewer, {
      data,
      key: `file:${file.name}:${file.size}:${file.lastModified}`,
    })
  }

  input.addEventListener('change', () => {
    const file = input.files?.[0]
    input.value = ''
    if (file) void open(file)
  })
  viewer.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return
    e.preventDefault()
    viewer.dataset.drop = ''
  })
  viewer.addEventListener('dragleave', (e) => {
    // Moving over a child of the viewer fires dragleave too; only clear when truly outside.
    if (e.relatedTarget instanceof Node && viewer.contains(e.relatedTarget)) return
    delete viewer.dataset.drop
  })
  // A file dropped outside the viewer would make the browser navigate to it.
  const isFileDrag = (e: DragEvent): boolean =>
    e.dataTransfer?.types.includes('Files') ?? false
  window.addEventListener('dragover', (e) => {
    if (isFileDrag(e)) e.preventDefault()
  })
  window.addEventListener('drop', (e) => {
    if (isFileDrag(e)) e.preventDefault()
  })
  viewer.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files[0]
    if (!file) return
    e.preventDefault()
    delete viewer.dataset.drop
    void open(file)
  })

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    const file = opts.files[Number(button.dataset.copy)]
    let reset: ReturnType<typeof setTimeout> | undefined
    button.addEventListener('click', () => {
      if (!file) return
      const show = (text: string): void => {
        button.textContent = text
        clearTimeout(reset)
        reset = setTimeout(() => {
          button.textContent = 'Copy'
        }, 1500)
      }
      navigator.clipboard.writeText(file.source.code).then(
        () => show('Copied'),
        () => show('Copy failed')
      )
    })
  }

  const copyInstall = app.querySelector<HTMLButtonElement>('[data-copy-install]')!
  let installReset: ReturnType<typeof setTimeout> | undefined
  copyInstall.addEventListener('click', () => {
    const show = (label: string, copied: boolean): void => {
      copyInstall.setAttribute('aria-label', label)
      copyInstall.toggleAttribute('data-copied', copied)
      clearTimeout(installReset)
      installReset = setTimeout(() => {
        copyInstall.setAttribute('aria-label', 'Copy install command')
        copyInstall.removeAttribute('data-copied')
      }, 1500)
    }
    navigator.clipboard.writeText(fw.install).then(
      () => show('Copied', true),
      () => show('Copy failed', false)
    )
  })
}
