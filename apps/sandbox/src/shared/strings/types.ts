import type { SuggestionsText } from '../../plugin/suggestions.ts'
import type { ScenarioId } from '../../scenarios/registry.ts'
import type { FrameworkId } from '../../shell/frameworks.ts'
import type { MessageFn } from '@inkbar/core'

/**
 * The words a scenario supplies itself, beside the viewer's own: names for its toolbar groups,
 * its own buttons, sidebar panels and anything else it renders. Each scenario reads them as
 * `labels.<name>`.
 */
export interface ScenarioLabels {
  /** The toolbar group of creation tools. */
  tools: string
  /** The toolbar group of style menus. */
  style: string
  /** The toolbar group of back and forward. */
  history: string
  /** The toolbar group of Open, Download and Print. */
  file: string
  /** The status bar group of page controls. */
  page: string
  /** The status bar group of zoom controls. */
  zoom: string
  /** The status bar's own name. */
  pageAndZoom: string
  /** The Open button's accessible name and tooltip. */
  openPdf: string
  /** The Open button's visible text. */
  open: string
  /** The toolbar group holding the Suggest redactions command. */
  suggest: string
  /** The sidebar layout picker. */
  layout: string
  rail: string
  tabs: string
  stack: string
  /** Sidebar panels. */
  outline: string
  pages: string
  search: string
  about: string
  /** The About panel's two paragraphs. */
  aboutFill: string
  aboutRecords: string
  /** The search scenario's results list. */
  searchResults: string
  /** The redactions scenario's right sidebar. */
  suggestions: string
  accepted: string
  undoAccept: string
  nothingAccepted: string
  /** Where an accepted suggestion is: its text and page. */
  acceptedAt: MessageFn<{ text: string; page: number }>
  /** The words of the Suggest redactions plugin. */
  plugin: SuggestionsText
}

/** A scenario's title and blurb in the scenario list and above the viewer. */
export interface ScenarioText {
  title: string
  blurb: string
  /** A line shown under the blurb for one framework, where it differs from the rest. */
  notes?: Partial<Record<FrameworkId, string>>
}

/** The shell's own words: the header, the scenario list, the tabs and the side panels. */
export interface ShellText {
  /** The page title. */
  pageTitle: MessageFn<{ scenario: string; framework: string }>
  /** Read after the logo, which links to the sandbox's start. */
  home: string
  breadcrumb: string
  /** The header's links. */
  mainLinks: string
  docs: string
  language: string
  /** The left column. */
  scenarios: string
  framework: string
  /** The framework picker's name, with the current framework. */
  frameworkNamed: MessageFn<{ name: string }>
  frameworks: string
  /** The Preview and Code tabs. */
  view: string
  preview: string
  code: string
  dropHint: string
  /** The right column and its tabs. */
  panels: string
  events: string
  values: string
  clear: string
  eventCount: MessageFn<{ count: number }>
  eventsEmpty: string
  valuesNote: string
  fieldValues: string
  /** The Code tab. */
  files: string
  copy: string
  copied: string
  copyFailed: string
  viewOnGitHub: string
  loadingCode: string
  codeFailed: string
  /** Failures in the preview. */
  languageFailed: string
  scenarioFailed: string
  /** Opening your own PDF. */
  notPdf: MessageFn<{ name: string }>
  unreadable: MessageFn<{ name: string }>
  opened: MessageFn<{ name: string }>
  noViewer: MessageFn<{ name: string }>
}

/** Every word the sandbox shows of its own, in one language. */
export interface SandboxStrings {
  lang: string
  shell: ShellText
  scenarios: Record<ScenarioId, ScenarioText>
  labels: ScenarioLabels
}
