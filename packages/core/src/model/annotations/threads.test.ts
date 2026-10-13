import { describe, expect, it } from 'vitest'

import { isAbandonedNote, repliesTo, threadOf, threadRoot } from './threads'

import type { Annotation, NoteAnnotation } from './types'

function note(
  id: string,
  createdAt: string,
  extra: Partial<NoteAnnotation> = {}
): NoteAnnotation {
  return {
    id,
    type: 'note',
    icon: 'comment',
    page: 0,
    rect: { x: 0, y: 0, width: 20, height: 20 },
    color: '#ffd400',
    opacity: 1,
    createdAt,
    modifiedAt: createdAt,
    source: 'session',
    ...extra,
  }
}

const root = note('r', '2026-10-13T00:00:00.000Z', { contents: 'Root' })
const b = note('b', '2026-10-13T00:00:02.000Z', { contents: 'B', inReplyTo: 'r' })
const c = note('c', '2026-10-13T00:00:03.000Z', { contents: 'C to B', inReplyTo: 'b' })
const d = note('d', '2026-10-13T00:00:01.000Z', { contents: 'D', inReplyTo: 'r' })
const list: Annotation[] = [c, b, root, d]

describe('repliesTo', () => {
  it('returns direct replies in creation order', () => {
    expect(repliesTo(list, 'r').map((a) => a.id)).toEqual(['d', 'b'])
    expect(repliesTo(list, 'x')).toEqual([])
  })
})

describe('threadRoot', () => {
  it('follows inReplyTo up to the root', () => {
    expect(threadRoot(list, c).id).toBe('r')
    expect(threadRoot(list, root).id).toBe('r')
  })

  it('stops at a missing parent, a parent that is not a note, or a cycle', () => {
    const orphan = note('o', '2026-10-13T00:00:04.000Z', { inReplyTo: 'missing' })
    expect(threadRoot([orphan], orphan).id).toBe('o')
    const mark: Annotation = {
      id: 'm',
      type: 'redact',
      page: 0,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      quads: [],
      color: '#000000',
      fill: '#000000',
      opacity: 1,
      origin: 'user',
      createdAt: '2026-10-13T00:00:00.000Z',
      modifiedAt: '2026-10-13T00:00:00.000Z',
      source: 'session',
    }
    const onMark = note('n', '2026-10-13T00:00:05.000Z', { inReplyTo: 'm' })
    expect(threadRoot([mark, onMark], onMark).id).toBe('n')
    const x = note('x', '2026-10-13T00:00:06.000Z', { inReplyTo: 'y' })
    const y = note('y', '2026-10-13T00:00:07.000Z', { inReplyTo: 'x' })
    expect(['x', 'y']).toContain(threadRoot([x, y], x).id)
  })
})

describe('threadOf', () => {
  it('lists the root then replies depth first, each level in creation order', () => {
    expect(threadOf(list, root).map((a) => a.id)).toEqual(['r', 'd', 'b', 'c'])
  })

  it('visits each annotation once in a cycle', () => {
    const x = note('x', '2026-10-13T00:00:06.000Z', { inReplyTo: 'y' })
    const y = note('y', '2026-10-13T00:00:07.000Z', { inReplyTo: 'x' })
    expect(threadOf([x, y], x).map((a) => a.id)).toEqual(['x', 'y'])
  })
})

describe('isAbandonedNote', () => {
  it('is true only for an unlocked root note with no text and no replies', () => {
    const empty = note('e', '2026-10-13T00:00:00.000Z')
    expect(isAbandonedNote([empty], 'e')).toBe(true)
    expect(
      isAbandonedNote([note('e', '2026-10-13T00:00:00.000Z', { contents: '  ' })], 'e')
    ).toBe(true)
    expect(isAbandonedNote([{ ...empty, contents: 'x' }], 'e')).toBe(false)
    expect(isAbandonedNote([{ ...empty, locked: true }], 'e')).toBe(false)
    expect(isAbandonedNote([{ ...empty, inReplyTo: 'r' }], 'e')).toBe(false)
    const reply = note('q', '2026-10-13T00:00:01.000Z', {
      inReplyTo: 'e',
      contents: 'hi',
    })
    expect(isAbandonedNote([empty, reply], 'e')).toBe(false)
    expect(isAbandonedNote([], 'e')).toBe(false)
  })
})
