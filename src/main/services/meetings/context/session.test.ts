import { expect, it, vi } from 'vitest'
import { applyContext } from './session'
import type { MeetingContext, ContextUpdate } from '@shared/live-controls/types'
const current: MeetingContext = { meetingId: 1, revision: 0, text: '' }
const update: ContextUpdate = { meetingId: 1, expectedRevision: 0, text: 'Correction' }
it('commits before publication and leaves state untouched on failure', () => {
  const publish = vi.fn(),
    persist = vi.fn(() => {
      throw new Error('disk full')
    })
  expect(() => applyContext(current, update, 0, persist, publish)).toThrow('disk full')
  expect(publish).not.toHaveBeenCalled()
  expect(current.text).toBe('')
  const order: string[] = []
  expect(
    applyContext(
      current,
      update,
      0,
      () => {
        order.push('commit')
      },
      () => {
        order.push('publish')
      },
    ).revision,
  ).toBe(1)
  expect(order).toEqual(['commit', 'publish'])
})
it('rejects a stale revision or another meeting and skips identical Apply', () => {
  const persist = vi.fn(),
    publish = vi.fn()
  expect(applyContext(current, { ...update, text: '' }, 0, persist, publish)).toBe(current)
  expect(persist).not.toHaveBeenCalled()
  for (const patch of [{ meetingId: 2 }, { expectedRevision: 2 }])
    expect(() => applyContext(current, { ...update, ...patch }, 0, persist, publish)).toThrow()
})
it('builds on the saved initial context: the next revision persists at the given time', () => {
  const persist = vi.fn(),
    publish = vi.fn()
  const initial: MeetingContext = { meetingId: 1, revision: 0, text: 'Agenda: pilot scope' }
  const next = applyContext(initial, { ...update, text: '' }, 4200, persist, publish)
  expect(next).toEqual({ meetingId: 1, revision: 1, text: '' }) // a clear is a revision too
  expect(persist).toHaveBeenCalledWith(next, 4200)
  expect(publish).toHaveBeenCalledWith(next)
})
