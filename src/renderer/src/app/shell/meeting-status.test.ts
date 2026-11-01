import { describe, expect, it } from 'vitest'
import { describeMeetingStatus } from './meeting-status'

describe('describeMeetingStatus', () => {
  it('labels each meeting status with its own tone', () => {
    expect(describeMeetingStatus({ status: 'idle' })).toMatchObject({
      label: 'Not listening',
      tone: 'idle',
    })
    expect(describeMeetingStatus({ status: 'live' })).toMatchObject({
      label: 'Listening',
      tone: 'live',
    })
    expect(describeMeetingStatus({ status: 'paused' })).toMatchObject({
      label: 'Paused',
      tone: 'paused',
    })
    expect(describeMeetingStatus({ status: 'error' })).toMatchObject({
      label: 'Needs attention',
      tone: 'error',
    })
  })

  it('carries the reason into the detail when there is one', () => {
    expect(describeMeetingStatus({ status: 'error', error: 'Deepgram key rejected' }).detail).toBe(
      'Deepgram key rejected',
    )
    expect(
      describeMeetingStatus({ status: 'live', captureWarning: 'No system audio detected' }).detail,
    ).toBe('No system audio detected')
  })
})
