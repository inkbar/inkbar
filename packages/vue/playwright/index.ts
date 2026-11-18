// Component test entry: tests render with the default theme, like a host app would.
import '@inkbar/theme/theme.css'
import './harness.css'

import { beforeMount } from '@playwright/experimental-ct-vue/hooks'

export interface HooksConfig {
  /** Installs `app.config.errorHandler`, which keeps what it hears in `window.__vueErrors`. */
  errorHandler?: boolean
}

declare global {
  interface Window {
    __vueErrors?: string[]
  }
}

beforeMount<HooksConfig>(async ({ app, hooksConfig }) => {
  if (!hooksConfig?.errorHandler) return
  window.__vueErrors = []
  app.config.errorHandler = (error) => {
    window.__vueErrors!.push(error instanceof Error ? error.message : String(error))
  }
})
