/*
 * The page around each framework's viewer: header, intro, file control, viewer slot and
 * source panel. It knows nothing about any framework: each page passes a `mount` function and
 * the shell calls it again with a new source when the reader opens a file.
 */
import '../styles/demo.css'

import { FRAMEWORK_ORDER, FRAMEWORKS, type FrameworkId } from './frameworks'
import { LOGO_SVG } from './logo'

import type { DocumentSource } from '@inkbar/core'

export interface SourceFile {
  /** Relative to `apps/demo/`. */
  path: string
  source: { html: string; code: string }
}

export interface ShellOptions {
  framework: FrameworkId
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
  return `<section class="source-file">
  <div class="source-head">
    <h2>${name}</h2>
    <button type="button" class="text-button" data-copy="${index}">Copy</button>
    <a class="text-link" href="${REPO}/blob/main/apps/demo/${file.path}">View on GitHub</a>
  </div>
  ${file.source.html}
</section>`
}

export function startShell(opts: ShellOptions): void {
  const fw = FRAMEWORKS[opts.framework]
  document.title = `${fw.name} · Inkbar demo`
  const app = document.getElementById('app')!
  app.innerHTML = `
<header class="site-header">
  <div class="container site-header-inner">
    <a class="brand" href="${BASE}">${LOGO_SVG}<span class="wordmark">inkbar</span><span class="visually-hidden"> demo home</span></a>
    <nav aria-label="Frameworks">
      <ul class="frameworks">
        ${FRAMEWORK_ORDER.map(
          (id) =>
            `<li><a href="${BASE}${id}/"${id === opts.framework ? ' aria-current="page"' : ''}>${FRAMEWORKS[id].name}</a></li>`
        ).join('')}
      </ul>
    </nav>
    <a class="text-link" href="${REPO}">GitHub</a>
  </div>
</header>
<main class="container demo">
  <div class="demo-intro">
    <h1>${fw.name}</h1>
    <p class="lede">${fw.blurb}</p>
    <code class="install">${fw.install}</code>
  </div>
  <div class="demo-file">
    <label class="file-button">
      <input type="file" accept="application/pdf,.pdf" class="visually-hidden" />
      Open a PDF
    </label>
    <p class="caption">Or drop one on the viewer. The file stays in your browser.</p>
    <p class="caption" role="status" data-file-status></p>
  </div>
  <div class="demo-viewer" data-viewer></div>
  <details class="source">
    <summary>Source</summary>
    ${opts.files.map(fileSection).join('')}
  </details>
</main>
<footer class="container site-footer">
  <p>From the team behind <a href="https://redactr.io">Redactr</a>. Docs at <a href="https://inkbar.dev">inkbar.dev</a>.</p>
</footer>`

  const viewer = app.querySelector<HTMLElement>('[data-viewer]')!
  const input = app.querySelector<HTMLInputElement>('input[type=file]')!
  const status = app.querySelector<HTMLElement>('[data-file-status]')!

  let unmount = opts.mount(viewer, SAMPLE)

  async function open(file: File): Promise<void> {
    if (!isPdf(file)) {
      status.textContent = `${file.name} is not a PDF.`
      return
    }
    const data = new Uint8Array(await file.arrayBuffer())
    status.textContent = `Showing ${file.name}.`
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
  viewer.addEventListener('dragleave', () => {
    delete viewer.dataset.drop
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
    button.addEventListener('click', () => {
      if (!file) return
      void navigator.clipboard.writeText(file.source.code).then(() => {
        button.textContent = 'Copied'
        setTimeout(() => {
          button.textContent = 'Copy'
        }, 1500)
      })
    })
  }
}
