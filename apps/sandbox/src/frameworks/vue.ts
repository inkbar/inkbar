import { createApp, h, shallowRef, type Component } from 'vue'

import type { MountedScenario, ScenarioProps } from './types.ts'

export function mountVue(
  Scenario: Component<ScenarioProps>,
  el: HTMLElement,
  props: ScenarioProps
): MountedScenario {
  const source = shallowRef(props.source)
  const app = createApp({
    render: () =>
      h(Scenario, {
        source: source.value,
        log: props.log,
        onDocument: props.onDocument,
        openFile: props.openFile,
      }),
  })
  app.mount(el)
  return {
    update(next) {
      source.value = next
    },
    unmount: () => app.unmount(),
  }
}
