import { mount, unmount } from 'svelte'

import { startShell } from '../shell/shell'

import Demo from './Demo.svelte'
import demo from './Demo.svelte?highlight'

startShell({
  page: 'svelte',
  files: [{ path: 'src/svelte/Demo.svelte', source: demo }],
  mount(el, source) {
    const app = mount(Demo, { target: el, props: { source } })
    return () => void unmount(app)
  },
})
