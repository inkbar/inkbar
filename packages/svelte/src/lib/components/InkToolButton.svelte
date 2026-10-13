<script module lang="ts">
  import type { ChildSnippet } from './child-snippet.js'
  import type { ToolId } from '@inkbar/core/dom'
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  export interface InkToolButtonProps extends Omit<HTMLButtonAttributes, 'children'> {
    tool: ToolId
    label?: string | undefined
    children?: Snippet<[{ active: boolean; label: string }]> | undefined
    child?: ChildSnippet | undefined
  }
</script>

<script lang="ts">
  import { TOOL_LABELS } from '@inkbar/core/dom'
  import { Toolbar } from 'bits-ui'

  import { useTool } from '../hooks/useTool.svelte.js'

  import { asBitsProps } from './child-snippet.js'

  let {
    tool,
    label,
    class: className,
    children,
    child,
    onclick,
    ...rest
  }: InkToolButtonProps = $props()

  const current = useTool()
  const active = $derived(current.tool === tool)
  const name = $derived(label ?? TOOL_LABELS[tool])
</script>

<Toolbar.Button
  class={['ink-tool-button', className]}
  data-ink-tool-button=""
  data-tool={tool}
  data-state={active ? 'on' : 'off'}
  aria-pressed={active}
  aria-label={name}
  title={name}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    if (!e.defaultPrevented) current.setTool(tool)
  }}
>
  {#if children}{@render children({ active, label: name })}{:else}{name}{/if}
</Toolbar.Button>
