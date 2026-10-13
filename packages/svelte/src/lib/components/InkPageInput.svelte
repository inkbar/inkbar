<script module lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements'

  export type InkPageInputProps = Omit<
    HTMLInputAttributes,
    'value' | 'onchange' | 'oninput' | 'type' | 'min' | 'max' | 'children'
  >
</script>

<script lang="ts">
  import { usePage } from '../hooks/usePage.svelte.js'

  let { class: className, onkeydown, ...rest }: InkPageInputProps = $props()

  const page = usePage()
  // Writable derived: follows the current page, and holds what the user types until then.
  let draft = $derived(String(page.current + 1))

  /** 1-based in the input, 0-based in the viewport. Out of range resets to the current page. */
  function commit(value: string): void {
    const n = Number(value)
    if (Number.isInteger(n) && n >= 1 && n <= page.count) {
      if (n - 1 !== page.current) page.goTo(n - 1)
    } else draft = String(page.current + 1)
  }
  function onKeyDown(e: KeyboardEvent & { currentTarget: HTMLInputElement }): void {
    onkeydown?.(e)
    if (e.defaultPrevented || e.key !== 'Enter') return
    e.preventDefault()
    commit(draft)
  }
</script>

<!-- `onchange` is the native change event: it fires on blur after typing, and on each step of
     the spinner or the arrow keys. `oninput` keeps the draft for Enter. -->
<input
  class={['ink-page-input', className]}
  data-ink-page-input=""
  type="number"
  inputmode="numeric"
  aria-label="Page"
  min={1}
  max={page.count}
  value={draft}
  oninput={(e) => (draft = e.currentTarget.value)}
  onchange={(e) => commit(e.currentTarget.value)}
  onkeydown={onKeyDown}
  {...rest}
/>
