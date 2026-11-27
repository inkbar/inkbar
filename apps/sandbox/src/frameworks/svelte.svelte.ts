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
  let messages = $state.raw(props.messages)
  let locale = $state.raw(props.locale)
  let labels = $state.raw(props.labels)
  const app = mount(Scenario, {
    target: el,
    props: {
      get source() {
        return source
      },
      get messages() {
        return messages
      },
      get locale() {
        return locale
      },
      get labels() {
        return labels
      },
      log: props.log,
      onDocument: props.onDocument,
      openFile: props.openFile,
    },
  })
  return {
    update(next) {
      source = next
    },
    setLanguage(nextMessages, nextLocale, nextLabels) {
      messages = nextMessages
      locale = nextLocale
      labels = nextLabels
    },
    unmount: () => void unmount(app),
  }
}
