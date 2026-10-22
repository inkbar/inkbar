<script module lang="ts">
  import type { ChildSnippet } from './child-snippet.js'
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  export interface InkCommandProps extends Omit<HTMLButtonAttributes, 'id' | 'children'> {
    /** The command's namespaced id, such as `sandbox.suggest`. Read once. */
    id: string
    children?: Snippet<[{ label: string; busy: boolean }]> | undefined
    /** Render your own button: spread `props` on it. */
    child?: ChildSnippet | undefined
  }
</script>

<script lang="ts">
  /*
   * A plugin command as a toolbar button with its status beside it: the markup of core's
   * `createCommandButton`, so the theme styles both alike. The button is named by the command's
   * label and disabled while the command is, except while it runs: then it keeps focus, with
   * `aria-busy` and `aria-disabled`, and a press does nothing. The status is a live region. A command without an icon shows its label as the button's text. Until the plugins
   * are set up (once InkRoot has mounted; never on the server) the button is disabled and
   * `aria-hidden`. An id no plugin registered stays that way and logs
   * `InkError('UnknownCommand')` to the console once.
   */
  import { Toolbar } from 'bits-ui'
  import { untrack } from 'svelte'

  import { useCommand } from '../hooks/useCommand.svelte.js'

  import { asBitsProps } from './child-snippet.js'
  import InkIcon from './InkIcon.svelte'

  let { id, children, child, disabled, onclick, ...rest }: InkCommandProps = $props()

  // The id is read once, as `useCommand` does: a different command is a different component.
  const commandId = untrack(() => id)
  const command = useCommand(commandId)
</script>

<div class="ink-command">
  <Toolbar.Button
    type="button"
    data-command={commandId}
    aria-label={command.label || undefined}
    title={command.label || undefined}
    aria-hidden={command.label ? undefined : 'true'}
    aria-busy={command.busy}
    aria-disabled={command.busy ? 'true' : undefined}
    disabled={(!command.enabled && !command.busy) || !!disabled}
    {...child ? { child } : {}}
    {...asBitsProps(rest)}
    onclick={(e) => {
      onclick?.(e)
      if (!e.defaultPrevented) void command.run()
    }}
  >
    {#if children}{@render children({
        label: command.label,
        busy: command.busy,
      })}{:else if command.icon}<InkIcon icon={command.icon} />{:else}{command.label}{/if}
  </Toolbar.Button>
  <span class="ink-command-status" role="status">{command.status}</span>
</div>
