/*
 * Which files the page fetches while something runs, from Resource Timing. Each context sees only
 * its own requests, and both readers fetch most of their files from a module worker: the engine
 * its binary and fonts, PDF.js its CMaps, fonts and WebAssembly. So while watching, every module
 * worker the page starts goes through a small module that imports the real worker script and
 * posts that worker's own entries back over a BroadcastChannel. The worker runs as it would,
 * but for one thing: its base URL is the wrapper's `blob:` URL, so its `fetch` resolves a
 * relative URL against the real script's URL first, as it would have been. No request is
 * otherwise changed or held up. A classic worker is only recorded as started.
 *
 * It is made for the smoke and measure pages, not as a general tool. What it does not cover:
 * - only a string passed to a wrapped worker's `fetch` is rebased; a `URL` or `Request` input,
 *   `XMLHttpRequest`, `importScripts` and `new URL(…, self.location)` see the `blob:` base;
 * - classic workers are not wrapped, so their requests are not seen;
 * - the `blob:` URLs it makes are never revoked.
 */

export interface SeenRequest {
  /** The URL, as Resource Timing names it. */
  name: string
  /** Bytes over the network, headers included; 0 from the HTTP cache. */
  transferSize: number
  /** The body's size before any content decoding. */
  encodedBodySize: number
  /** `page`, or the script URL of the worker that made it. */
  from: string
}

export interface RequestWatch {
  /** Every request seen since the watch started, in the order the entries arrived. */
  list(): SeenRequest[]
  /** The script URLs of the workers started since the watch started. */
  workers(): string[]
  /** Stops watching: workers started from now on are plain again. */
  stop(): void
}

const blobUrl = (code: string) =>
  URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))

/** Run first in the worker: `fetch` resolves a relative URL against the real script's URL. */
const baseFix = (script: string): string => `const real = globalThis.fetch
globalThis.fetch = (input, init) =>
  real(typeof input === 'string' ? new URL(input, ${JSON.stringify(script)}).href : input, init)
`

/**
 * A module worker that runs `script`, then reports the worker's requests. Its static imports run
 * in order before its body, and `buffered` catches what the script fetched meanwhile.
 */
const wrapper = (
  channel: string,
  script: string
): string => `import ${JSON.stringify(blobUrl(baseFix(script)))}
import ${JSON.stringify(script)}
const channel = new BroadcastChannel(${JSON.stringify(channel)})
const from = ${JSON.stringify(script)}
new PerformanceObserver((list) => channel.postMessage(list.getEntries().map((e) => ({
  name: e.name, transferSize: e.transferSize, encodedBodySize: e.encodedBodySize, from
})))).observe({ type: 'resource', buffered: true })
`

export function watchRequests(): RequestWatch {
  const seen: SeenRequest[] = []
  const started: string[] = []
  const name = `inkbar-requests-${Math.random().toString(36).slice(2)}`
  const channel = new BroadcastChannel(name)
  channel.onmessage = (event: MessageEvent<SeenRequest[]>) =>
    void seen.push(...event.data)

  const observer = new PerformanceObserver((list) => {
    for (const e of list.getEntries() as PerformanceResourceTiming[])
      seen.push({
        name: e.name,
        transferSize: e.transferSize,
        encodedBodySize: e.encodedBodySize,
        from: 'page',
      })
  })
  observer.observe({ type: 'resource' })

  const Real = globalThis.Worker
  class WatchedWorker extends Real {
    constructor(url: string | URL, options?: WorkerOptions) {
      const script = new URL(String(url), location.href).href
      started.push(script)
      // The blobs' URLs are never revoked: the worker may not have read them yet.
      super(options?.type === 'module' ? blobUrl(wrapper(name, script)) : url, options)
    }
  }
  globalThis.Worker = WatchedWorker

  return {
    list: () => [...seen],
    workers: () => [...started],
    stop() {
      if (globalThis.Worker === WatchedWorker) globalThis.Worker = Real
      observer.disconnect()
      channel.close()
    },
  }
}
