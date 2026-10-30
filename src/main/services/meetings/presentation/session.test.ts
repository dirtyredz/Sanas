import { describe, expect, it, vi } from 'vitest'
import { PresentationSession } from './session'
const deck = ['one', 'two', 'three'].map((title) => ({
  title,
  talkingPoint: title,
  script: '',
  keyFacts: '',
}))
describe('presentation cursor', () => {
  it('snapshots content; records equal-time revisits and no boundary moves', () => {
    const persist = vi.fn(),
      publish = vi.fn(),
      moved = vi.fn()
    const session = new PresentationSession(persist, publish, moved)
    const input = structuredClone(deck)
    session.begin(4, input)
    input[0].title = 'edited'
    expect(session.state().current?.title).toBe('one')
    session.move(4, 'prev', 0)
    expect(persist).not.toHaveBeenCalled()
    expect(session.move(4, 'next', 100).revision).toBe(2)
    expect(session.move(4, 'prev', 100).revision).toBe(3)
    expect(persist.mock.calls.map((c) => c[1])).toEqual([
      { ordinal: 1, revision: 2, tMs: 100 },
      { ordinal: 0, revision: 3, tMs: 100 },
    ])
    session.clear()
    expect(session.state().current).toBeNull()
    expect(() => session.move(4, 'next', 100)).toThrow(/no longer/)
  })
  it('does not advance or reset assistance on persistence failure', () => {
    const moved = vi.fn(),
      publish = vi.fn()
    const session = new PresentationSession(
      () => {
        throw new Error('disk full')
      },
      publish,
      moved,
    )
    session.begin(4, deck)
    expect(() => session.move(4, 'next', 10)).toThrow('disk full')
    expect(session.state().revision).toBe(1)
    expect(moved).not.toHaveBeenCalled()
    expect(publish).toHaveBeenCalledTimes(1)
  })
})
