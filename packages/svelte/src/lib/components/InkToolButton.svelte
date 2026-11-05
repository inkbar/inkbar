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
  import { TOOL_LABELS, withHostTools } from '@inkbar/core/dom'
  import { SquareDashedMousePointer, TextCursor } from '@inkbar/icons'
  import { Toolbar } from 'bits-ui'

  import { useInkContext } from '../context.js'
  import { useRegisteredTool } from '../hooks/useRegisteredTool.svelte.js'
  import { useTool } from '../hooks/useTool.svelte.js'

  import { asBitsProps } from './child-snippet.js'
  import InkIcon from './InkIcon.svelte'

  import type { IconNode } from '@inkbar/icons'

  const ICONS: Readonly<Partial<Record<ToolId, IconNode>>> = {
    'select-text': TextCursor,
    select: SquareDashedMousePointer,
  }

  // A tool nobody registered leaves the button disabled, hidden from assistive tech, unnamed
  // and inert, whatever the host passed.
  const MISSING = {
    disabled: true,
    'aria-hidden': 'true',
    'aria-pressed': undefined,
    'aria-label': undefined,
    title: undefined,
    onclick: undefined,
  } as const

  let {
    tool,
    label,
    class: className,
    children,
    child,
    onclick,
    ...rest
  }: InkToolButtonProps = $props()

  const ctx = useInkContext('InkToolButton')
  const current = useTool()
  const active = $derived(current.tool === tool)
  const registered = useRegisteredTool(() => tool)
  /** The registered tool by this id, for the name and icon core has none for. */
  const own = $derived(
    withHostTools([...(ctx.hostTools ?? []), ...(ctx.pluginHost?.tools ?? [])]).find(
      (t) => t.id === tool
    )
  )
  // `label` and `children` win; then core's name and icon; then the tool's own.
  const name = $derived(label ?? TOOL_LABELS[tool] ?? own?.label ?? tool)
  const icon = $derived(ICONS[tool] ?? own?.icon)
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
  {...registered.current ? {} : MISSING}
>
  {#if registered.current}
    {#if children}{@render children({ active, label: name })}{:else if icon}<InkIcon
        {icon}
      />{/if}
  {/if}
</Toolbar.Button>
