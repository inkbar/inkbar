import { EngineError } from '../errors.ts'

const abortedError = () => new EngineError('aborted', 'The call was aborted.')

interface Job {
  /** Runs the work and settles the caller's promise; never rejects. */
  start: () => Promise<unknown>
  reject: (reason: unknown) => void
  detach: () => void
}

/**
 * Runs jobs one at a time, in the order they were queued: the next job starts only once the
 * running one has settled, even when that one waits on the event loop between steps, as a sliced
 * render does. A queued job can be aborted and never runs. The queue stops listening to a job's
 * signal when the job starts; stopping a running job is the transport's part. Shared by every
 * transport so they all queue and abort the same way.
 */
export class CallQueue {
  readonly #jobs: Job[] = []
  readonly #beforeEach: () => Promise<void>
  #running: Promise<void> | undefined
  #current: Promise<unknown> = Promise.resolve()
  #destroyed = false

  /** `beforeEach` runs before every job, so a queued job can be aborted meanwhile. */
  constructor(beforeEach: () => Promise<void> = () => Promise.resolve()) {
    this.#beforeEach = beforeEach
  }

  enqueue<T>(run: () => T | Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.#destroyed)
      return Promise.reject(new EngineError('engine-failure', 'The engine is destroyed.'))
    if (signal?.aborted) return Promise.reject(abortedError())
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        start: () => Promise.resolve().then(run).then(resolve, reject),
        reject,
        detach: () => signal?.removeEventListener('abort', onAbort),
      }
      const onAbort = () => {
        const at = this.#jobs.indexOf(job)
        if (at === -1) return
        this.#jobs.splice(at, 1)
        reject(abortedError())
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.#jobs.push(job)
      this.#running ??= this.#drain()
    })
  }

  /** Rejects queued jobs with `aborted` and waits for the running one. */
  async destroy(): Promise<void> {
    this.#destroyed = true
    for (const job of this.#jobs.splice(0)) {
      job.detach()
      job.reject(abortedError())
    }
    await this.#running
    await this.#current
  }

  async #drain(): Promise<void> {
    try {
      while (this.#jobs.length > 0) {
        let hookError: unknown
        let failed = false
        try {
          await this.#beforeEach()
        } catch (error) {
          failed = true
          hookError = error
        }
        const job = this.#jobs.shift()
        if (!job) break
        job.detach()
        if (failed) {
          job.reject(hookError)
          continue
        }
        this.#current = job.start()
        await this.#current
      }
    } finally {
      this.#running = undefined
    }
  }
}
