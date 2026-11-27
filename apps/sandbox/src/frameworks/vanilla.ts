import type { MountedScenario, ScenarioProps } from './types.ts'
import type { ScenarioLabels } from '../shared/strings/types.ts'
import type { DocumentSource, InkMessagesInput } from '@inkbar/core'

/** What a TypeScript scenario exports as `mount`: it builds the viewer and hands back its controls. */
export type VanillaScenario = (
  el: HTMLElement,
  props: ScenarioProps
) => {
  open(source: DocumentSource): void
  setLanguage(
    messages: InkMessagesInput | undefined,
    locale: string | undefined,
    labels: ScenarioLabels
  ): void
  destroy(): void
}

export function mountVanilla(
  mount: VanillaScenario,
  el: HTMLElement,
  props: ScenarioProps
): MountedScenario {
  const scenario = mount(el, props)
  return {
    update: (source) => scenario.open(source),
    setLanguage: (messages, locale, labels) =>
      scenario.setLanguage(messages, locale, labels),
    unmount: () => scenario.destroy(),
  }
}
