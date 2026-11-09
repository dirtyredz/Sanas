import { describe, expect, it } from 'vitest'
import { completionText } from './completion-result'

describe('completion result', () => {
  it('surfaces an exhausted empty answer instead of a blank whisper', () => {
    expect(() => completionText({ stopReason: 'max_tokens', text: '' })).toThrow(
      'Answer budget used up — raise the max token budget for this answer.',
    )
  })

  it('returns text even when it ends at the token limit', () => {
    expect(completionText({ stopReason: 'max_tokens', text: 'Partial but useful' })).toBe(
      'Partial but useful',
    )
  })
})
