import { createApp, h, shallowRef, type Component } from 'vue'

import type { MountedScenario, ScenarioProps } from './types.ts'

export function mountVue(
  Scenario: Component<ScenarioProps>,
  el: HTMLElement,
  props: ScenarioProps
): MountedScenario {
  const source = shallowRef(props.source)
  const messages = shallowRef(props.messages)
  const locale = shallowRef(props.locale)
  const app = createApp({
    render: () =>
      h(Scenario, {
        source: source.value,
        messages: messages.value,
        locale: locale.value,
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
    setLanguage(nextMessages, nextLocale) {
      messages.value = nextMessages
      locale.value = nextLocale
    },
    unmount: () => app.unmount(),
  }
}
