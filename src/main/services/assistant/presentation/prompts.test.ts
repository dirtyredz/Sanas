import { describe, expect, it } from 'vitest'
import { presentationCoachContent } from './prompts'

describe('presentation coaching boundary', () => {
  it('tells the coach to decline unrelated recruiter talk', () => {
    const text = presentationCoachContent(
      {
        meetingId: 1,
        revision: 0,
        ordinal: 0,
        count: 1,
        current: {
          title: 'Sandbox deployment',
          talkingPoint: 'Branches',
          script: '',
          keyFacts: '',
        },
        next: null,
      },
      'Me: We ran about five GraphQL subgraphs at my previous employer.',
      false,
    )
    expect(text).toContain(
      'If the conversation is off-topic or unrelated to this deck, output exactly <none>',
    )
    expect(text).toContain('unrelated speech is not evidence of a skipped slide')
  })
  it('uses complete current content and restricted lookahead, never later slides', () => {
    const current = {
      title: 'One',
      talkingPoint: 'FIRST',
      script: 'complete\nscript',
      keyFacts: 'fact',
    }
    const text = presentationCoachContent(
      {
        meetingId: 1,
        revision: 1,
        ordinal: 0,
        count: 3,
        current,
        next: { title: 'Two', talkingPoint: 'SECOND' },
      },
      'Me: FIRST',
      false,
    )
    expect(text).toContain('complete\\nscript')
    expect(text).toContain('SECOND')
    expect(text).not.toContain('THIRD_SENTINEL')
    expect(text).toContain('<none>')
    expect(text).toContain('not spoken yet is not skipped')
  })
})
