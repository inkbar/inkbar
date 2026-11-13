import { createContext, useContext } from 'react'

import type { MessageStore } from '@inkbar/core/dom'

/*
 * The root's writable message store, for InkViewport to hand to the engine. Not exported from
 * the package: the public context carries it read-only, so only InkRoot sets the words.
 */
export const MessageStoreContext = createContext<MessageStore | null>(null)

/** The root's store; throws outside InkRoot, where InkViewport cannot work anyway. */
export function useMessageStore(): MessageStore {
  const store = useContext(MessageStoreContext)
  if (!store) throw new Error('[inkbar] InkViewport must be rendered inside <InkRoot>.')
  return store
}
