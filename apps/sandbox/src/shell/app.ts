/*
 * The scenario shell: a header, the scenario list, the selected scenario's Preview and Code
 * tabs, and the Events panel. It knows no framework. The hash names the framework and
 * scenario; each change unmounts the scenario and mounts the next, and the latest selection
 * wins, so exactly one viewer is ever mounted.
 */
import '../styles/app.css'

import { mountScenario } from '../frameworks/index.ts'
import { SCENARIOS } from '../scenarios/registry.ts'

import { loadSources, type SourceFile } from './code.ts'
import { documentSource } from './documents.ts'
import { handleDrops } from './drop.ts'
import { createEventLog } from './events.ts'
import { FRAMEWORKS, type FrameworkId } from './frameworks.ts'
import { LOGO_SVG } from './logo.ts'
import { formatRoute, parseRoute, type Route } from './route.ts'
import { createSidebar } from './sidebar.ts'
import { createTabs, tabMarkup } from './tabs.ts'
import { createValuesPanel } from './values.ts'

import type { Log, MountedScenario } from '../frameworks/types.ts'
import type { DocumentSource, InkDocument } from '@inkbar/core'

const REPO = 'https://github.com/inkbar/inkbar'
const BASE = import.meta.env.BASE_URL

const FILE_ICON =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 18v-6M9 15l3-3 3 3"/></svg>'

const app = document.getElementById('app')!
app.innerHTML = `
<header class="app-header">
  <a class="brand" href="${BASE}">${LOGO_SVG}<span class="wordmark">inkbar</span><span class="wordmark-suffix">sandbox</span><span class="visually-hidden"> home</span></a>
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <ol><li data-crumb-framework></li><li aria-current="page" data-crumb-scenario></li></ol>
  </nav>
  <nav class="app-links" aria-label="Main">
    <a href="https://inkbar.dev/docs/">Docs</a>
    <a href="${REPO}">GitHub</a>
  </nav>
</header>
<div class="app-body">
  <nav class="app-nav" aria-label="Scenarios"></nav>
  <main class="app-main">
    <div class="scenario-head">
      <div class="scenario-copy">
        <h1 data-scenario-title></h1>
        <p data-scenario-blurb></p>
        <p data-scenario-note hidden></p>
      </div>
      <div class="segmented" role="tablist" aria-label="View">
        ${tabMarkup('tab-preview', 'panel-preview', 'Preview')}
        ${tabMarkup('tab-code', 'panel-code', 'Code')}
      </div>
    </div>
    <section class="preview" id="panel-preview" role="tabpanel" aria-labelledby="tab-preview">
      <div class="viewer-bar">
        <p class="caption">Drop a PDF on the viewer to try your own. It stays in your browser.</p>
        <p class="caption" role="status" data-file-status></p>
        <label class="file-link">
          <input type="file" accept="application/pdf,.pdf" class="visually-hidden" />
          ${FILE_ICON}
          Open a PDF
        </label>
      </div>
      <div class="scenario-viewer" data-scenario-viewer></div>
    </section>
    <section class="code" id="panel-code" role="tabpanel" aria-labelledby="tab-code" hidden></section>
  </main>
  <aside class="app-side" aria-label="Events">
    <div class="side-tabs" role="tablist" aria-label="Panels" hidden>
      ${tabMarkup('tab-events', 'panel-events', 'Events')}
      ${tabMarkup('tab-values', 'panel-values', 'Values')}
    </div>
    <div class="side-panel" id="panel-events" data-events></div>
    <div class="side-panel" id="panel-values" hidden></div>
  </aside>
</div>`

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T =>
  app.querySelector<T>(selector)!

const viewer = $('[data-scenario-viewer]')
const codePanel = $('#panel-code')
const events = createEventLog($('[data-events]'))
const values = createValuesPanel($('#panel-values'))
const sidebar = createSidebar($('nav[aria-label="Scenarios"]'))
const sideTabs = $('.side-tabs')

const viewTabs = createTabs(
  [$('#tab-preview'), $('#tab-code')],
  [$('#panel-preview'), codePanel],
  (index) => {
    if (index === 1) void showCode()
  }
)
const sideTabsControl = createTabs(
  [$('#tab-events'), $('#tab-values')],
  [$('#panel-events'), $('#panel-values')]
)

// For e2e tests that need the log itself: `?debug` puts it on the window.
if (new URLSearchParams(location.search).has('debug'))
  (window as unknown as { __sandboxLog: Log }).__sandboxLog = events.log

let route: Route = parseRoute(location.hash)
/** Bumped by each selection; work begun for an older one is dropped. */
let generation = 0
let mounted: MountedScenario | null = null
/** Whether the current selection's scenario is still loading. */
let mounting = false
/** A PDF dropped while the scenario was loading; the mount receives it once it lands. */
let queued: DocumentSource | null = null

const drops = handleDrops({
  target: viewer,
  input: $<HTMLInputElement>('input[type=file]'),
  status: $('[data-file-status]'),
  open(source) {
    if (mounted) mounted.update(source)
    else if (mounting) queued = source
    else return false
    return true
  },
})

async function select(next: Route): Promise<void> {
  route = next
  const gen = ++generation
  const scenario = SCENARIOS.find((s) => s.id === next.scenario)!
  const framework = FRAMEWORKS[next.framework]
  document.title = `${scenario.title} · ${framework.name} · Inkbar sandbox`
  $('[data-crumb-framework]').textContent = framework.name
  $('[data-crumb-scenario]').textContent = scenario.title
  $('[data-scenario-title]').textContent = scenario.title
  $('[data-scenario-blurb]').textContent = scenario.blurb
  const note = scenario.notes?.[next.framework]
  $('[data-scenario-note]').textContent = note ?? ''
  $('[data-scenario-note]').hidden = !note
  sidebar.select(next)

  const hasValues = scenario.panels.includes('values')
  sideTabs.hidden = !hasValues
  for (const [panel, tab] of [
    ['#panel-events', 'tab-events'],
    ['#panel-values', 'tab-values'],
  ] as const) {
    // Without the Values tab, the Events panel is the whole aside rather than a tab's panel.
    if (hasValues) {
      $(panel).setAttribute('role', 'tabpanel')
      $(panel).setAttribute('aria-labelledby', tab)
    } else {
      $(panel).removeAttribute('role')
      $(panel).removeAttribute('aria-labelledby')
    }
  }
  if (!hasValues) sideTabsControl.select(0)

  mounted?.unmount()
  mounted = null
  mounting = false
  queued = null
  drops.reset()
  events.clear()
  values.show(null)
  if (viewTabs.selected === 1) void showCode()

  // Each mount gets an element of its own, so a mount that lands late touches nothing shown.
  const host = document.createElement('div')
  host.className = 'scenario-host'
  viewer.replaceChildren(host)

  const log: Log = (name, value) => {
    if (gen === generation) events.log(name, value)
  }
  const onDocument = (doc: InkDocument): void => {
    if (gen === generation) values.show(doc)
  }
  let m: MountedScenario
  mounting = true
  try {
    m = await mountScenario(next.framework, next.scenario, host, {
      source: documentSource(scenario.document),
      log,
      onDocument,
    })
  } catch (error) {
    if (gen !== generation) return
    mounting = false
    queued = null
    host.innerHTML = '<p class="scenario-error">This scenario could not be loaded.</p>'
    // A file dropped while this loaded was reported as opened; no viewer took it.
    drops.noViewer()
    console.error(error)
    return
  }
  if (gen !== generation) {
    m.unmount()
    return
  }
  mounting = false
  mounted = m
  if (queued) {
    m.update(queued)
    queued = null
  }
}

let codeFor = ''

async function showCode(): Promise<void> {
  const want = formatRoute(route)
  if (codeFor === want) return
  codeFor = want
  const { framework, scenario } = route
  // Drop the previous scenario's source at once, so it is never shown under the new title.
  codePanel.innerHTML = '<p class="code-status" role="status">Loading the code…</p>'
  let files: SourceFile[]
  try {
    files = await loadSources(framework, scenario)
  } catch {
    if (codeFor !== want) return
    // Forget the attempt so showing the tab again tries once more.
    codeFor = ''
    codePanel.innerHTML =
      '<p class="code-status" role="alert">The code could not be loaded. Switch tabs to try again.</p>'
    return
  }
  if (codeFor !== want) return
  renderCode(framework, files)
}

function renderCode(framework: FrameworkId, files: SourceFile[]): void {
  const install = FRAMEWORKS[framework].install
  codePanel.innerHTML = `
<div class="file-tabs" role="tablist" aria-label="Files">
  ${files.map((f, i) => tabMarkup(`file-tab-${i}`, `file-panel-${i}`, f.path.split('/').pop()!)).join('')}
</div>
${files
  .map(
    (f, i) => `
<div class="source-file" id="file-panel-${i}" role="tabpanel" aria-labelledby="file-tab-${i}">
  <div class="source-head">
    <span class="source-path">${f.path}</span>
    <code class="source-install"><span aria-hidden="true">$ </span>${install}</code>
    <button type="button" class="ghost-button" data-copy="${i}">Copy</button>
    <a class="source-link" href="${REPO}/blob/main/apps/sandbox/${f.path}">View on GitHub</a>
  </div>
  <div class="source-body" tabindex="0" aria-label="${f.path}">${f.html}</div>
</div>`
  )
  .join('')}`
  createTabs(
    [...codePanel.querySelectorAll<HTMLElement>('[role=tab]')],
    [...codePanel.querySelectorAll<HTMLElement>('[role=tabpanel]')]
  )
  for (const button of codePanel.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    const file = files[Number(button.dataset.copy)]!
    let reset: ReturnType<typeof setTimeout> | undefined
    button.addEventListener('click', () => {
      const show = (text: string): void => {
        button.textContent = text
        clearTimeout(reset)
        reset = setTimeout(() => (button.textContent = 'Copy'), 1500)
      }
      navigator.clipboard.writeText(file.code).then(
        () => show('Copied'),
        () => show('Copy failed')
      )
    })
  }
}

/** Follows the hash; an unknown one is replaced by the default route, as at first load. */
function followHash(): void {
  const next = parseRoute(location.hash)
  if (location.hash !== formatRoute(next))
    history.replaceState(null, '', formatRoute(next))
  void select(next)
}
window.addEventListener('hashchange', followHash)
if (location.hash !== formatRoute(route))
  history.replaceState(null, '', formatRoute(route))
void select(route)
