import { mount, unmount } from 'svelte'

import sharedCard from '../shared/suggestion-card.ts?highlight'
import { startShell } from '../shell/shell'

import actions from './Actions.svelte?highlight'
import Demo from './Demo.svelte'
import demo from './Demo.svelte?highlight'
import card from './SuggestionCard.svelte?highlight'

startShell({
  framework: 'svelte',
  files: [
    { path: 'src/svelte/Demo.svelte', source: demo },
    { path: 'src/svelte/Actions.svelte', source: actions },
    { path: 'src/svelte/SuggestionCard.svelte', source: card },
    { path: 'src/shared/suggestion-card.ts', source: sharedCard },
  ],
  mount(el, source) {
    const app = mount(Demo, { target: el, props: { source } })
    return () => void unmount(app)
  },
})
