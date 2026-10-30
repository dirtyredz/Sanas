import { describe, expect, it } from 'vitest'
import {
  answerRequest,
  coachRequest,
  type AssistSettings,
  type AssistSnapshot,
} from './suggestion-requests'
import { deckContext } from '../../assistant/presentation/prompts'
const settings: AssistSettings = {
  anthropicApiKey: 'key',
  anthropicWorkspaceId: '',
  nudgeModel: 'nudge',
  answerModel: 'answer',
  classifierModel: 'classifier',
  whisperMode: 'smart',
  nudgeCooldownSec: 5,
  coachWhileTalking: true,
}
const deck = ['FIRST', 'SECOND', 'THIRD_SENTINEL'].map((title) => ({
  title,
  talkingPoint: title,
  script: `${title} script`,
  keyFacts: `${title} facts`,
}))
const snapshot = (): AssistSnapshot => ({
  meetingId: 1,
  atMs: 100,
  system: 'job notes glossary' + deckContext(deck),
  coachSystem: 'job notes glossary',
  window: [{ speaker: 0, isUser: true, text: 'THIRD_SENTINEL previously discussed' }],
  recent: ['THIRD_SENTINEL previous answer'],
  coachRecent: [],
  coachEvidence: { text: 'Me: FIRST speech', incomplete: false },
  presentation: {
    meetingId: 1,
    revision: 3,
    count: 3,
    ordinal: 0,
    current: { ...deck[0] },
    next: { title: deck[1].title, talkingPoint: deck[1].talkingPoint },
  },
})
describe('presentation request lanes', () => {
  it('answers from the full deck in both lanes, with only a current-title hint and no revision cancellation', () => {
    for (const lane of ['ambient', 'hotkey'] as const) {
      const req = answerRequest(snapshot(), settings, lane)
      expect(req.system).toContain('THIRD_SENTINEL')
      expect(req.userContent).toContain('Where the talk is now: slide 1')
      expect(req.presentationRevision).toBeUndefined()
      expect(req.userContent).not.toContain('deferral')
    }
  })
  it('captures immutable coach content and excludes later slides, prior speech and answer headlines after Previous', () => {
    const snap = snapshot()
    const req = coachRequest(
      snap,
      settings,
      { excerpt: 'THIRD_SENTINEL', reason: 'long' },
      () => true,
    )
    snap.presentation!.current!.script = 'mutated'
    expect(req.system + req.userContent).not.toContain('THIRD_SENTINEL')
    expect(req.userContent).toContain('FIRST script')
    expect(req.userContent).not.toContain('SECOND script')
    expect(req.userContent).not.toContain('SECOND facts')
    expect(req.presentationRevision).toBe(3)
    expect(req.userContent).not.toContain('mutated')
  })
})
