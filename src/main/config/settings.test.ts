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
    expect(settings.overlayHotkey).toBe('Control+Space')
  })
})
