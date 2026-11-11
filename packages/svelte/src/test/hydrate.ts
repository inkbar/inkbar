import { hydrate, unmount, type Component } from 'svelte'
import { onTestFinished } from 'vitest'
import { commands } from 'vitest/browser'

declare module 'vitest/browser' {
  interface BrowserCommands {
    /** A harness in `src/test/harness/` rendered to a string by the server build. */
    renderServerHtml: (harness: string, props: Record<string, unknown>) => Promise<string>
  }
}

/**
 * Renders `harness` (a file in `src/test/harness/`) to a string as a server would, puts that
 * markup in the page and hydrates it with `component`, the same harness's client build. A
 * hydration mismatch logs a warning, which the console guard fails on. Returns the server's
 * markup.
 */
export async function renderHydrated<Props extends Record<string, unknown>>(
  harness: string,
  component: Component<Props>,
  props: Props
): Promise<string> {
  const html = await commands.renderServerHtml(harness, props)
  const target = document.body.appendChild(document.createElement('div'))
  target.innerHTML = html
  const app = hydrate(component, { target, props })
  onTestFinished(async () => {
    await unmount(app)
    target.remove()
  })
  return html
}
