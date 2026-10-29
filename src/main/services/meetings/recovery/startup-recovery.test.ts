import { describe, expect, it } from 'vitest'
import { danglingMeetingEndedAt } from './startup-recovery-time'

describe('danglingMeetingEndedAt', () => {
  it('uses the meeting start when no transcript segments were persisted', () => {
    expect(danglingMeetingEndedAt('2026-10-29 14:15:16', null)).toBe('2026-10-29 14:15:16')
  })

  it('adds the final segment end offset to the UTC meeting start', () => {
    expect(danglingMeetingEndedAt('2026-10-29 23:59:58', 3_456)).toBe('2026-10-30 00:00:01.456')
  })
})
