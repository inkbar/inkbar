/**
 * How a worker is started from the `worker` option: in the calling thread (`false`), as given
 * (a `Worker`), straight from its URL, or, for a script on another origin than the page, through
 * a module of the page's own that imports it. A browser refuses `new Worker()` for a script on
 * another origin, but a module worker may import one when its origin sends CORS headers.
 */
export type WorkerStart =
  | { kind: 'in-thread' }
  | { kind: 'given' }
  | { kind: 'direct' }
  | { kind: 'imported'; href: string }

/**
 * Picks how to start the worker `worker` names, for a page at `page`. Only an `http:` or `https:`
 * URL whose origin differs from the page's is imported; a URL that cannot be read is left to
 * `new Worker()`, which reports it as it always has.
 */
export function workerStart(
  worker: string | URL | object | false,
  page: string | undefined
): WorkerStart {
  if (worker === false) return { kind: 'in-thread' }
  if (typeof worker !== 'string' && !(worker instanceof URL)) return { kind: 'given' }
  if (page === undefined) return { kind: 'direct' }
  let url: URL
  let origin: string
  try {
    url = new URL(String(worker), page)
    origin = new URL(page).origin
  } catch {
    return { kind: 'direct' }
  }
  const web = url.protocol === 'http:' || url.protocol === 'https:'
  return web && url.origin !== origin
    ? { kind: 'imported', href: url.href }
    : { kind: 'direct' }
}

/** What a worker script on another origin needs, said when its worker fails to start. */
export const CROSS_ORIGIN_HINT =
  'The worker script is on another origin than the page, so it is started from a blob: module ' +
  'that imports it: its origin must send CORS headers for it (Access-Control-Allow-Origin), and ' +
  'a content security policy must allow blob: in worker-src.'
