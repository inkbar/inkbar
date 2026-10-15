import { createApp } from 'vue'

import { startShell } from '../shell/shell'

import actions from './Actions.vue?highlight'
import Demo from './Demo.vue'
import demo from './Demo.vue?highlight'

startShell({
  framework: 'vue',
  files: [
    { path: 'src/vue/Demo.vue', source: demo },
    { path: 'src/vue/Actions.vue', source: actions },
  ],
  mount(el, source) {
    const app = createApp(Demo, { source })
    app.mount(el)
    return () => app.unmount()
  },
})
