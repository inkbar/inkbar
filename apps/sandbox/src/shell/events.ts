/*
 * The Events panel: the running scenario's callbacks, newest first. It keeps the newest
 * MAX_EVENTS, so a long session never slows the page.
 */
import type { Log } from '../frameworks/types.ts'

export const MAX_EVENTS = 200
const MAX_PAYLOAD = 300

/** Strings as they are, anything else as JSON, cut to MAX_PAYLOAD characters. */
export function formatPayload(value: unknown): string {
  let text: string
  if (typeof value === 'string') text = value
  else {
    try {
      text = JSON.stringify(value) ?? String(value)
    } catch {
      text = String(value)
    }
  }
  return text.length > MAX_PAYLOAD ? `${text.slice(0, MAX_PAYLOAD - 1)}…` : text
}

/** `HH:MM:SS` in local time. */
export function formatTime(date: Date): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
}

/** Renders the panel into `el` and returns the log that writes to it. */
export function createEventLog(el: HTMLElement): { log: Log; clear(): void } {
  el.innerHTML = `
<div class="panel-head">
  <h2 id="events-title">Events</h2>
  <span class="event-count" data-event-count>0</span>
  <button type="button" class="link-button" data-clear-events>Clear</button>
</div>
<ol class="event-list" aria-live="polite" aria-labelledby="events-title" tabindex="0"></ol>
<p class="panel-empty" data-events-empty>Use the viewer. Its callbacks show up here.</p>`
  const list = el.querySelector<HTMLOListElement>('ol')!
  const count = el.querySelector<HTMLElement>('[data-event-count]')!
  const empty = el.querySelector<HTMLElement>('[data-events-empty]')!

  const sync = (): void => {
    const n = list.childElementCount
    count.textContent = String(n)
    empty.hidden = n > 0
  }

  const log: Log = (name, value) => {
    const item = document.createElement('li')
    const head = document.createElement('div')
    head.className = 'event-head'
    const nameEl = document.createElement('span')
    nameEl.className = 'event-name'
    nameEl.dataset.eventName = ''
    nameEl.textContent = name
    const time = document.createElement('time')
    time.className = 'event-time'
    time.textContent = formatTime(new Date())
    head.append(nameEl, time)
    const payload = document.createElement('span')
    payload.className = 'event-payload'
    payload.textContent = formatPayload(value)
    item.append(head, payload)
    list.prepend(item)
    while (list.childElementCount > MAX_EVENTS) list.lastElementChild!.remove()
    sync()
  }

  const clear = (): void => {
    list.replaceChildren()
    sync()
  }
  el.querySelector('[data-clear-events]')!.addEventListener('click', clear)
  sync()
  return { log, clear }
}
