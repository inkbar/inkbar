import { describe, expect, it } from 'vitest'

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
})
