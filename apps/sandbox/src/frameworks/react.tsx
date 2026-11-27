import { StrictMode, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'

import type { MountedScenario, ScenarioProps } from './types.ts'

export function mountReact(
  Scenario: ComponentType<ScenarioProps>,
  el: HTMLElement,
  props: ScenarioProps
): MountedScenario {
  const root = createRoot(el)
  let current = props
  const render = (): void =>
    root.render(
      <StrictMode>
        <Scenario {...current} />
      </StrictMode>
    )
  render()
  return {
    update(source) {
      current = { ...current, source }
      render()
    },
    setLanguage(messages, locale, labels) {
      current = { ...current, messages, locale, labels }
      render()
    },
    unmount: () => root.unmount(),
  }
}
