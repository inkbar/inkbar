import { describe, expect, it } from 'vitest'

import {
  isAbandonedNote,
  isReply,
  isThreadRoot,
  repliesTo,
  threadOf,
  threadRoot,
  withoutReplies,
} from './threads'

import type { Annotation, NoteAnnotation, TextMarkupAnnotation } from './types'

function note(
  id: string,
  createdAt: string,
  extra: Partial<NoteAnnotation> = {}
): NoteAnnotation {
  return {
    id,
    type: 'text',
    icon: 'Comment',
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

function markup(
  id: string,
  type: TextMarkupAnnotation['type'] = 'highlight',
  extra: Partial<TextMarkupAnnotation> = {}
): TextMarkupAnnotation {
  const p = { x: 0, y: 0 }
  return {
    id,
    type,
    page: 0,
    rect: { x: 0, y: 0, width: 20, height: 10 },
    quads: [{ p1: p, p2: p, p3: p, p4: p }],
    color: '#ffd400',
    opacity: 1,
    createdAt: '2026-10-13T00:00:00.000Z',
    modifiedAt: '2026-10-13T00:00:00.000Z',
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

  it('leaves the input list in its own order', () => {
    const input = [c, b, root, d]
    repliesTo(input, 'r')
    expect(input).toEqual([c, b, root, d])
  })
})

describe('threadRoot', () => {
  it('follows inReplyTo up to the root', () => {
    expect(threadRoot(list, c)?.id).toBe('r')
    expect(threadRoot(list, root)?.id).toBe('r')
  })

  it('stops at a missing parent, a parent that is not a note, or a cycle', () => {
    const orphan = note('o', '2026-10-13T00:00:04.000Z', { inReplyTo: 'missing' })
    expect(threadRoot([orphan], orphan)?.id).toBe('o')
    const mark: Annotation = {
      id: 'm',
      type: 'redact',
      page: 0,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      quads: [],
      color: '#000000',
      interiorColor: '#000000',
      opacity: 1,
      origin: 'user',
      createdAt: '2026-10-13T00:00:00.000Z',
      modifiedAt: '2026-10-13T00:00:00.000Z',
      source: 'session',
    }
    const onMark = note('n', '2026-10-13T00:00:05.000Z', { inReplyTo: 'm' })
    expect(threadRoot([mark, onMark], onMark)?.id).toBe('n')
    // x replies to y and y to x: the walk visits y, finds x already seen and stops at y.
    const x = note('x', '2026-10-13T00:00:06.000Z', { inReplyTo: 'y' })
    const y = note('y', '2026-10-13T00:00:07.000Z', { inReplyTo: 'x' })
    expect(threadRoot([x, y], x)?.id).toBe('y')
    expect(threadRoot([x, y], y)?.id).toBe('x')
  })

  it('stops at text markup: a reply to a highlight has the highlight as its root', () => {
    const h = markup('h')
    const r1 = note('r1', '2026-10-13T00:00:01.000Z', { contents: 'A', inReplyTo: 'h' })
    const r2 = note('r2', '2026-10-13T00:00:02.000Z', { contents: 'B', inReplyTo: 'r1' })
    expect(threadRoot([h, r1, r2], r2)?.id).toBe('h')
    expect(threadRoot([h, r1, r2], h)?.id).toBe('h')
  })

  it('is null for an annotation that cannot root a thread', () => {
    const square: Annotation = {
      id: 's',
      type: 'square',
      page: 0,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      color: '#000000',
      opacity: 1,
      width: 1,
      createdAt: '2026-10-13T00:00:00.000Z',
      modifiedAt: '2026-10-13T00:00:00.000Z',
      source: 'session',
    }
    expect(threadRoot([square], square)).toBeNull()
  })
})

describe('isThreadRoot', () => {
  it('is true for notes and every text markup kind', () => {
    expect(isThreadRoot(root)).toBe(true)
    for (const t of ['highlight', 'underline', 'strikeout', 'squiggly'] as const)
      expect(isThreadRoot(markup('m', t))).toBe(true)
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

  it('includes the replies to a highlight', () => {
    const h = markup('h', 'underline')
    const r1 = note('r1', '2026-10-13T00:00:01.000Z', { contents: 'A', inReplyTo: 'h' })
    const r2 = note('r2', '2026-10-13T00:00:02.000Z', { contents: 'B', inReplyTo: 'r1' })
    expect(threadOf([r2, h, r1], h).map((a) => a.id)).toEqual(['h', 'r1', 'r2'])
  })
})

describe('isAbandonedNote', () => {
  it('is true only for an unlocked root note with no text and no replies', () => {
    const empty = note('e', '2026-10-13T00:00:00.000Z')
    expect(isAbandonedNote(empty, [empty])).toBe(true)
    const blank = note('e', '2026-10-13T00:00:00.000Z', { contents: '  ' })
    expect(isAbandonedNote(blank, [blank])).toBe(true)
    const said = { ...empty, contents: 'x' }
    expect(isAbandonedNote(said, [said])).toBe(false)
    const locked = { ...empty, locked: true }
    expect(isAbandonedNote(locked, [locked])).toBe(false)
    const reply = { ...empty, inReplyTo: 'r' }
    expect(isAbandonedNote(reply, [reply])).toBe(false)
    const answer = note('q', '2026-10-13T00:00:01.000Z', {
      inReplyTo: 'e',
      contents: 'hi',
    })
    expect(isAbandonedNote(empty, [empty, answer])).toBe(false)
  })

  it('is false for a highlight with no comment: the highlight is the point', () => {
    const h = markup('h')
    expect(isAbandonedNote(h, [h])).toBe(false)
  })
})

describe('isReply and withoutReplies', () => {
  it('treat answers to notes and markup as replies, and nothing else', () => {
    const h = markup('h')
    const onH = note('oh', '2026-10-13T00:00:01.000Z', { inReplyTo: 'h' })
    const orphan = note('o', '2026-10-13T00:00:02.000Z', { inReplyTo: 'missing' })
    const all: Annotation[] = [...list, h, onH, orphan]
    expect(all.filter((a) => isReply(a, all)).map((a) => a.id)).toEqual([
      'c',
      'b',
      'd',
      'oh',
    ])
    expect(withoutReplies(all).map((a) => a.id)).toEqual(['r', 'h', 'o'])
  })
})
