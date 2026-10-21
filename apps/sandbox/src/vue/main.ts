import { createApp } from 'vue'

import sharedCard from '../shared/suggestion-card.ts?highlight'
import { startShell } from '../shell/shell'

import actions from './Actions.vue?highlight'
import Demo from './Demo.vue'
import demo from './Demo.vue?highlight'
import card from './SuggestionCard.vue?highlight'

startShell({
  framework: 'vue',
  files: [
    { path: 'src/vue/Demo.vue', source: demo },
    { path: 'src/vue/Actions.vue', source: actions },
    { path: 'src/vue/SuggestionCard.vue', source: card },
    { path: 'src/shared/suggestion-card.ts', source: sharedCard },
  ],
  mount(el, source) {
    const app = createApp(Demo, { source })
    app.mount(el)
    return () => app.unmount()
  },
})
