import { describe, expect, it } from 'vitest'
import type { MeetingState } from '@shared/types'
import { mergeMeetingState, type MeetingStateSnapshot } from './meeting-state'

const idle: MeetingState = { meetingId: null, status: 'idle' }
const live: MeetingState = { meetingId: 7, status: 'live' }
const paused: MeetingState = { meetingId: 7, status: 'paused' }

describe('meeting state initial-read merge', () => {
  it('uses the fetched state when no broadcast arrived first', () => {
    const initial: MeetingStateSnapshot = { state: idle, eventSeen: false }
    expect(mergeMeetingState(initial, live, 'fetch')).toEqual({ state: live, eventSeen: false })
  })

  it('does not let a late initial read overwrite an earlier broadcast', () => {
    const initial: MeetingStateSnapshot = { state: idle, eventSeen: false }
    const afterEvent = mergeMeetingState(initial, paused, 'event')
    expect(mergeMeetingState(afterEvent, live, 'fetch')).toBe(afterEvent)
  })

  it('continues to apply broadcasts after the initial read', () => {
    const initial: MeetingStateSnapshot = { state: idle, eventSeen: false }
    const afterFetch = mergeMeetingState(initial, live, 'fetch')
    expect(mergeMeetingState(afterFetch, paused, 'event')).toEqual({
      state: paused,
      eventSeen: true,
    })
  })
})
