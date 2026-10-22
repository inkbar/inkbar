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
  import {
    Highlighter,
    MessageSquare,
    PenLine,
    PenTool,
    Signature,
    Square,
    SquareDashedMousePointer,
    TextCursor,
    Type,
  } from '@inkbar/icons'
  import { Toolbar } from 'bits-ui'

  import { useInkContext } from '../context.js'
  import { useTool } from '../hooks/useTool.svelte.js'

  import { asBitsProps } from './child-snippet.js'
  import InkIcon from './InkIcon.svelte'

  import type { IconNode } from '@inkbar/icons'

  const ICONS: Readonly<Partial<Record<ToolId, IconNode>>> = {
    'select-text': TextCursor,
    select: SquareDashedMousePointer,
    highlight: Highlighter,
    'redact-area': Square,
    sketch: PenTool,
    draw: PenLine,
    note: MessageSquare,
    freetext: Type,
    signature: Signature,
  }

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
  /** A host or plugin tool by this id, for the name and icon core has none for. */
  const own = $derived(
    [...(ctx.hostTools ?? []), ...(ctx.pluginHost?.tools ?? [])].find(
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
>
  {#if children}{@render children({ active, label: name })}{:else if icon}<InkIcon
      {icon}
    />{/if}
</Toolbar.Button>
