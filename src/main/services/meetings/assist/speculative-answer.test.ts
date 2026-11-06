import { describe, expect, it } from 'vitest'
import type { DiscardReason } from './diagnostics'
import { discardCategory } from './speculative-answer'

describe('discardCategory', () => {
  it.each<[DiscardReason, string]>([
    ['prompt-changed', 'prompt-changed'],
    ['verdict none', 'rejected'],
    ['verdict question other', 'rejected'],
    ['verdict timeout', 'classifier-failed'],
    ['verdict cancelled', 'classifier-failed'],
    ['verdict malformed', 'classifier-failed'],
    ['verdict provider', 'classifier-failed'],
    ['new-final', 'overtaken'],
    ['user-final', 'overtaken'],
    ['stop-or-pause', 'invalidated'],
    ['identity-change', 'invalidated'],
    ['ended-before-verdict', 'ended-before-verdict'],
    ['not-generated', 'not-generated'],
    ['no-snapshot', 'no-snapshot'],
  ])('discard reason %j is category %j', (reason, category) => {
    expect(discardCategory(reason)).toBe(category)
  })
})
