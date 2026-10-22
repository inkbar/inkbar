import { createApp } from 'vue'

import { startShell } from '../shell/shell'

import Demo from './Demo.vue'
import demo from './Demo.vue?highlight'

startShell({
  page: 'vue',
  files: [{ path: 'src/vue/Demo.vue', source: demo }],
  mount(el, source) {
    const app = createApp(Demo, { source })
    app.mount(el)
    return () => app.unmount()
  },
})
