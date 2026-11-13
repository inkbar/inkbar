import { getContext, setContext } from 'svelte'

import type { MessageStore } from '@inkbar/core/dom'

/*
 * The root's writable message store, for InkViewport to hand to the engine. Not exported from
 * the package: the public context carries it read-only, so only InkRoot sets the words.
 */
const KEY = Symbol('inkbar.messages')

/** Called once by InkRoot during its initialisation. */
export function setMessageStore(store: MessageStore): void {
  setContext(KEY, store)
}

/** The root's store; throws outside InkRoot, where InkViewport cannot work anyway. */
export function useMessageStore(): MessageStore {
  const store = getContext<MessageStore | undefined>(KEY)
  if (!store) throw new Error('[inkbar] InkViewport must be rendered inside <InkRoot>.')
  return store
}
