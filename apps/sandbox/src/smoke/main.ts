/*
 * The smoke page: a list of checks that run inside the browser against the real library, so a
 * real Safari, a phone or a tablet can show in under a minute whether the engine's WebAssembly
 * loads in its worker, pages render, and saving, redacting, forms, password files, the outline,
 * undo and the rest work. `?front=vanilla|vue|react|svelte` picks the front end the checks run
 * through, one per page load, so a failure in one cannot hide another. It uses only standard
 * web APIs. The results are on `window.__inkbarSmoke`, on the page as text, and POSTed to
 * `?report=<url>`.
 */
import { smokeChecks } from './checks.ts'
import { FRONTS, type FrontId } from './front-ids.ts'
import { loadFront } from './front.ts'
import { runChecks } from './run.ts'

const host = document.querySelector<HTMLElement>('[data-smoke-viewer]')!
const out = document.querySelector<HTMLElement>('[data-smoke-results]')!

const asked = new URLSearchParams(location.search).get('front') ?? 'vanilla'

async function main(): Promise<void> {
  if (!(FRONTS as readonly string[]).includes(asked)) {
    const unknown = {
      name: 'front end exists',
      timeout: 1_000,
      run: () =>
        Promise.reject(new Error(`Unknown front end. Use one of: ${FRONTS.join(', ')}.`)),
    }
    await runChecks(asked, [unknown], out)
    return
  }
  const front = asked as FrontId
  document.title = `Inkbar smoke check: ${front}`
  const { checks, finish } = smokeChecks(await loadFront(front), host)
  /*
   * `?awake` keeps a do-nothing timer running while the checks run. Safari on GitHub's macOS
   * runner pauses a page that has nothing scheduled for about 15 seconds before it hands over a
   * network response or an animation frame, so a check waiting on either stalls there. A running
   * timer stops that. Real Macs do not pause the page, so only the CI Safari run asks for it.
   */
  const awake = new URLSearchParams(location.search).has('awake')
    ? setInterval(() => undefined, 100)
    : undefined
  try {
    await runChecks(front, checks, out)
  } finally {
    clearInterval(awake)
    await finish()
  }
}

void main()
