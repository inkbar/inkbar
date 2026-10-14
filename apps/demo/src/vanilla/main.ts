import { startShell } from '../shell/shell'

import { mountDemo } from './Demo'
import demo from './Demo.ts?highlight'
import dom from './dom.ts?highlight'
import notePopover from './note-popover.ts?highlight'
import popover from './popover.ts?highlight'
import suggestionCard from './suggestion-card.ts?highlight'
import toolbar from './toolbar.ts?highlight'

startShell({
  framework: 'vanilla',
  files: [
    { path: 'src/vanilla/Demo.ts', source: demo },
    { path: 'src/vanilla/toolbar.ts', source: toolbar },
    { path: 'src/vanilla/note-popover.ts', source: notePopover },
    { path: 'src/vanilla/suggestion-card.ts', source: suggestionCard },
    { path: 'src/vanilla/popover.ts', source: popover },
    { path: 'src/vanilla/dom.ts', source: dom },
  ],
  mount: mountDemo,
})
