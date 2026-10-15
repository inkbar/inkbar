import '@inkbar/theme/theme.css'
import './App.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'

// StrictMode on purpose: the sandbox is where double-invoked effects would show (Review Focus 1).
createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
