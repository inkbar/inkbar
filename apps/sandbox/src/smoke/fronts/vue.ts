import { createApp, h, shallowRef } from 'vue'

import Smoke from './Smoke.vue'

import type { MountFront } from '../front.ts'

export const mount: MountFront = (el, props) => {
  const source = shallowRef(props.source)
  const messages = shallowRef(props.messages)
  const app = createApp({
    render: () => h(Smoke, { ...props, source: source.value, messages: messages.value }),
  })
  app.mount(el)
  return {
    open: (next) => (source.value = next),
    setMessages: (next) => (messages.value = next),
    unmount: () => app.unmount(),
  }
}
