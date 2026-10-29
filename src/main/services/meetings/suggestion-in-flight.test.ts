import { describe, expect, it } from 'vitest'
import {
  canStartSuggestion,
  emptySuggestionInFlight,
  suggestionTimeoutMs,
} from './suggestion-in-flight'

describe('suggestion in-flight lanes', () => {
  it('lets a hotkey answer start while an ambient nudge is running', () => {
    const inFlight = { ...emptySuggestionInFlight(), ambient: true }
    expect(canStartSuggestion(inFlight, 'hotkey')).toBe(true)
    expect(canStartSuggestion(inFlight, 'ambient')).toBe(false)
  })

  it('caps each lane at one request without blocking the other lane', () => {
    const inFlight = { ambient: true, hotkey: true }
    expect(canStartSuggestion(inFlight, 'ambient')).toBe(false)
    expect(canStartSuggestion(inFlight, 'hotkey')).toBe(false)
    expect(canStartSuggestion({ ambient: false, hotkey: true }, 'ambient')).toBe(true)
  })

  it('gives requested and full answers the longer deadline', () => {
    expect(suggestionTimeoutMs('ambient', false)).toBe(25_000)
    expect(suggestionTimeoutMs('ambient', true)).toBe(60_000)
    expect(suggestionTimeoutMs('hotkey', false)).toBe(60_000)
  })
})
