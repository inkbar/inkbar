<script lang="ts">
  /*
   * Opens the find bar; pressed while it is open. Pressing it again focuses the field. Place
   * it in a toolbar next to `InkFindBar`, which it needs for the field to focus. Disabled until
   * a document is open.
   */
  import { Search } from '@inkbar/icons'
  import { Toolbar } from 'bits-ui'
  import { tick } from 'svelte'

  import { useInkContext } from '../context.js'
  import { useDocument } from '../hooks/useDocument.svelte.js'
  import { useSearch } from '../hooks/useSearch.svelte.js'

  import { asBitsProps } from './child-snippet.js'
  import InkIcon from './InkIcon.svelte'

  import type { InkSearchButtonProps } from './search-button.js'

  let {
    class: className,
    children,
    child,
    disabled,
    onclick,
    ...rest
  }: InkSearchButtonProps = $props()

  const ctx = useInkContext('InkSearchButton')
  const search = useSearch()
  const doc = useDocument()
</script>

<Toolbar.Button
  {...asBitsProps(rest)}
  class={['ink-search-button', className]}
  data-ink-search-button=""
  aria-label="Find"
  title="Find"
  aria-pressed={search.state.open}
  data-state={search.state.open ? 'on' : 'off'}
  disabled={!doc.isReady || !!disabled}
  {...child ? { child } : {}}
  onclick={async (e) => {
    onclick?.(e)
    if (e.defaultPrevented) return
    search.open()
    // The bar shows once this update lands; its field takes focus then.
    await tick()
    const field = ctx.rootEl?.querySelector<HTMLInputElement>('[data-ink-find-bar] input')
    field?.focus()
    field?.select()
  }}
>
  {#if children}{@render children()}{:else}<InkIcon icon={Search} />{/if}
</Toolbar.Button>
