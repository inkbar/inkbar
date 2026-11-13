// The state behind the "Create signature" dialog, shared by every binding and the vanilla
// dialog: which tab is open, the pad, the typed name and font, the chosen image, and whether
// Save can go. The bindings render it; nothing here touches their markup.
import { readonly, writable, type Readable } from '../model/readable'
import { isQuotaError } from '../model/signatures'

import { ENGLISH, type MessageState } from './messages-state'
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
   * when there is nothing to save, the save failed (setting `saveError`), or the draft was
   * destroyed before the save finished.
   */
  save(library: SignatureLibrary): Promise<SignatureTemplate | undefined>
  /** Back to an empty Draw tab. */
  reset(): void
  destroy(): void
}

type SignatureWords = MessageState['messages']['signature']
type ImageProblem = 'imageTooLarge' | 'imageType'
type SaveProblem = 'storageFull' | 'saveFailed'

export function createSignatureDraft(
  opts: {
    fonts?: readonly string[]
    /**
     * The words of `imageError` and `saveError`; English when omitted. A shown error is
     * rewritten when they change.
     */
    messages?: Readable<MessageState>
  } = {}
): SignatureDraft {
  const messages = opts.messages ?? ENGLISH
  const words = (): SignatureWords => messages.get().messages.signature
  /** What the shown errors are, so new words can say them again. */
  let imageProblem: ImageProblem | undefined
  let saveProblem: SaveProblem | undefined
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
  /** Set by `destroy`: a save that finishes later selects nothing. */
  let destroyed = false

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
  /** Sets the image error to `problem`'s words, with the rest of `p`, in one change. */
  const setImageProblem = (
    problem: ImageProblem | undefined,
    p: Partial<SignatureDraftState> = {}
  ): void => {
    imageProblem = problem
    patch({ ...p, imageError: problem && words()[problem] })
  }
  const setSaveProblem = (
    problem: SaveProblem | undefined,
    p: Partial<SignatureDraftState> = {}
  ): void => {
    saveProblem = problem
    patch({ ...p, saveError: problem && words()[problem] })
  }
  /** Says a shown error again in the words of the moment. */
  const sayErrors = (): void => {
    const s = state.get()
    if (s.imageError !== undefined && imageProblem) setImageProblem(imageProblem)
    if (s.saveError !== undefined && saveProblem) setSaveProblem(saveProblem)
  }
  const followMessages = (): (() => void) => messages.subscribe(sayErrors)
  let stopMessages: (() => void) | undefined = followMessages()

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
      // Mounting again revives a destroyed draft, as React's StrictMode remounts do.
      destroyed = false
      if (!stopMessages) {
        stopMessages = followMessages()
        // The words may have changed while nothing listened, and subscribing says nothing.
        sayErrors()
      }
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
      // The old image goes at once, so Save waits for the new one.
      setImageProblem(undefined, { image: undefined })
      if (!file) return
      try {
        const image = await createImageSignature(file)
        if (n === reads) setImageProblem(undefined, { image })
      } catch (e) {
        if (n === reads)
          setImageProblem(e instanceof RangeError ? 'imageTooLarge' : 'imageType', {
            image: undefined,
          })
      }
    },
    async save(library) {
      const s = state.get()
      if (!s.canSave) return undefined
      setSaveProblem(undefined, { saving: true })
      try {
        const t =
          s.tab === 'draw'
            ? pad?.toTemplate()
            : s.tab === 'type'
              ? await createTypedSignature(s.name, s.font)
              : s.image
        if (!t) return undefined
        await library.save(t)
        // Closed while saving: the template stays in the library, but nothing acts on it.
        return destroyed ? undefined : t
      } catch (e) {
        setSaveProblem(isQuotaError(e) ? 'storageFull' : 'saveFailed')
        return undefined
      } finally {
        patch({ saving: false })
      }
    },
    reset() {
      reads++
      pad?.clear()
      imageProblem = undefined
      saveProblem = undefined
      state.set({ ...initial(), padEmpty: pad ? pad.empty.get() : true })
    },
    destroy() {
      destroyed = true
      reads++
      detachPad()
      stopMessages?.()
      stopMessages = undefined
    },
  }
}
