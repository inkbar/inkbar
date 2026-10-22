import card from '../plugin/card.ts?highlight'
import layer from '../plugin/layer.ts?highlight'
import suggestions from '../plugin/suggestions.ts?highlight'
import { startShell } from '../shell/shell'

import { mountDemo } from './Demo'
import demo from './Demo.ts?highlight'

startShell({
  framework: 'vanilla',
  files: [
    { path: 'src/vanilla/Demo.ts', source: demo },
    { path: 'src/plugin/suggestions.ts', source: suggestions },
    { path: 'src/plugin/layer.ts', source: layer },
    { path: 'src/plugin/card.ts', source: card },
  ],
  mount: mountDemo,
})
