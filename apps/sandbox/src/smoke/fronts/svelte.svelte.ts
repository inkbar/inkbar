import { mount as mountComponent, unmount } from 'svelte'

import Smoke from './Smoke.svelte'

import type { MountFront } from '../front.ts'

/*
 * A `.svelte.ts` module, so the source and words can be state and a change reaches the
 * component. Raw state: a deep proxy around the PDF's bytes could not be posted to a worker.
 */
export const mount: MountFront = (el, props) => {
  let source = $state.raw(props.source)
  let messages = $state.raw(props.messages)
  const app = mountComponent(Smoke, {
    target: el,
    props: {
      get source() {
        return source
      },
      get messages() {
        return messages
      },
      onReady: props.onReady,
      onRedacted: props.onRedacted,
      onApply: props.onApply,
    },
  })
  return {
    open: (next) => (source = next),
    setMessages: (next) => (messages = next),
    unmount: () => void unmount(app),
  }
}
