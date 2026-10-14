import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { startShell } from '../shell/shell'

import actions from './Actions.tsx?highlight'
import { Demo } from './Demo'
import demo from './Demo.tsx?highlight'

startShell({
  framework: 'react',
  files: [
    { path: 'src/react/Demo.tsx', source: demo },
    { path: 'src/react/Actions.tsx', source: actions },
  ],
  mount(el, source) {
    const root = createRoot(el)
    root.render(
      <StrictMode>
        <Demo source={source} />
      </StrictMode>
    )
    return () => root.unmount()
  },
})
