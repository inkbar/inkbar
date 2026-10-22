import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { startShell } from '../shell/shell'

import { Demo } from './Demo'
import demo from './Demo.tsx?highlight'

startShell({
  page: 'react',
  files: [{ path: 'src/react/Demo.tsx', source: demo }],
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
