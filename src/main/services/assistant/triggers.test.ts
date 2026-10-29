import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const settings = vi.hoisted(() => ({ nudgeCooldownSec: 5 }))

vi.mock('../../config/settings', () => ({
  loadSettings: () => settings,
}))

import { resetTriggers, shouldTrigger } from './triggers'

const question = { isUser: false, text: 'What should we discuss next?' }

describe('ambient trigger cooldown', () => {
  beforeEach(() => {
    resetTriggers()
    settings.nudgeCooldownSec = 5
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
  })

  afterEach(() => vi.useRealTimers())

  it('reads the current cooldown setting each time a question can fire', () => {
    expect(shouldTrigger(question)).toBe(true)

    vi.setSystemTime(104_000)
    expect(shouldTrigger(question)).toBe(false)

    settings.nudgeCooldownSec = 3
    expect(shouldTrigger(question)).toBe(true)
  })
})
