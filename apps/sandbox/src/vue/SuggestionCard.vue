<script lang="ts">
/*
 * The suggestion review card from shared/suggestion-card.ts, an app extension built on
 * Inkbar's public API. It mounts once the viewer and a document are ready, and again for each
 * document opened. It renders nothing itself: the card is a popover on <body>.
 */
import { writable } from '@inkbar/core'
import { injectInkContext } from '@inkbar/vue'
import { defineComponent, watch } from 'vue'

import { mountSuggestionCard } from '../shared/suggestion-card'

export default defineComponent({
  setup() {
    const ctx = injectInkContext()
    const activated = writable(ctx.activated.value)
    watch(ctx.activated, (id) => activated.set(id), { flush: 'sync' })

    watch(
      [ctx.rootEl, ctx.document],
      ([root, doc], _, onCleanup) => {
        if (!root || !doc) return
        const card = mountSuggestionCard({
          root,
          store: doc.annotations,
          activated,
          setActivated: (id) => ctx.setActivated(id),
        })
        onCleanup(() => card.destroy())
      },
      { immediate: true }
    )
    return () => null
  },
})
</script>
