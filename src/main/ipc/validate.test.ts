import { describe, expect, it } from 'vitest'
import {
  boundedText,
  optionalText,
  requireBool,
  requireId,
  requireJob,
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
      meetingSource: 'this-pc',
      recordAudio: false,
      smtpHost: 'smtp.example',
      overlayBounds: { x: 10, y: 20, width: 380, height: 460 },
      deepgramApiKey: 'dg_x',
      unknownKey: true,
    })
    expect(patch).toEqual({
      smtpPort: 587,
      overlayOpacity: 0.7,
      audioRetentionDays: 30,
      meetingSource: 'this-pc',
      recordAudio: false,
      smtpHost: 'smtp.example',
      overlayBounds: { x: 10, y: 20, width: 380, height: 460 },
      deepgramApiKey: 'dg_x',
    })
  })
  it('ignores out-of-range or mistyped values instead of writing them', () => {
    expect(
      requireSettingsPatch({
        smtpPort: 70_000,
        overlayOpacity: 2,
        audioRetentionDays: -1,
        meetingSource: 'the-moon',
        recordAudio: 'yes',
        overlayBounds: { x: 1, y: 2, width: 5, height: 5 },
      }),
    ).toEqual({})
    expect(requireSettingsPatch({ overlayBounds: null })).toEqual({ overlayBounds: null })
  })
  it('rejects a non-object', () => {
    expect(() => requireSettingsPatch(null)).toThrow('Invalid settings')
  })
})
