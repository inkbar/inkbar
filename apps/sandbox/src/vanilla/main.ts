import { startShell } from '../shell/shell'

import { mountDemo } from './Demo'
import demo from './Demo.ts?highlight'

startShell({
  page: 'vanilla',
  files: [{ path: 'src/vanilla/Demo.ts', source: demo }],
  mount: mountDemo,
})
