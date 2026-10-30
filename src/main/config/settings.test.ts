import { beforeEach, describe, expect, it, vi } from 'vitest'

const file = vi.hoisted(() => ({ contents: '{}' }))

vi.mock('electron', () => ({
  app: { getPath: () => 'C:/sanas-test' },
}))

vi.mock('fs', () => ({
  existsSync: () => true,
  readFileSync: () => file.contents,
  writeFileSync: vi.fn(),
}))

import { loadSettings } from './settings'

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
    expect(settings.presentationPrevHotkey).toBe('CommandOrControl+Alt+PageUp')
    expect(settings.presentationNextHotkey).toBe('CommandOrControl+Alt+PageDown')
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
