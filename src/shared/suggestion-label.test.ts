import { describe, expect, it } from 'vitest'
import { suggestionArrivalLabel, suggestionLabel, suggestionOrigin } from './suggestion-label'

describe('suggestion labels', () => {
  it('keeps historical answer labels', () => {
    expect(suggestionLabel({ trigger: 'hotkey', purpose: 'answer' })).toBe('Answer')
    expect(suggestionLabel({ trigger: 'ambient', purpose: 'answer' })).toBe('Whisper')
    expect(suggestionOrigin({ trigger: 'hotkey', purpose: 'answer' })).toBe('you asked')
    expect(suggestionOrigin({ trigger: 'ambient', purpose: 'answer' })).toBe('ambient')
  })

  it('names coaching "Next point" everywhere, whatever lane carried it', () => {
    const coach = { trigger: 'ambient', purpose: 'next-point' } as const
    expect(suggestionLabel(coach)).toBe('Next point')
    expect(suggestionOrigin(coach)).toBe('while you talked')
    expect(suggestionArrivalLabel(coach)).toBe('New next point')
  })

  it('names every manual kind, including screen answers', () => {
    const base = { trigger: 'hotkey', purpose: 'answer' } as const
    expect(suggestionLabel({ ...base, manualKind: 'typed' })).toBe('Typed answer')
    expect(suggestionLabel({ ...base, manualKind: 'capture' })).toBe('Screen answer')
    expect(suggestionLabel({ ...base, manualKind: 'detail' })).toBe('More detail')
  })

  it('keeps the existing arrival notice for answers', () => {
    expect(suggestionArrivalLabel({ trigger: 'ambient', purpose: 'answer' })).toBe('New answer')
    expect(suggestionArrivalLabel({ trigger: 'hotkey', purpose: 'answer' })).toBe('New answer')
  })
})
