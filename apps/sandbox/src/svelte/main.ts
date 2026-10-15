import { mount, unmount } from 'svelte'

import { startShell } from '../shell/shell'

import actions from './Actions.svelte?highlight'
import Demo from './Demo.svelte'
import demo from './Demo.svelte?highlight'

startShell({
  framework: 'svelte',
  files: [
    { path: 'src/svelte/Demo.svelte', source: demo },
    { path: 'src/svelte/Actions.svelte', source: actions },
  ],
  mount(el, source) {
    const app = mount(Demo, { target: el, props: { source } })
    return () => void unmount(app)
  },
})
