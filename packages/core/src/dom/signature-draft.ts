// The state behind the "Create signature" dialog, shared by every binding and the vanilla
// dialog: which tab is open, the pad, the typed name and font, the chosen image, and whether
// Save can go. The bindings render it; nothing here touches their markup.
import { readonly, writable, type Readable } from '../model/readable'

import {
  createImageSignature,
  createSignaturePad,
  createTypedSignature,
  type SignaturePad,
} from './signature-pad'
import { SIGNATURE_FONTS, type SignatureTab } from './ui'

import type { SignatureLibrary, SignatureTemplate } from '../model/signatures'

export interface SignatureDraftState {
  tab: SignatureTab
  /** True while the pad has nothing on it. */
  padEmpty: boolean
  name: string
  font: string
  /** The chosen image, read and checked. */
  image: SignatureTemplate | undefined
  /** Why the chosen file was refused, for the Image tab to show. */
  imageError: string | undefined
  /** Why the last save failed (the store refused it, full or offline), for the dialog to show. */
  saveError: string | undefined
  /** True when the open tab has something to save. */
  canSave: boolean
  saving: boolean
}

export interface SignatureDraft {
  readonly state: Readable<SignatureDraftState>
  readonly fonts: readonly string[]
  setTab(tab: SignatureTab): void
  setName(name: string): void
  setFont(font: string): void
  /** Mounts the pad in `host`; returns its teardown. One pad at a time. */
  attachPad(host: HTMLElement): () => void
  clearPad(): void
  /** Reads an image file for the Image tab. */
  chooseFile(file: Blob | undefined): Promise<void>
  /**
   * Builds the open tab's template and saves it to `library`. Resolves with it, or undefined
   * when there is nothing to save or the save failed; a failure sets `saveError`.
   */
  save(library: SignatureLibrary): Promise<SignatureTemplate | undefined>
  /** Back to an empty Draw tab. */
  reset(): void
  destroy(): void
}

export function createSignatureDraft(
  opts: { fonts?: readonly string[] } = {}
): SignatureDraft {
  const fonts = opts.fonts && opts.fonts.length > 0 ? [...opts.fonts] : SIGNATURE_FONTS
  const initial = (): SignatureDraftState => ({
    tab: 'draw',
    padEmpty: true,
    name: '',
    font: fonts[0]!,
    image: undefined,
    imageError: undefined,
    saveError: undefined,
    canSave: false,
    saving: false,
  })
  const state = writable<SignatureDraftState>(initial())
  let pad: SignaturePad | undefined
  let stopPad: (() => void) | undefined
  /** Only the latest file read lands. */
  let reads = 0

  const ready = (s: SignatureDraftState): boolean =>
    s.tab === 'draw'
      ? !s.padEmpty
      : s.tab === 'type'
        ? s.name.trim() !== ''
        : s.image !== undefined
  const patch = (p: Partial<SignatureDraftState>): void => {
    const next = { ...state.get(), ...p }
    state.set({ ...next, canSave: !next.saving && ready(next) })
  }

  const detachPad = (): void => {
    stopPad?.()
    stopPad = undefined
    pad?.destroy()
    pad = undefined
  }

  return {
    state: readonly(state),
    fonts,
    setTab: (tab) => patch({ tab }),
    setName: (name) => patch({ name }),
    setFont: (font) => patch({ font }),
    attachPad(host) {
      detachPad()
      const p = createSignaturePad(host)
      pad = p
      stopPad = p.empty.subscribe((padEmpty) => patch({ padEmpty }))
      patch({ padEmpty: p.empty.get() })
      return () => {
        if (pad === p) detachPad()
      }
    },
    clearPad() {
      pad?.clear()
    },
    async chooseFile(file) {
      const n = ++reads
      if (!file) {
        patch({ image: undefined, imageError: undefined })
        return
      }
      // The old image goes at once, so Save waits for the new one.
      patch({ image: undefined, imageError: undefined })
      try {
        const image = await createImageSignature(file)
        if (n === reads) patch({ image, imageError: undefined })
      } catch (e) {
        if (n === reads)
          patch({
            image: undefined,
            imageError:
              e instanceof RangeError
                ? 'This image is too large. Choose a smaller one.'
                : 'Choose a PNG or JPEG image.',
          })
      }
    },
    async save(library) {
      const s = state.get()
      if (!s.canSave) return undefined
      patch({ saving: true, saveError: undefined })
      try {
        const t =
          s.tab === 'draw'
            ? pad?.toTemplate()
            : s.tab === 'type'
              ? await createTypedSignature(s.name, s.font)
              : s.image
        if (!t) return undefined
        await library.save(t)
        return t
      } catch {
        patch({
          saveError: 'The signature could not be saved. Try again, or try a smaller one.',
        })
        return undefined
      } finally {
        patch({ saving: false })
      }
    },
    reset() {
      reads++
      pad?.clear()
      state.set({ ...initial(), padEmpty: pad ? pad.empty.get() : true })
    },
    destroy() {
      reads++
      detachPad()
    },
  }
}
