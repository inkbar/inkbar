import type { ScenarioId } from '../scenarios/registry.ts'
import type { DocumentSource, InkDocument, InkMessagesInput } from '@inkbar/core'

export type Log = (name: string, value: unknown) => void

/** What every scenario receives from the shell. */
export interface ScenarioProps {
  source: DocumentSource
  /** The language set for the viewer's text; `undefined` is English. */
  messages: InkMessagesInput | undefined
  /** The locale for dates and numbers; `undefined` follows `messages`. */
  locale: string | undefined
  log: Log
  /** Passed to the scenario's viewer ready callback. */
  onDocument(this: void, doc: InkDocument): void
  /** Asks for a PDF from your computer and opens it in this scenario, as a drop would. */
  openFile(this: void): void
}

export interface MountedScenario {
  update(source: DocumentSource): void
  /** Changes the language in place: the viewer stays mounted and keeps its state. */
  setLanguage(messages: InkMessagesInput | undefined, locale: string | undefined): void
  unmount(): void
}

export type MountScenario = (
  scenario: ScenarioId,
  el: HTMLElement,
  props: ScenarioProps
) => Promise<MountedScenario>
