import card from '../shared/suggestion-card.ts?highlight'
import suggestion from '../shared/suggestion.ts?highlight'
import { startShell } from '../shell/shell'

import actions from './actions.ts?highlight'
import { mountDemo } from './Demo'
import demo from './Demo.ts?highlight'

startShell({
  framework: 'vanilla',
  files: [
    { path: 'src/vanilla/Demo.ts', source: demo },
    { path: 'src/vanilla/actions.ts', source: actions },
    { path: 'src/shared/suggestion.ts', source: suggestion },
    { path: 'src/shared/suggestion-card.ts', source: card },
  ],
  mount: mountDemo,
})
