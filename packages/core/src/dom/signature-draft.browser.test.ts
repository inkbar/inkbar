import { describe, expect, it } from 'vitest'

import {
  createMemorySignatureStore,
  createSignatureLibrary,
  type SignatureTemplate,
} from '../model/signatures'

import { createSignatureDraft } from './signature-draft'

async function png(width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.fillRect(0, 0, width, height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
}

describe('createSignatureDraft', () => {
  it('drops the chosen image while another file is read', async () => {
    const draft = createSignatureDraft()
    draft.setTab('image')
    await draft.chooseFile(await png(40, 20))
    expect(draft.state.get().canSave).toBe(true)
    const next = draft.chooseFile(await png(30, 30))
    expect(draft.state.get().image).toBeUndefined()
    expect(draft.state.get().canSave).toBe(false)
    await next
    expect(draft.state.get().image?.aspect).toBe(1)
    draft.destroy()
  })

  it('resolves undefined for a save that finishes after the draft is destroyed', async () => {
    const store = createMemorySignatureStore()
    let finish!: () => void
    const saved: SignatureTemplate[] = []
    store.save = (t) =>
      new Promise((resolve) => {
        saved.push(t)
        finish = resolve
      })
    const library = createSignatureLibrary(store)
    const draft = createSignatureDraft()
    draft.setTab('type')
    draft.setName('Ada')
    const result = draft.save(library)
    await expect.poll(() => saved.length).toBe(1)
    draft.destroy()
    finish()
    expect(await result).toBeUndefined()
    // The store still has it: only the selection is dropped.
    expect(saved).toHaveLength(1)
  })

  it('saves again once a destroyed draft is mounted again', async () => {
    const library = createSignatureLibrary(createMemorySignatureStore())
    const draft = createSignatureDraft()
    draft.destroy()
    const detach = draft.attachPad(document.body)
    draft.setTab('type')
    draft.setName('Ada')
    expect(await draft.save(library)).toMatchObject({ kind: 'image' })
    detach()
    draft.destroy()
  })
})
