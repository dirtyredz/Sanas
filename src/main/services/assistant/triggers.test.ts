import { describe, expect, it } from 'vitest'
import { answerCooldownAllows, looksLikeResponseCandidate } from './triggers'

describe('completed-turn prefilter', () => {
  it.each([
    'Thoughts?',
    'Any thoughts',
    'thoughts on the rollout',
    'How do you make a linked list',
    'how do you make a linked list?',
    'Can you share your screen',
    'So, um, what would you change',
    'Okay so could we move this to Friday',
    'Walk me through the deploy',
    'Could you talk us through the numbers',
    'Tell me about the migration',
    'I’d love it if you could explain the retry logic',
    'Show us the dashboard',
    'Help me understand the pricing',
    "I'm curious how that scales",
    'I wonder whether that holds up',
    'I was wondering about the timeline',
    'We would like to know the cost',
    'What’s your take',
    'And what about the mobile app',
    'How about Tuesday',
    'I disagree with that estimate',
    'I’m not convinced it is ready',
    "That won't work for our team",
    'My concern is the latency',
    "I'm concerned about security",
    'But what if the queue backs up',
    'We shipped it last week. Did it help',
  ])('accepts %j', (text) => {
    expect(looksLikeResponseCandidate(text)).toBe(true)
  })

  it.each([
    '',
    '   ',
    'We shipped the release yesterday.',
    'Sounds good.',
    'Right, that makes sense to me.',
    'I think the plan is fine',
    'Let us move on to the next item',
  ])('rejects ordinary statement %j', (text) => {
    expect(looksLikeResponseCandidate(text)).toBe(false)
  })
})

describe('answer cooldown', () => {
  it('allows the first answer and anything after the cooldown', () => {
    expect(answerCooldownAllows(null, 0, 5)).toBe(true)
    expect(answerCooldownAllows(1_000, 5_999, 5)).toBe(false)
    expect(answerCooldownAllows(1_000, 6_000, 5)).toBe(true)
  })

  it('never blocks with a zero cooldown', () => {
    expect(answerCooldownAllows(1_000, 1_000, 0)).toBe(true)
  })
})
