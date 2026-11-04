import { beforeEach, describe, expect, it, vi } from 'vitest'

const file = vi.hoisted(() => ({ contents: '{}' }))

vi.mock('electron', () => ({
  app: { getPath: () => 'C:/sanas-test' },
}))

vi.mock('fs', () => ({
  existsSync: () => true,
  readFileSync: () => file.contents,
  writeFileSync: vi.fn((_path: string, contents: string) => {
    file.contents = contents
  }),
}))

import { saveSettings, loadSettings } from './settings'

describe('settings defaults', () => {
  beforeEach(() => {
    file.contents = JSON.stringify({ overlayHotkey: 'Control+Space' })
  })

  it('fills model defaults when an existing settings file has no model keys', () => {
    const settings = loadSettings()

    expect(settings.nudgeModel).toBe('claude-sonnet-5-5')
    expect(settings.answerModel).toBe('claude-opus-5-5')
    expect(settings.nudgeCooldownSec).toBe(5)
    expect(settings.whisperMode).toBe('smart')
    expect(settings.overlayWhisperRatio).toBe(0.27)
    expect(settings.overlayHotkey).toBe('Control+Space')
  })

  it('ignores retired presentation shortcuts and drops them on the next save', () => {
    file.contents = JSON.stringify({
      overlayHotkey: 'Control+Space',
      captureHotkey: 'Control+Alt+K',
      presentationPrevHotkey: 'Alt+PageUp',
      presentationNextHotkey: 'Alt+PageDown',
    })
    const loaded = loadSettings()
    expect(loaded).not.toHaveProperty('presentationPrevHotkey')
    expect(loaded).not.toHaveProperty('presentationNextHotkey')
    expect(loaded.captureHotkey).toBe('Control+Alt+K') // surviving custom values are kept
    saveSettings({ overlayOpacity: 0.8 })
    const written = JSON.parse(file.contents)
    expect(written).not.toHaveProperty('presentationPrevHotkey')
    expect(written).not.toHaveProperty('presentationNextHotkey')
    expect(written).toMatchObject({
      overlayHotkey: 'Control+Space',
      captureHotkey: 'Control+Alt+K',
    })
  })

  it('gives a legacy settings file the turn-detection and coaching defaults', () => {
    const settings = loadSettings()

    expect(settings.classifierModel).toBe('claude-haiku-5-5')
    expect(settings.coachWhileTalking).toBe(false)
    expect(settings.answerEveryQuestion).toBe(false)
    expect(settings.composeHotkey).toBe('Control+Shift+K')
  })

  it('keeps stored classifier and coaching values', () => {
    file.contents = JSON.stringify({
      classifierModel: 'custom-classifier',
      coachWhileTalking: true,
    })
    const settings = loadSettings()

    expect(settings.classifierModel).toBe('custom-classifier')
    expect(settings.coachWhileTalking).toBe(true)
  })
})

it('saves, loads and clears the local interview profile without losing headings', () => {
  const profile = 'About me\nEngineer\n\nGo-to stories\nExampleCo / Camunda / cut latency'
  expect(saveSettings({ interviewProfile: profile }).interviewProfile).toBe(profile)
  expect(loadSettings().interviewProfile).toBe(profile)
  saveSettings({ interviewProfile: '' })
  expect(loadSettings().interviewProfile).toBe('')
})
