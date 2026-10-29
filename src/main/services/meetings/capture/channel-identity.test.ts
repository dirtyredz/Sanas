import { describe, expect, it } from 'vitest'
import { resolveSpeakerIdentity } from './channel-identity'

describe('channel identity', () => {
  it('stereo: channel 0 is the user, channel 1 is others', () => {
    expect(resolveSpeakerIdentity(0, 2, true)).toEqual({ speaker: -1, isUser: true, role: 'user' })
    expect(resolveSpeakerIdentity(1, 2, true)).toEqual({ speaker: 2, isUser: false, role: 'other' })
  })

  it('stereo: an unknown channel is never implicit user speech', () => {
    for (const channel of [-1, 2, 7]) {
      expect(resolveSpeakerIdentity(channel, 0, true)).toEqual({
        speaker: -1,
        isUser: false,
        role: 'unknown',
      })
    }
  })

  it('stereo ignores mono pins', () => {
    expect(resolveSpeakerIdentity(1, 0, true, new Set([0]))).toMatchObject({ isUser: false })
  })

  it('mono: pins are the user, other known voices are others, no index is unknown', () => {
    const pins = new Set([1])
    expect(resolveSpeakerIdentity(0, 1, false, pins)).toMatchObject({ isUser: true, role: 'user' })
    expect(resolveSpeakerIdentity(0, 0, false, pins)).toMatchObject({ role: 'other' })
    expect(resolveSpeakerIdentity(0, -1, false, pins)).toMatchObject({ role: 'unknown' })
  })
})
