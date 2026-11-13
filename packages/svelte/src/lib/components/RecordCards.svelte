<script lang="ts">
  /*
   * A record list's markup on core's record list controller, shared by `InkRecordList` and
   * `InkSearchResults`: `createRecordList`'s `div.ink-records` holding `ul.ink-record-list` with
   * one `li.ink-record` card per row, the empty text and a polite live region. The controller
   * holds the rows, the count and the announcement, and handles the clicks, keys, Tab stop,
   * focus and scrolling. Empty, with no empty text, until there is a source.
   */
  import { resolveLabel } from '@inkbar/core'
  import {
    cardActions,
    createRecordListController,
    type RecordListController,
    type RecordListRow,
    type RecordListSource,
  } from '@inkbar/core/dom'
  import { untrack, type Snippet } from 'svelte'

  import type { HTMLAttributes } from 'svelte/elements'

  let {
    source,
    emptyShown = true,
    empty,
    oncount,
    class: className,
    ...rest
  }: Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
    source: RecordListSource | null
    /** Whether the empty text shows when there are no rows. Default true. */
    emptyShown?: boolean | undefined
    /** Replaces "Nothing here yet.". */
    empty?: Snippet | undefined
    /** Called with the number listed whenever it changes. */
    oncount?: ((count: number) => void) | undefined
  } = $props()

  /** A focused action button whose row re-renders: where to put focus back if it goes. */
  interface HeldFocus {
    button: HTMLElement
    id: string
    index: number
  }

  const actionButtons = (row: Element): HTMLElement[] => [
    ...row.querySelectorAll<HTMLElement>('.ink-card-actions > button'),
  ]

  let root = $state<HTMLDivElement | null>(null)
  let controller = $state.raw<RecordListController | null>(null)
  let rows = $state.raw<readonly RecordListRow[]>([])
  let announcement = $state('')
  const showEmpty = $derived(controller !== null && rows.length === 0 && emptyShown)

  /** The count last reported, across sources. */
  let reported: number | null = null
  let held: HeldFocus | null = null

  function report(count: number): void {
    if (count === reported) return
    reported = count
    oncount?.(count)
  }

  /**
   * Before the rows re-render under a focused action whose button goes (its card lost that
   * action), note where it was; the effect below focuses the same place in the card, else the
   * row. A row that goes is the controller's to re-home.
   */
  function holdActionFocus(el: HTMLElement): void {
    const active = el.ownerDocument.activeElement
    if (!(active instanceof HTMLButtonElement) || !el.contains(active)) return
    const row = active.closest<HTMLElement>('[data-ink-record]')
    const id = row?.dataset.inkRecord
    if (!row || id === undefined) return
    held = { button: active, id, index: actionButtons(row).indexOf(active) }
  }

  $effect(() => {
    const el = root
    const s = source
    if (!el || !s) return
    return untrack(() => {
      const c = createRecordListController(s)
      controller = c
      rows = c.rows.get()
      announcement = c.announcement.get()
      report(c.count.get())
      const stops = [
        c.rows.subscribe((next) => {
          holdActionFocus(el)
          rows = next
        }),
        c.count.subscribe(report),
        c.announcement.subscribe((text) => {
          announcement = text
        }),
      ]
      const detach = c.attach(el)
      return () => {
        for (const stop of stops) stop()
        detach()
        c.destroy()
        controller = null
        rows = []
        announcement = ''
      }
    })
  })

  // After the rows have re-rendered.
  $effect(() => {
    void rows
    const el = root
    untrack(() => {
      const focus = held
      held = null
      if (!focus || !el || focus.button.isConnected) return
      const row = [...el.querySelectorAll<HTMLElement>('[data-ink-record]')].find(
        (r) => r.dataset.inkRecord === focus.id
      )
      if (row) (actionButtons(row)[focus.index] ?? row).focus({ preventScroll: true })
    })
  })
</script>

<div
  {...rest}
  bind:this={root}
  class={['ink-records', className]}
  data-ink-records=""
  tabindex="-1"
>
  <ul class="ink-record-list" role="list" hidden={rows.length === 0}>
    <!-- The controller sets each row's tabindex. -->
    {#each rows as { item, card, selected } (item.id)}
      <li
        class="ink-record"
        data-ink-record={item.id}
        aria-current={selected ? 'true' : undefined}
        data-selected={selected ? '' : undefined}
      >
        <div class={['ink-card', card?.className]}>
          {#if card}
            <p class="ink-card-title">{resolveLabel(card.title)}</p>
            {#if card.meta !== undefined}
              <!-- prettier-ignore -->
              <p class="ink-card-meta">{#if card.swatch !== undefined}<span class="ink-card-swatch" style:background={card.swatch}></span>{/if}{card.meta}</p>
            {/if}
            {#if card.body !== undefined}
              <p class="ink-card-body">{card.body}</p>
            {/if}
            {#if card.excerpt !== undefined}
              <!-- prettier-ignore -->
              <p class="ink-card-excerpt">{card.excerpt.before}<mark>{card.excerpt.match}</mark>{card.excerpt.after}</p>
            {/if}
            <div class="ink-card-actions">
              {#each cardActions(card) as action (action.key)}
                <button type="button" onclick={() => controller?.act(item.id, action.key)}
                  >{resolveLabel(action.label)}</button
                >
              {/each}
            </div>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
  <p class="ink-record-list-empty" hidden={!showEmpty}>
    {#if empty}{@render empty()}{:else}Nothing here yet.{/if}
  </p>
  <div class="ink-visually-hidden" aria-live="polite" data-ink-record-status="">
    {announcement}
  </div>
</div>
