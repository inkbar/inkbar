/*
 * The suggestion review card from shared/suggestion-card.ts, an app extension built on
 * Inkbar's public API. It mounts once the viewer and a document are ready, and again for each
 * document opened.
 */
import { writable } from '@inkbar/core'
import { useInkContext } from '@inkbar/react'
import { useEffect, useState } from 'react'

import { mountSuggestionCard } from '../shared/suggestion-card'

export function SuggestionCard() {
  const { rootEl, document, activated, setActivated } = useInkContext('SuggestionCard')
  const [activatedStore] = useState(() => writable(activated))
  useEffect(() => activatedStore.set(activated), [activatedStore, activated])

  useEffect(() => {
    if (!rootEl || !document) return
    const card = mountSuggestionCard({
      root: rootEl,
      store: document.annotations,
      activated: activatedStore,
      setActivated,
    })
    return () => card.destroy()
  }, [rootEl, document, activatedStore, setActivated])

  return null
}
