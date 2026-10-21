<script lang="ts">
  /*
   * The suggestion review card from shared/suggestion-card.ts, an app extension built on
   * Inkbar's public API. It mounts once the viewer and a document are ready, and again for
   * each document opened.
   */
  import { writable } from '@inkbar/core'
  import { useInkContext } from '@inkbar/svelte'

  import { mountSuggestionCard } from '../shared/suggestion-card'

  const ctx = useInkContext('SuggestionCard')
  const activated = writable<string | null>(null)
  $effect.pre(() => activated.set(ctx.activated))

  $effect(() => {
    const root = ctx.rootEl
    const doc = ctx.document
    if (!root || !doc) return
    const card = mountSuggestionCard({
      root,
      store: doc.annotations,
      activated,
      setActivated: (id) => ctx.setActivated(id),
    })
    return () => card.destroy()
  })
</script>
