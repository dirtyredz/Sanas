import { describe, expect, it } from 'vitest'
import type { SuggestionEvent, SuggestionPurpose } from '@shared/types'
import {
  EMPTY_WHISPER_HISTORY,
  READING_GRACE_MS,
  shouldFollowNewAmbient,
  whisperHistoryReducer,
} from './whisper-history'

function event(
  suggestionId: number,
  kind: SuggestionEvent['kind'],
  text = '',
  trigger: SuggestionEvent['trigger'] = 'ambient',
  purpose: SuggestionPurpose = 'answer',
): SuggestionEvent {
  return { suggestionId, meetingId: 7, trigger, purpose, kind, text }
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

  it('follows only when the latest answer is not being read', () => {
    const state = whisperHistoryReducer(EMPTY_WHISPER_HISTORY, {
      type: 'event',
      event: event(1, 'done', 'answer'),
      followNewest: true,
      now: 100,
    })
    expect(shouldFollowNewAmbient(state, { scrolled: false, pointerOver: false, now: 100 })).toBe(
      false,
    )
    expect(
      shouldFollowNewAmbient(state, {
        scrolled: false,
        pointerOver: false,
        now: 100 + READING_GRACE_MS,
      }),
    ).toBe(true)
    expect(
      shouldFollowNewAmbient(state, {
        scrolled: true,
        pointerOver: false,
        now: 100 + READING_GRACE_MS,
      }),
    ).toBe(false)
    expect(
      shouldFollowNewAmbient(state, {
        scrolled: false,
        pointerOver: true,
        now: 100 + READING_GRACE_MS,
      }),
    ).toBe(false)
  })

  it('keeps the next-point purpose from start to done', () => {
    let state = whisperHistoryReducer(EMPTY_WHISPER_HISTORY, {
      type: 'event',
      event: event(1, 'start', '', 'ambient', 'next-point'),
      followNewest: true,
      now: 10,
    })
    expect(state.items[0]).toMatchObject({ purpose: 'next-point', streaming: true })
    state = whisperHistoryReducer(state, {
      type: 'event',
      event: event(1, 'done', 'Next, check the status.', 'ambient', 'next-point'),
      followNewest: false,
      now: 20,
    })
    expect(state.items[0]).toMatchObject({
      purpose: 'next-point',
      streaming: false,
      text: 'Next, check the status.',
    })
  })

  it('still focuses a requested answer when followNewest is false', () => {
    let state = whisperHistoryReducer(EMPTY_WHISPER_HISTORY, {
      type: 'event',
      event: event(1, 'done', 'one'),
      followNewest: true,
      now: 10,
    })
    state = whisperHistoryReducer(state, {
      type: 'event',
      event: event(2, 'start', '', 'hotkey'),
      followNewest: false,
      now: 20,
    })
    expect(state.selectedId).toBe(2)
  })
})
