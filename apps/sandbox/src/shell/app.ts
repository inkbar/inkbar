/*
 * The scenario shell: a header, the scenario list, the selected scenario's Preview and Code
 * tabs, and the Events panel. It knows no framework. The hash names the framework and
 * scenario; each change unmounts the scenario and mounts the next, and the latest selection
 * wins, so exactly one viewer is ever mounted. The language changes in place: the shell writes
 * its words again and the mounted scenario takes the new ones, without a remount.
 */
import '../styles/app.css'

import { mountScenario } from '../frameworks/index.ts'
import { SCENARIOS } from '../scenarios/registry.ts'
import { en, type SandboxStrings, type ShellText } from '../shared/strings/index.ts'

import { loadSources, type SourceFile } from './code.ts'
import { documentSource } from './documents.ts'
import { handleDrops } from './drop.ts'
import { createEventLog } from './events.ts'
import { FRAMEWORKS, type FrameworkId } from './frameworks.ts'
import { loadLanguage, type Language } from './language.ts'
import { LOGO_SVG } from './logo.ts'
import {
  formatRoute,
  formatSearch,
  LANGUAGES,
  parseRoute,
  withLang,
  type LangId,
  type Route,
} from './route.ts'
import { createSidebar } from './sidebar.ts'
import { createTabs, tabMarkup } from './tabs.ts'
import { createValuesPanel } from './values.ts'

import type { Log, MountedScenario } from '../frameworks/types.ts'
import type { DocumentSource, InkDocument } from '@inkbar/core'

const REPO = 'https://github.com/inkbar/inkbar'
const BASE = import.meta.env.BASE_URL

const app = document.getElementById('app')!
app.innerHTML = `
<header class="app-header">
  <a class="brand" href="${BASE}">${LOGO_SVG}<span class="wordmark">inkbar</span><span class="wordmark-suffix">sandbox</span><span class="visually-hidden" data-home></span></a>
  <nav class="breadcrumb">
    <ol><li data-crumb-framework></li><li aria-current="page" data-crumb-scenario></li></ol>
  </nav>
  <nav class="app-links">
    <a href="https://inkbar.dev/docs/" data-docs></a>
    <a href="${REPO}">GitHub</a>
  </nav>
</header>
<input type="file" accept="application/pdf,.pdf" class="visually-hidden" tabindex="-1" aria-hidden="true" data-file-input />
<div class="app-body">
  <nav class="app-nav"></nav>
  <main class="app-main">
    <div class="stage" data-view="preview">
      <div class="scenario-head">
        <h1 data-scenario-title></h1>
        <p data-scenario-blurb></p>
        <p data-scenario-note hidden></p>
      </div>
      <div class="stage-bar">
        <div class="view-tabs" role="tablist">
          ${tabMarkup('tab-preview', 'panel-preview', '')}
          ${tabMarkup('tab-code', 'panel-code', '')}
        </div>
        <div class="stage-files">
          <p class="caption stage-hint"></p>
          <p class="caption stage-status" role="status" data-file-status></p>
        </div>
      </div>
      <section class="preview" id="panel-preview" role="tabpanel" aria-labelledby="tab-preview">
        <div class="scenario-viewer" data-scenario-viewer></div>
      </section>
      <section class="code" id="panel-code" role="tabpanel" aria-labelledby="tab-code" hidden></section>
    </div>
  </main>
  <aside class="app-side">
    <div class="side-tabs" role="tablist" hidden>
      ${tabMarkup('tab-events', 'panel-events', '')}
      ${tabMarkup('tab-values', 'panel-values', '')}
    </div>
    <div class="side-panel" id="panel-events" data-events></div>
    <div class="side-panel" id="panel-values" hidden></div>
  </aside>
</div>`

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T =>
  app.querySelector<T>(selector)!

/** The sandbox's own words in the language shown; English until another one loads. */
let strings: SandboxStrings = en

const viewer = $('[data-scenario-viewer]')
const codePanel = $('#panel-code')
const events = createEventLog($('[data-events]'), strings.shell)
const values = createValuesPanel($('#panel-values'), strings.shell)
const sidebar = createSidebar($('.app-nav'), strings)
// The language of the page. Each option names its language in that language.
const languageSelect = document.createElement('select')
languageSelect.id = 'language-select'
languageSelect.innerHTML = LANGUAGES.map(
  (l) => `<option value="${l.id}" lang="${l.id}">${l.name}</option>`
).join('')
const languagePicker = document.createElement('div')
languagePicker.className = 'lang-picker'
languagePicker.innerHTML = '<label for="language-select"></label>'
languagePicker.append(languageSelect)
$('.app-links').prepend(languagePicker)
const sideTabs = $('.side-tabs')
/** The scenarios' Open a PDF buttons pick a file through this one input. */
const fileInput = $<HTMLInputElement>('[data-file-input]')
const openFile = (): void => fileInput.click()

const viewTabs = createTabs(
  [$('#tab-preview'), $('#tab-code')],
  [$('#panel-preview'), codePanel],
  (index) => {
    // The file hint is about the viewer, so it shows with Preview only.
    $('.stage').dataset.view = index === 1 ? 'code' : 'preview'
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

let route: Route = parseRoute(location.hash, location.search)
/** Bumped by each selection; work begun for an older one is dropped. */
let generation = 0
let mounted: MountedScenario | null = null
/** Whether the current selection's scenario is still loading. */
let mounting = false
/** A PDF dropped while the scenario was loading; the mount receives it once it lands. */
let queued: DocumentSource | null = null

const drops = handleDrops({
  target: viewer,
  input: fileInput,
  status: $('[data-file-status]'),
  text: () => strings.shell,
  open(source) {
    if (mounted) mounted.update(source)
    else if (mounting) queued = source
    else return false
    return true
  },
})

/** Rewrites the preview's error, if it shows one, in the current language. */
let showPreviewError: (() => void) | null = null

/** Shows an error in place of the scenario. */
function previewError(host: HTMLElement, message: (t: ShellText) => string): void {
  const p = document.createElement('p')
  p.className = 'scenario-error'
  host.replaceChildren(p)
  showPreviewError = () => (p.textContent = message(strings.shell))
  showPreviewError()
}

/** The current scenario's title, blurb and note, and the page title, in the current language. */
function showScenarioText(): void {
  const text = strings.scenarios[route.scenario]
  const framework = FRAMEWORKS[route.framework]
  document.title = strings.shell.pageTitle({
    scenario: text.title,
    framework: framework.name,
  })
  $('[data-crumb-framework]').textContent = framework.name
  $('[data-crumb-scenario]').textContent = text.title
  $('[data-scenario-title]').textContent = text.title
  $('[data-scenario-blurb]').textContent = text.blurb
  const note = text.notes?.[route.framework]
  $('[data-scenario-note]').textContent = note ?? ''
  $('[data-scenario-note]').hidden = !note
}

/** Writes every word the shell owns in the current language. */
function showText(): void {
  const t = strings.shell
  document.documentElement.lang = strings.lang
  $('[data-home]').textContent = ` ${t.home}`
  $('.breadcrumb').setAttribute('aria-label', t.breadcrumb)
  $('.app-links').setAttribute('aria-label', t.mainLinks)
  $('[data-docs]').textContent = t.docs
  $('label[for="language-select"]').textContent = t.language
  $('.app-nav').setAttribute('aria-label', t.scenarios)
  $('.view-tabs').setAttribute('aria-label', t.view)
  $('#tab-preview').textContent = t.preview
  $('#tab-code').textContent = t.code
  $('.stage-hint').textContent = t.dropHint
  $('.app-side').setAttribute('aria-label', t.events)
  sideTabs.setAttribute('aria-label', t.panels)
  $('#tab-events').textContent = t.events
  $('#tab-values').textContent = t.values
  sidebar.setText(strings)
  events.setText(t)
  values.setText(t)
  drops.refresh()
  showPreviewError?.()
  showCodeText()
  showScenarioText()
}

/** Shows `next` once it is the route's language; a later choice makes it stale. */
function applyStrings(lang: LangId, next: SandboxStrings): void {
  if (route.lang !== lang || strings === next) return
  strings = next
  showText()
}

/** Mounts the route's scenario with its own document. */
async function select(next: Route): Promise<void> {
  route = next
  const gen = ++generation
  const scenario = SCENARIOS.find((s) => s.id === next.scenario)!
  showScenarioText()
  sidebar.select(next)
  languageSelect.value = next.lang

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
  // From here until the mount lands, a dropped PDF is queued for it.
  mounting = true
  queued = null
  drops.reset()
  events.clear()
  values.show(null)
  if (viewTabs.selected === 1) void showCode()

  // Each mount gets an element of its own, so a mount that lands late touches nothing shown.
  const host = document.createElement('div')
  host.className = 'scenario-host'
  viewer.replaceChildren(host)
  showPreviewError = null

  let language: Language
  try {
    language = await loadLanguage(next.lang)
  } catch (error) {
    if (gen !== generation) return
    mounting = false
    queued = null
    previewError(host, (t) => t.languageFailed)
    // A file dropped while this loaded was reported as opened; no viewer took it.
    drops.noViewer()
    console.error(error)
    return
  }
  if (gen !== generation) return
  applyStrings(next.lang, language.strings)

  const log: Log = (name, value) => {
    if (gen === generation) events.log(name, value)
  }
  const onDocument = (doc: InkDocument): void => {
    if (gen === generation) values.show(doc)
  }
  let m: MountedScenario
  try {
    m = await mountScenario(next.framework, next.scenario, host, {
      source: documentSource(scenario.document),
      messages: language.messages,
      locale: language.locale,
      labels: language.strings.labels,
      log,
      onDocument,
      openFile,
    })
  } catch (error) {
    if (gen !== generation) return
    mounting = false
    queued = null
    previewError(host, (t) => t.scenarioFailed)
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
  // The language may have changed while the scenario loaded.
  if (route.lang !== next.lang) {
    const want = route.lang
    loadLanguage(want).then(
      (l) => {
        // Still this mount, and no later choice of language.
        if (mounted === m && route.lang === want) {
          applyStrings(want, l.strings)
          m.setLanguage(l.messages, l.locale, l.strings.labels)
        }
      },
      (error: unknown) => console.error(error)
    )
  }
  if (queued) {
    m.update(queued)
    queued = null
  }
}

let codeFor = ''
/** The Code tab's loading or failure message, kept as words to write again. */
let codeStatus: ((t: ShellText) => string) | null = null

/** Shows a loading or failure message in the Code tab. */
function showCodeStatus(
  role: 'status' | 'alert',
  message: (t: ShellText) => string
): void {
  codeStatus = message
  codePanel.innerHTML = `<p class="code-status" role="${role}"></p>`
  showCodeText()
}

/** The Code tab's own words in the current language; the source itself stays as it is. */
function showCodeText(): void {
  const t = strings.shell
  const status = codePanel.querySelector('.code-status')
  if (status && codeStatus) status.textContent = codeStatus(t)
  codePanel.querySelector('.file-tabs')?.setAttribute('aria-label', t.files)
  for (const button of codePanel.querySelectorAll<HTMLButtonElement>('[data-copy]'))
    if (!button.dataset.feedback) button.textContent = t.copy
  for (const link of codePanel.querySelectorAll('.source-link'))
    link.textContent = t.viewOnGitHub
}

async function showCode(): Promise<void> {
  const want = formatRoute(route)
  if (codeFor === want) return
  codeFor = want
  const { framework, scenario } = route
  // Drop the previous scenario's source at once, so it is never shown under the new title.
  showCodeStatus('status', (t) => t.loadingCode)
  let files: SourceFile[]
  try {
    files = await loadSources(framework, scenario)
  } catch {
    if (codeFor !== want) return
    // Forget the attempt so showing the tab again tries once more.
    codeFor = ''
    showCodeStatus('alert', (t) => t.codeFailed)
    return
  }
  if (codeFor !== want) return
  renderCode(framework, files)
}

function renderCode(framework: FrameworkId, files: SourceFile[]): void {
  const install = FRAMEWORKS[framework].install
  codeStatus = null
  codePanel.innerHTML = `
<div class="file-tabs" role="tablist">
  ${files.map((f, i) => tabMarkup(`file-tab-${i}`, `file-panel-${i}`, f.path.split('/').pop()!)).join('')}
</div>
${files
  .map(
    (f, i) => `
<div class="source-file" id="file-panel-${i}" role="tabpanel" aria-labelledby="file-tab-${i}">
  <div class="source-head">
    <span class="source-path">${f.path}</span>
    <code class="source-install"><span aria-hidden="true">$ </span>${install}</code>
    <button type="button" class="ghost-button" data-copy="${i}"></button>
    <a class="source-link" href="${REPO}/blob/main/apps/sandbox/${f.path}"></a>
  </div>
  <div class="source-body" tabindex="0" aria-label="${f.path}">${f.html}</div>
</div>`
  )
  .join('')}`
  createTabs(
    [...codePanel.querySelectorAll<HTMLElement>('[role=tab]')],
    [...codePanel.querySelectorAll<HTMLElement>('[role=tabpanel]')]
  )
  showCodeText()
  for (const button of codePanel.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    const file = files[Number(button.dataset.copy)]!
    let reset: ReturnType<typeof setTimeout> | undefined
    button.addEventListener('click', () => {
      const show = (text: string): void => {
        button.textContent = text
        button.dataset.feedback = ''
        clearTimeout(reset)
        reset = setTimeout(() => {
          delete button.dataset.feedback
          button.textContent = strings.shell.copy
        }, 1500)
      }
      navigator.clipboard.writeText(file.code).then(
        () => show(strings.shell.copied),
        () => show(strings.shell.copyFailed)
      )
    })
  }
}

/** Follows the hash; an unknown one is replaced by the default route, as at first load. */
function followHash(): void {
  const next = parseRoute(location.hash, location.search)
  if (location.hash !== formatRoute(next))
    history.replaceState(null, '', formatRoute(next))
  void select(next)
}
window.addEventListener('hashchange', followHash)

/** Writes the route's language to the address, so a reload keeps it. */
function showSearchInUrl(): void {
  const search = formatSearch(route, location.search)
  if (search !== location.search)
    history.replaceState(null, '', `${location.pathname}${search}${location.hash}`)
}

/** Changes the viewer's language in place: no remount, so the page, scroll and open menus stay. */
async function changeLanguage(lang: LangId): Promise<void> {
  const previous = route.lang
  route = withLang(route, lang)
  showSearchInUrl()
  const chosen = route
  let language: Language
  try {
    language = await loadLanguage(lang)
  } catch (error) {
    console.error(error)
    // Nothing changed the route since, so put the previous language back.
    if (route === chosen) {
      route = withLang(route, previous)
      showSearchInUrl()
      languageSelect.value = previous
    }
    return
  }
  // A later choice, or a new scenario, makes this one stale.
  if (route !== chosen) return
  applyStrings(lang, language.strings)
  mounted?.setLanguage(language.messages, language.locale, language.strings.labels)
}
languageSelect.addEventListener('change', () => {
  void changeLanguage(languageSelect.value as LangId)
})

showText()
if (location.hash !== formatRoute(route))
  history.replaceState(null, '', formatRoute(route))
void select(route)
