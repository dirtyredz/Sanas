import { describe, expect, it } from 'vitest'
import {
  acknowledgeVisibility,
  effectiveProfile,
  subscribeRuns,
  type RunObservation,
} from './run-observation'

describe('acknowledgeVisibility', () => {
  function capture(): { seen: RunObservation[]; off: () => void } {
    const seen: RunObservation[] = []
    return { seen, off: subscribeRuns((e) => seen.push(e)) }
  }

  it('publishes the renderer state when the window is visible', () => {
    const { seen, off } = capture()
    acknowledgeVisibility({ meetingId: 3, runId: 9, state: 'frame-after-commit' }, true)
    off()
    expect(seen).toMatchObject([
      { kind: 'renderer', id: 9, meetingId: 3, state: 'frame-after-commit' },
    ])
  })

  it('a hidden or minimized window overrides the renderer claim', () => {
    const { seen, off } = capture()
    acknowledgeVisibility({ meetingId: 3, runId: 9, state: 'frame-after-commit' }, false)
    off()
    expect(seen).toMatchObject([{ kind: 'renderer', state: 'hidden' }])
  })
})

describe('effectiveProfile', () => {
  const base = { profile: 'smart' as const, maxTokens: 300, effort: 'low' as const }

  it('keeps Claude alias model names', () => {
    expect(effectiveProfile({ ...base, model: 'claude-sonnet-5-5' })).toEqual({
      ...base,
      model: 'claude-sonnet-5-5',
    })
  })

  it('redacts any other model name and defaults the profile', () => {
    expect(effectiveProfile({ ...base, profile: undefined, model: 'acme-private-ft-2' })).toEqual({
      ...base,
      profile: 'other',
      model: 'custom',
    })
  })
})
