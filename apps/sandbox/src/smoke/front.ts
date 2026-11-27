/*
 * What the checks need from a front end. Each of the four (plain DOM, Vue, React, Svelte) mounts
 * its own real viewer with the same controls, so the checks find them by the markup all four
 * share, and do the rest through this small interface: the binding's own way to open a source,
 * change the language and apply the redaction marks.
 */
import { drawTool, highlightTool, redactAreaTool } from '@inkbar/core/dom'

import type { FrontId } from './front-ids.ts'
import type {
  DocumentSource,
  InkDocument,
  InkMessagesInput,
  RedactionResult,
} from '@inkbar/core'

/** What a front end's component receives. */
export interface FrontProps {
  source: DocumentSource
  messages: InkMessagesInput | undefined
  /** Each document the viewer shows, once it is ready: a redaction opens a new one. */
  onReady(this: void, doc: InkDocument): void
  /** The binding's `redacted` event or `onRedacted` callback, with the redacted file. */
  onRedacted(this: void, bytes: Uint8Array): void
  /** Hands over the binding's own apply: `useRedaction().apply`, or `viewer.applyRedactions`. */
  onApply(this: void, apply: () => Promise<RedactionResult | null>): void
}

/** A mounted front end. */
export interface Front {
  /** Opens another source the binding's own way (its `src` prop, or `viewer.open`). */
  open(source: DocumentSource): void
  /** Changes the language in place (its `messages` prop, or `viewer.setMessages`). */
  setMessages(messages: InkMessagesInput | undefined): void
  unmount(): void
}

export type MountFront = (el: HTMLElement, props: FrontProps) => Front

/** The tools every front end offers, beside `select-text` and `select`. */
export const tools = () => [highlightTool(), drawTool(), redactAreaTool()]

/** Applies without the dialog: the page has no one to answer it. */
export const redactionConfirm = (): Promise<boolean> => Promise.resolve(true)

/** Loads one front end's mount, and only that one's code. */
export async function loadFront(id: FrontId): Promise<MountFront> {
  switch (id) {
    case 'vanilla':
      return (await import('./fronts/vanilla.ts')).mount
    case 'vue':
      return (await import('./fronts/vue.ts')).mount
    case 'react':
      return (await import('./fronts/react.tsx')).mount
    case 'svelte':
      return (await import('./fronts/svelte.svelte.ts')).mount
  }
}
