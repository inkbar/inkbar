<script lang="ts">
  /*
   * The signature menu for a signature field, opened from the field's "Sign" button and
   * anchored to its box. It lists the saved signatures and "Create signature", as
   * `InkSignatureMenu` does. Picking one signs the field with it (`signField`); a signature
   * made in `InkSignatureDialog` signs the field once saved, without picking the signature
   * tool. Focus returns to the field. InkViewport mounts it, one per document; hosts compose
   * nothing.
   */
  import { InkError, signField } from '@inkbar/core'
  import {
    handleMenuKeys,
    SIGNATURE_LABELS,
    signatureMenuModel,
    watchDetached,
  } from '@inkbar/core/dom'
  import { Popover } from 'bits-ui'
  import { untrack } from 'svelte'

  import { useInkContext } from '../context.js'
  import { useReadable } from '../use-readable.svelte.js'

  import InkSignatureDialog from './InkSignatureDialog.svelte'
  import { createMenuOpenFocus } from './menu-open-focus.js'
  import SignatureMenuPanel from './SignatureMenuPanel.svelte'

  import type { InkDocument, SignatureTemplate } from '@inkbar/core'
  import type { SignFieldRequest } from '@inkbar/core/dom'

  let {
    request,
    onClose,
  }: {
    /** The field to sign; `null` while the menu is closed. */
    request: SignFieldRequest | null
    onClose: () => void
  } = $props()

  const NO_TEMPLATES: readonly SignatureTemplate[] = []

  const ctx = useInkContext('InkSignFieldPopover')
  const templates = useReadable(() => ctx.signatures.templates, NO_TEMPLATES)
  // No signature is "chosen" here: each signing picks its own.
  const model = $derived(signatureMenuModel(templates.current, {}))
  const open = $derived(request !== null)
  let menu = $state<HTMLElement | null>(null)
  /** The field the dialog signs once its signature is saved, and the document it is in. */
  let creatingFor = $state.raw<{ req: SignFieldRequest; doc: InkDocument } | null>(null)
  /**
   * The request the menu last opened for, kept to return focus once it closes. Untracked:
   * Bits UI reports the close from an effect teardown, where a reactive read of `request`
   * returns the value from before the close.
   */
  let last: SignFieldRequest | null = null
  /** Set while the menu closes for the dialog, which takes focus instead of the field. */
  let toDialog = false
  /** Cleared on destroy, so a dialog save that settles after the document went signs nothing. */
  let alive = true
  $effect(() => () => {
    alive = false
  })

  $effect(() => {
    if (request) last = request
  })
  // The field's box went (its page unmounted, its layer rebuilt): the menu has nothing to
  // stand by.
  $effect(() => {
    const req = request
    if (!req) return
    return watchDetached(req.anchor, () => untrack(onClose))
  })
  // An old removal error is not news when the menu opens again.
  $effect(() => {
    if (open) untrack(() => ctx.signatures.clearRemoveError())
  })
  const openFocus = createMenuOpenFocus()
  $effect(() => {
    if (!open) openFocus.reset()
  })

  /** The field's own button, which focus returns to. */
  const control = (req: SignFieldRequest | null): HTMLElement | null =>
    req?.anchor.querySelector<HTMLElement>('button.ink-form-control') ?? null

  /** Signs the request's field with `t`; a refusal (signed, read-only by now) goes to `onError`. */
  function sign(req: SignFieldRequest, doc: InkDocument, t: SignatureTemplate): void {
    // The document the request came from is still the open one.
    if (!alive || ctx.document !== doc) return
    try {
      signField(doc, req.field, req.widget, t)
    } catch (e) {
      if (!(e instanceof InkError)) throw e
      ctx.reportError(e)
    }
  }

  function choose(t: SignatureTemplate): void {
    const req = request
    const doc = ctx.document
    onClose()
    if (req && doc) sign(req, doc, t)
  }

  function create(): void {
    const req = request
    const doc = ctx.document
    if (!req || !doc) return
    toDialog = true
    creatingFor = { req, doc }
    onClose()
  }

  function onInteractOutside(e: PointerEvent): void {
    // A press on this field's own button toggles the menu through the engine; it must not
    // also close it here first, or the click would open it again.
    const target = e.target
    if (target instanceof Node && request?.anchor.contains(target)) e.preventDefault()
  }
</script>

<Popover.Root
  bind:open={
    () => open,
    (next) => {
      if (!next) onClose()
    }
  }
>
  <Popover.Portal>
    {#if request}
      <Popover.Content
        bind:ref={menu}
        role="menu"
        aria-label={SIGNATURE_LABELS.menu}
        class="ink-select-content ink-menu-content"
        data-ink-select-content=""
        data-ink-menu="signature"
        data-ink-sign-field-menu={request.field}
        customAnchor={request.anchor}
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        onOpenAutoFocus={(e) => openFocus.onOpenAutoFocus(e, menu)}
        onfocusin={openFocus.onfocusin}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          if (!toDialog) control(last)?.focus({ preventScroll: true })
          toDialog = false
        }}
        {onInteractOutside}
        onkeydown={(e) => menu && handleMenuKeys(e, menu)}
      >
        <SignatureMenuPanel
          items={model.items}
          menu={() => menu}
          onChoose={choose}
          onCreate={create}
        />
      </Popover.Content>
    {/if}
  </Popover.Portal>
</Popover.Root>
<InkSignatureDialog
  bind:open={
    () => creatingFor !== null,
    (next) => {
      if (!next) creatingFor = null
    }
  }
  select={false}
  onSave={(t) => {
    const c = creatingFor
    if (c) sign(c.req, c.doc, t)
  }}
  onCloseAutoFocus={(e) => {
    e.preventDefault()
    control(last)?.focus({ preventScroll: true })
  }}
/>
