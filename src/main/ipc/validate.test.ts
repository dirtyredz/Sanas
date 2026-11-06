import { describe, expect, it } from 'vitest'
import {
  boundedText,
  requireMeetingStart,
  optionalText,
  requireBool,
  requireId,
  requireJob,
  requireOverlayResize,
  requireSettingsPatch,
  requireSpeaker,
  requireText,
} from './validate'

describe('scalars', () => {
  it('requireId accepts positive safe integers only', () => {
    expect(requireId(7, 'id')).toBe(7)
    for (const bad of [0, -1, 1.5, '7', null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => requireId(bad, 'id')).toThrow('Invalid id')
    }
  })
  it('requireSpeaker accepts zero and positive integers', () => {
    expect(requireSpeaker(0, 'speaker')).toBe(0)
    expect(requireSpeaker(3, 'speaker')).toBe(3)
    for (const bad of [-1, 1.5, '0', undefined]) {
      expect(() => requireSpeaker(bad, 'speaker')).toThrow('Invalid speaker')
    }
  })
  it('requireBool accepts only booleans', () => {
    expect(requireBool(false, 'flag')).toBe(false)
    for (const bad of [1, 'true', null, undefined]) {
      expect(() => requireBool(bad, 'flag')).toThrow('Invalid flag')
    }
  })
  it('requireOverlayResize accepts one or both positive integer dimensions', () => {
    expect(requireOverlayResize({ width: 380 })).toEqual({ width: 380 })
    expect(requireOverlayResize({ width: 380, height: 460, ignored: true })).toEqual({
      width: 380,
      height: 460,
    })
    for (const bad of [{}, null, { width: 0 }, { height: 12.5 }, { width: '380' }]) {
      expect(() => requireOverlayResize(bad)).toThrow('Invalid overlay resize')
    }
  })
  it('requireText trims and caps, rejecting empty', () => {
    expect(requireText('  hi ', 'title', 10)).toBe('hi')
    expect(() => requireText('   ', 'title', 10)).toThrow('Invalid title')
    expect(() => requireText('x'.repeat(11), 'title', 10)).toThrow('Invalid title')
    expect(() => requireText(42, 'title', 10)).toThrow('Invalid title')
  })
  it('boundedText keeps empty strings but rejects non-strings', () => {
    expect(boundedText('', 'notes', 5)).toBe('')
    expect(() => boundedText(undefined, 'notes', 5)).toThrow('Invalid notes')
    expect(() => boundedText('abcdef', 'notes', 5)).toThrow('Invalid notes')
  })
  it('optionalText turns anything but a string into empty and caps strings', () => {
    expect(optionalText(undefined, 5)).toBe('')
    expect(optionalText(5, 5)).toBe('')
    expect(optionalText('abcdefg', 5)).toBe('abcde')
  })
})

describe('requireJob', () => {
  const full = {
    id: 3,
    name: ' Northwind ',
    companyInfo: 'x',
    projectScope: '',
    notes: '',
    talkingPoints: '',
    persona: 'calm',
    summaryEmail: 'a@b.c',
  }
  it('accepts an imported persona up to the shared 20,000-character limit', () => {
    expect(requireJob({ ...full, persona: 'p'.repeat(20_000) }).persona).toHaveLength(20_000)
    expect(() => requireJob({ ...full, persona: 'p'.repeat(20_001) })).toThrow('Invalid persona')
  })
  it('keeps the editable fields and drops unknown keys', () => {
    expect(requireJob({ ...full, archived: true, createdAt: 'yesterday', evil: 1 })).toEqual({
      ...full,
      name: 'Northwind',
    })
  })
  it('refuses a payload missing a field, so stored context is never blanked', () => {
    const { notes: _notes, ...missing } = full
    expect(() => requireJob(missing)).toThrow('Invalid notes')
    expect(() => requireJob({ ...full, talkingPoints: 42 })).toThrow('Invalid talking points')
  })
  it('rejects a missing id or name', () => {
    expect(() => requireJob({ ...full, id: undefined })).toThrow('Invalid job id')
    expect(() => requireJob({ ...full, name: '' })).toThrow('Invalid job name')
    expect(() => requireJob('nope')).toThrow('Invalid job')
  })
})

describe('requireSettingsPatch', () => {
  it('keeps only known keys with the right type and range', () => {
    const patch = requireSettingsPatch({
      smtpPort: 587,
      overlayOpacity: 0.7,
      audioRetentionDays: 30,
      nudgeCooldownSec: 5,
      nudgeModel: ' custom-nudge-model ',
      answerModel: 'claude-opus-5-5',
      whisperMode: 'full',
      meetingSource: 'this-pc',
      recordAudio: false,
      smtpHost: 'smtp.example',
      overlayBounds: { x: 10, y: 20, width: 380, height: 460 },
      overlayWhisperRatio: 0.4,
      deepgramApiKey: 'dg_x',
      unknownKey: true,
    })
    expect(patch).toEqual({
      smtpPort: 587,
      overlayOpacity: 0.7,
      audioRetentionDays: 30,
      nudgeCooldownSec: 5,
      nudgeModel: 'custom-nudge-model',
      answerModel: 'claude-opus-5-5',
      whisperMode: 'full',
      meetingSource: 'this-pc',
      recordAudio: false,
      smtpHost: 'smtp.example',
      overlayBounds: { x: 10, y: 20, width: 380, height: 460 },
      overlayWhisperRatio: 0.4,
      deepgramApiKey: 'dg_x',
    })
  })
  it('ignores out-of-range or mistyped values instead of writing them', () => {
    expect(
      requireSettingsPatch({
        smtpPort: 70_000,
        overlayOpacity: 2,
        audioRetentionDays: -1,
        nudgeCooldownSec: 61,
        nudgeModel: '',
        answerModel: 'x'.repeat(201),
        whisperMode: 'verbose',
        meetingSource: 'the-moon',
        recordAudio: 'yes',
        overlayBounds: { x: 1, y: 2, width: 5, height: 5 },
        overlayWhisperRatio: 2,
      }),
    ).toEqual({})
    expect(requireSettingsPatch({ overlayBounds: null })).toEqual({ overlayBounds: null })
  })
  it('rejects empty model IDs', () => {
    expect(requireSettingsPatch({ nudgeModel: '', answerModel: '   ' })).toEqual({})
  })
  it('validates the classifier model and the coaching switch', () => {
    expect(
      requireSettingsPatch({ classifierModel: ' claude-haiku-5-5 ', coachWhileTalking: true }),
    ).toEqual({ classifierModel: 'claude-haiku-5-5', coachWhileTalking: true })
    expect(requireSettingsPatch({ classifierModel: '   ', coachWhileTalking: 'true' })).toEqual({})
    expect(requireSettingsPatch({ classifierModel: 'x'.repeat(201) })).toEqual({})
    expect(requireSettingsPatch({ classifierModel: 'x'.repeat(200) })).toEqual({
      classifierModel: 'x'.repeat(200),
    })
    expect(requireSettingsPatch({ coachWhileTalking: 1 })).toEqual({})
    expect(requireSettingsPatch({ coachWhileTalking: false })).toEqual({ coachWhileTalking: false })
  })
  it('accepts only known whisper modes', () => {
    expect(requireSettingsPatch({ whisperMode: 'smart' })).toEqual({ whisperMode: 'smart' })
    expect(requireSettingsPatch({ whisperMode: 'points' })).toEqual({ whisperMode: 'points' })
    expect(requireSettingsPatch({ whisperMode: 'anything' })).toEqual({})
  })
  it('rejects a non-object', () => {
    expect(() => requireSettingsPatch(null)).toThrow('Invalid settings')
  })
})

describe('requireMeetingStart', () => {
  it('accepts omitted, empty and limit-sized context with an optional interview choice', () => {
    expect(requireMeetingStart(undefined)).toEqual({})
    expect(requireMeetingStart({})).toEqual({})
    expect(requireMeetingStart({ meetingContext: '' })).toEqual({ meetingContext: '' })
    const max = 'x'.repeat(20000)
    expect(requireMeetingStart({ meetingContext: max, interview: false })).toEqual({
      meetingContext: max,
      interview: false,
    })
  })

  it('refuses oversized or non-text context without truncating', () => {
    expect(() => requireMeetingStart({ meetingContext: 'x'.repeat(20001) })).toThrow(
      'at most 20,000 characters',
    )
    for (const meetingContext of [42, null, ['a'], { text: 'a' }])
      expect(() => requireMeetingStart({ meetingContext })).toThrow()
  })

  it('refuses the retired deck option and the old positional boolean shape', () => {
    expect(() => requireMeetingStart({ usePresentationDeck: true })).toThrow(
      'Unsupported start option: usePresentationDeck',
    )
    expect(() => requireMeetingStart(true)).toThrow('Invalid start options')
    expect(() => requireMeetingStart([])).toThrow('Invalid start options')
    expect(() => requireMeetingStart({ interview: 'yes' })).toThrow('Invalid interview choice')
  })

  it('never lets the renderer choose practice', () => {
    expect(() => requireMeetingStart({ practice: true })).toThrow('Unsupported start option')
  })
})
