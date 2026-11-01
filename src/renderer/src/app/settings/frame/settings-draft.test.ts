import { describe, expect, it } from 'vitest'
import type { SettingsView } from '@shared/types'
import { sampleSettings } from '../../../dev/mock-fixtures'
import {
  hasUnsavedChanges,
  NOT_PAGE_OWNED,
  NO_SECRETS,
  PAGE_OWNED,
  problemFor,
  settingsPatch,
  settingsProblems,
} from './settings-draft'

const saved: SettingsView = sampleSettings
const edit = (patch: Partial<SettingsView>): SettingsView => ({ ...saved, ...patch })

describe('settingsPatch', () => {
  // Regression: these three were editable in Settings but missing from the Save patch, so a
  // changed Capture screen / Ask composer hotkey or "Answer every question" never persisted.
  it('saves every setting the page lets you edit', () => {
    const patch = settingsPatch(
      edit({ captureHotkey: 'Alt+C', composeHotkey: 'Alt+K', answerEveryQuestion: true }),
      NO_SECRETS,
    )
    expect(patch).toMatchObject({
      captureHotkey: 'Alt+C',
      composeHotkey: 'Alt+K',
      answerEveryQuestion: true,
    })
  })

  it('trims free-text values and sends only the secrets that were typed', () => {
    const patch = settingsPatch(edit({ nudgeModel: '  claude-x  ', smtpHost: ' smtp.a.b ' }), {
      ...NO_SECRETS,
      anthropicApiKey: 'sk-ant-1',
    })
    expect(patch.nudgeModel).toBe('claude-x')
    expect(patch.smtpHost).toBe('smtp.a.b')
    expect(patch.anthropicApiKey).toBe('sk-ant-1')
    expect('deepgramApiKey' in patch).toBe(false)
    expect('smtpPass' in patch).toBe(false)
  })

  it('never sends what the page does not own (bounds, split, meeting source)', () => {
    const patch = settingsPatch(saved, NO_SECRETS)
    expect('overlayBounds' in patch).toBe(false)
    expect('overlayWhisperRatio' in patch).toBe(false)
    expect('meetingSource' in patch).toBe(false)
  })
})

describe('hasUnsavedChanges', () => {
  it('is clean when the draft matches what was saved', () => {
    expect(hasUnsavedChanges(saved, saved, NO_SECRETS)).toBe(false)
  })

  it('ignores whitespace that Save would trim anyway', () => {
    expect(hasUnsavedChanges(edit({ smtpUser: `${saved.smtpUser} ` }), saved, NO_SECRETS)).toBe(
      false,
    )
  })

  it('notices an edited setting or a typed secret', () => {
    expect(hasUnsavedChanges(edit({ recordAudio: !saved.recordAudio }), saved, NO_SECRETS)).toBe(
      true,
    )
    expect(hasUnsavedChanges(saved, saved, { ...NO_SECRETS, smtpPass: 'x' })).toBe(true)
  })
})

describe('settingsProblems', () => {
  it('has none for the stored settings', () => {
    expect(settingsProblems(saved)).toEqual([])
  })

  it('flags values the main process would drop', () => {
    const problems = settingsProblems(edit({ answerModel: '  ', nudgeCooldownSec: 61 }))
    expect(problemFor(problems, 'answerModel')).toMatch(/model ID/)
    expect(problemFor(problems, 'nudgeCooldownSec')).toMatch(/0 to 60/)
    expect(problems.every((p) => p.section === 'assistant')).toBe(true)
    expect(
      problemFor(settingsProblems(edit({ nudgeCooldownSec: Number.NaN })), 'nudgeCooldownSec'),
    ).toBeDefined()
  })
})

describe('page ownership', () => {
  // The types force the two lists to cover keyof Settings; this checks the runtime lists agree
  // with a real settings object and do not overlap.
  it('partitions every Settings key: owned by the page or not, never both, none missing', () => {
    const listed = [...PAGE_OWNED, ...NOT_PAGE_OWNED] as string[]
    expect(new Set(listed).size).toBe(listed.length)
    const secretsMasked = ['deepgramKeySet', 'anthropicKeySet', 'smtpPassSet']
    const viewKeys = Object.keys(saved).filter((k) => !secretsMasked.includes(k))
    const secretKeys = Object.keys(NO_SECRETS)
    expect([...viewKeys, ...secretKeys].sort()).toEqual([...listed].sort())
  })
})
