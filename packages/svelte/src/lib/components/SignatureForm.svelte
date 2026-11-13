<script lang="ts">
  /*
   * The body of `InkSignatureDialog`, mounted while it is open: one draft per opening. Draw,
   * Type and Image tabs, then Cancel and Save.
   */
  import {
    createSignatureDraft,
    fontFamilyValue,
    handleRadioKeys,
    handleTabKeys,
    SIGNATURE_TABS,
    type SignatureTab,
  } from '@inkbar/core/dom'
  import { Dialog } from 'bits-ui'
  import { untrack } from 'svelte'

  import { useInkContext } from '../context.js'
  import { useHasTool } from '../hooks/useRegisteredTool.svelte.js'
  import { useTool } from '../hooks/useTool.svelte.js'
  import { useToolOptionsWhile } from '../hooks/useToolOptions.svelte.js'
  import { useMessages } from '../messages.js'
  import { useReadable } from '../use-readable.svelte.js'

  import type { SignatureOptions, SignatureTemplate } from '@inkbar/core'

  let {
    fonts,
    select,
    onSaved,
    onClose,
  }: {
    fonts: readonly string[] | undefined
    /** Whether saving selects the new signature for the `signature` tool. */
    select: boolean
    onSaved: (t: SignatureTemplate) => void
    onClose: () => void
  } = $props()

  const ctx = useInkContext('InkSignatureDialog')
  const m = useMessages()
  const current = useTool()
  // Without the signature tool, Save only stores the template, as signing a form field needs.
  const hasSignatureTool = useHasTool(ctx, 'signature')
  const signature = useToolOptionsWhile<SignatureOptions>(
    'signature',
    () => hasSignatureTool.current
  )
  // One draft per opening: the fonts are read once.
  const draft = untrack(() =>
    createSignatureDraft({
      fonts: fonts ?? ctx.signatureFonts,
      messages: ctx.messageState,
    })
  )
  const draftState = useReadable(() => draft.state, draft.state.get())
  const s = $derived(draftState.current)
  const uid = $props.id()
  let padHost = $state<HTMLDivElement | null>(null)

  $effect(() => {
    if (!padHost) return
    return draft.attachPad(padHost)
  })
  $effect(() => () => draft.destroy())

  function save(): void {
    draft.save(ctx.signatures).then(
      (t) => {
        if (!t) return
        if (select && hasSignatureTool.current) {
          signature.setOptions({ templateId: t.id })
          current.setTool('signature')
        }
        onSaved(t)
        onClose()
      },
      () => {
        // The host's store refused it: the dialog stays open to try again.
      }
    )
  }

  const tabId = (tab: SignatureTab) => `${uid}-tab-${tab}`
  const panelId = (tab: SignatureTab) => `${uid}-panel-${tab}`
  const shown = $derived(s.name.trim() || m.current.signature.namePlaceholder)
</script>

<div
  role="tablist"
  tabindex="-1"
  aria-label={m.current.signature.tabs}
  class="ink-tabs"
  onkeydown={(e) => handleTabKeys(e, e.currentTarget)}
>
  {#each SIGNATURE_TABS as tab (tab)}
    <button
      type="button"
      role="tab"
      id={tabId(tab)}
      aria-controls={panelId(tab)}
      aria-selected={s.tab === tab}
      tabindex={s.tab === tab ? 0 : -1}
      class="ink-tab"
      data-key={tab}
      data-state={s.tab === tab ? 'active' : 'inactive'}
      onclick={() => draft.setTab(tab)}
    >
      {m.current.signature[tab]}
    </button>
  {/each}
</div>
<div
  role="tabpanel"
  id={panelId('draw')}
  aria-labelledby={tabId('draw')}
  class="ink-tab-panel"
  data-key="draw"
  hidden={s.tab !== 'draw'}
>
  <div
    bind:this={padHost}
    class="ink-signature-pad-host"
    data-ink-signature-pad-host=""
    role="img"
    aria-label={m.current.signature.pad}
  ></div>
  <div class="ink-dialog-row">
    <button
      type="button"
      class="ink-button"
      data-ink-signature-clear=""
      disabled={s.padEmpty}
      onclick={() => draft.clearPad()}
    >
      {m.current.signature.clear}
    </button>
  </div>
</div>
<div
  role="tabpanel"
  id={panelId('type')}
  aria-labelledby={tabId('type')}
  class="ink-tab-panel"
  data-key="type"
  hidden={s.tab !== 'type'}
>
  <label class="ink-field">
    <span>{m.current.signature.name}</span>
    <input
      type="text"
      class="ink-input"
      data-ink-signature-name=""
      autocomplete="name"
      placeholder={m.current.signature.namePlaceholder}
      value={s.name}
      oninput={(e) => draft.setName(e.currentTarget.value)}
    />
  </label>
  <div
    role="radiogroup"
    tabindex="-1"
    aria-label={m.current.signature.fonts}
    class="ink-signature-fonts"
    onkeydown={(e) => handleRadioKeys(e, e.currentTarget)}
  >
    {#each draft.fonts as font (font)}
      <button
        type="button"
        role="radio"
        aria-checked={s.font === font}
        aria-label={font}
        tabindex={s.font === font ? 0 : -1}
        class="ink-signature-font"
        data-key={font}
        data-state={s.font === font ? 'checked' : 'unchecked'}
        onclick={() => draft.setFont(font)}
      >
        <!-- The font is the option itself, so it is set here, not left to the theme. -->
        <span class="ink-signature-font-sample" style:font-family={fontFamilyValue(font)}
          >{shown}</span
        >
      </button>
    {/each}
  </div>
</div>
<div
  role="tabpanel"
  id={panelId('image')}
  aria-labelledby={tabId('image')}
  class="ink-tab-panel"
  data-key="image"
  hidden={s.tab !== 'image'}
>
  <label class="ink-field">
    <span>{m.current.signature.file}</span>
    <input
      type="file"
      accept="image/png,image/jpeg"
      class="ink-input"
      data-ink-signature-file=""
      onchange={(e) => void draft.chooseFile(e.currentTarget.files?.[0])}
    />
  </label>
  {#if s.image?.kind === 'image'}
    <img class="ink-signature-image" src={s.image.imagedata} alt="" />
  {/if}
  {#if s.imageError}
    <p class="ink-field-error" role="alert">{s.imageError}</p>
  {/if}
</div>
{#if s.saveError}
  <p class="ink-field-error" role="alert" data-ink-signature-save-error="">
    {s.saveError}
  </p>
{/if}
<div class="ink-dialog-actions">
  <Dialog.Close>
    {#snippet child({ props })}
      <button {...props} type="button" class="ink-button" data-ink-signature-cancel="">
        {m.current.signature.cancel}
      </button>
    {/snippet}
  </Dialog.Close>
  <button
    type="button"
    class="ink-button"
    data-variant="primary"
    data-ink-signature-save=""
    disabled={!s.canSave}
    onclick={save}
  >
    {m.current.signature.save}
  </button>
</div>
