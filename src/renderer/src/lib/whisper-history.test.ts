import { describe, expect, it } from 'vitest'
import type { SuggestionEvent } from '@shared/types'
import {
  EMPTY_WHISPER_HISTORY,
  shouldFollowNewAmbient,
  whisperHistoryReducer,
} from './whisper-history'

function event(
  suggestionId: number,
  kind: SuggestionEvent['kind'],
  text = '',
  trigger: SuggestionEvent['trigger'] = 'ambient',
): SuggestionEvent {
  return { suggestionId, meetingId: 7, trigger, kind, text }
}

describe('whisper history', () => {
  it('appends and updates items by suggestion id', () => {
    let state = whisperHistoryReducer(EMPTY_WHISPER_HISTORY, {
      type: 'event',
      event: event(1, 'start'),
      followNewest: true,
      now: 10,
    })
    state = whisperHistoryReducer(state, {
      type: 'event',
      event: event(1, 'delta', 'Hello'),
      followNewest: false,
      now: 20,
    })
    state = whisperHistoryReducer(state, {
      type: 'event',
      event: event(2, 'start'),
      followNewest: false,
      now: 30,
    })

    expect(state.items).toHaveLength(2)
    expect(state.items[0]).toMatchObject({ suggestionId: 1, text: 'Hello', streaming: true })
    expect(state.selectedId).toBe(1)
  })

  it('resets for a new meeting and always selects a requested answer', () => {
    const old = whisperHistoryReducer(EMPTY_WHISPER_HISTORY, {
      type: 'event',
      event: event(1, 'done', 'old'),
      followNewest: true,
      now: 10,
    })
    const next = whisperHistoryReducer(old, {
      type: 'event',
      event: { ...event(2, 'start', '', 'hotkey'), meetingId: 8 },
      followNewest: false,
      now: 20,
    })
    expect(next.meetingId).toBe(8)
    expect(next.items.map((item) => item.suggestionId)).toEqual([2])
    expect(next.selectedId).toBe(2)
  })

  it('follows a new answer immediately while the latest answer is selected', () => {
    let state = whisperHistoryReducer(EMPTY_WHISPER_HISTORY, {
      type: 'event',
      event: event(1, 'done', 'answer'),
      followNewest: true,
      now: 100,
    })
    expect(shouldFollowNewAmbient(state, { scrolled: false })).toBe(true)

    state = whisperHistoryReducer(state, {
      type: 'event',
      event: event(2, 'start'),
      followNewest: shouldFollowNewAmbient(state, { scrolled: false }),
      now: 101,
    })
    expect(state.selectedId).toBe(2)
  })

  it('stays on an older answer until Latest or next-to-end resumes following', () => {
    let state = whisperHistoryReducer(EMPTY_WHISPER_HISTORY, {
      type: 'event',
      event: event(1, 'done', 'first'),
      followNewest: true,
      now: 100,
    })
    state = whisperHistoryReducer(state, {
      type: 'event',
      event: event(2, 'done', 'second'),
      followNewest: true,
      now: 101,
    })
    state = whisperHistoryReducer(state, { type: 'select', suggestionId: 1 })

    expect(shouldFollowNewAmbient(state, { scrolled: false })).toBe(false)
    state = whisperHistoryReducer(state, {
      type: 'event',
      event: event(3, 'start'),
      followNewest: shouldFollowNewAmbient(state, { scrolled: false }),
      now: 102,
    })
    expect(state.selectedId).toBe(1)

    state = whisperHistoryReducer(state, { type: 'select', suggestionId: 3 })
    expect(shouldFollowNewAmbient(state, { scrolled: false })).toBe(true)
  })

  it('stays on the latest answer while it has been scrolled', () => {
    const state = whisperHistoryReducer(EMPTY_WHISPER_HISTORY, {
      type: 'event',
      event: event(1, 'done', 'long answer'),
      followNewest: true,
      now: 100,
    })

    expect(shouldFollowNewAmbient(state, { scrolled: true })).toBe(false)
  })
})
