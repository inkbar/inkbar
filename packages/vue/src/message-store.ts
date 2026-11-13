import { inject, provide, type InjectionKey } from 'vue'

import type { MessageStore } from '@inkbar/core/dom'

/*
 * The root's writable message store, for InkViewport to hand to the engine. Not exported from
 * the package: the public context carries it read-only, so only InkRoot sets the words.
 */
const KEY: InjectionKey<MessageStore> = Symbol('inkbar.messageStore')

export function provideMessageStore(store: MessageStore): void {
  provide(KEY, store)
}

/** The root's store; throws outside InkRoot, where InkViewport cannot work anyway. */
export function injectMessageStore(): MessageStore {
  const store = inject(KEY, null)
  if (!store) throw new Error('[inkbar] InkViewport must be rendered inside <InkRoot>.')
  return store
}
