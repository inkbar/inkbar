import { mount, unmount, type Component } from 'svelte'

import type { MountedScenario, ScenarioProps } from './types.ts'

/*
 * A `.svelte.ts` module, so the source can be state and an update reaches the component.
 * It is raw state: a deep proxy around a dropped file's bytes could not be posted to a worker.
 */
export function mountSvelte(
  Scenario: Component<ScenarioProps>,
  el: HTMLElement,
  props: ScenarioProps
): MountedScenario {
  let source = $state.raw(props.source)
  const app = mount(Scenario, {
    target: el,
    props: {
      get source() {
        return source
      },
      log: props.log,
      onDocument: props.onDocument,
    },
  })
  return {
    update(next) {
      source = next
    },
    unmount: () => void unmount(app),
  }
}
