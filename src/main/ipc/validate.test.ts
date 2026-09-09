import { describe, expect, it } from 'vitest'
import { optionalText, requireId, requireJob, requireSettingsPatch, requireText } from './validate'

describe('requireId / requireText / optionalText', () => {
  it('accepts positive safe integers only', () => {
    expect(requireId(7, 'id')).toBe(7)
    for (const bad of [0, -1, 1.5, '7', null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => requireId(bad, 'id')).toThrow('Invalid id')
    }
  })
  it('trims and caps free text, rejecting empty', () => {
    expect(requireText('  hi ', 'title', 10)).toBe('hi')
    expect(() => requireText('   ', 'title', 10)).toThrow('Invalid title')
    expect(() => requireText('x'.repeat(11), 'title', 10)).toThrow('Invalid title')
    expect(() => requireText(42, 'title', 10)).toThrow('Invalid title')
  })
  it('turns anything but a string into empty and caps strings', () => {
    expect(optionalText(undefined, 5)).toBe('')
    expect(optionalText(5, 5)).toBe('')
    expect(optionalText('abcdefg', 5)).toBe('abcde')
  })
})

describe('requireJob', () => {
  it('keeps the editable fields, caps them, and drops unknown keys', () => {
    const job = requireJob({
      id: 3,
      name: ' Northwind ',
      companyInfo: 'x',
      persona: 'calm',
      summaryEmail: 'a@b.c',
      archived: true,
      createdAt: 'yesterday',
      evil: 'payload',
    })
    expect(job).toEqual({
      id: 3,
      name: 'Northwind',
      companyInfo: 'x',
      projectScope: '',
      notes: '',
      talkingPoints: '',
      persona: 'calm',
      summaryEmail: 'a@b.c',
    })
  })
  it('rejects a missing id or name', () => {
    expect(() => requireJob({ name: 'x' })).toThrow('Invalid job id')
    expect(() => requireJob({ id: 1, name: '' })).toThrow('Invalid job name')
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
