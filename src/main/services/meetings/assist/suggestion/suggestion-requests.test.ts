import { describe, expect, it } from 'vitest'
import {
  answerRequest,
  automaticAnswerRequest,
  coachRequest,
  promptMismatchCategories,
  type AssistSettings,
  type AssistSnapshot,
} from './suggestion-requests'
import type { CompletedTurn } from '../../../turns/types'
import type { AssistImage } from '../../../assistant/types'
import type { SuggestionRequest } from './suggestion-runner'
import { topicSwitchWindow } from '../../../assistant/answer-context/topic-switch-fixture'
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
const snapshot = (): AssistSnapshot => ({
  meetingId: 1,
  atMs: 100,
  system: 'job notes glossary',
  window: [{ speaker: 0, isUser: true, text: 'We covered the rollout plan' }],
  recent: ['Earlier answer'],
  told: [],
  meetingText: 'Attendees: Dana (CFO). Goal: agree pilot scope.',
  contextRevision: 2,
  groundingContextId: 7,
})
describe('meeting context in requests', () => {
  it('answers in both lanes with the meeting context and its revision, and no slide material', () => {
    for (const lane of ['ambient', 'hotkey'] as const) {
      const req = answerRequest(snapshot(), settings, lane)
      expect(req.userContent).toContain('<meeting-context>')
      expect(req.userContent).toContain('Goal: agree pilot scope.')
      expect(req.contextRevision).toBe(2)
      expect(req.cacheableContext).toBeUndefined()
      expect(req.system + req.userContent).not.toMatch(/slide|presentation|deck/i)
    }
  })
  it('gives the ordinary coach the meeting context and captures it immutably', () => {
    const snap = snapshot()
    const req = coachRequest(snap, settings, { excerpt: 'rollout', reason: 'long' }, () => true)
    snap.meetingText = 'mutated'
    expect(req.userContent).toContain('Goal: agree pilot scope.')
    expect(req.userContent).not.toContain('mutated')
    expect(req.system).toBe('job notes glossary')
    expect(req.contextRevision).toBe(2)
    expect(req.system + req.userContent).not.toMatch(/slide|presentation|deck/i)
  })
  it('omits the context block entirely when the meeting has none', () => {
    const req = answerRequest({ ...snapshot(), meetingText: '' }, settings, 'hotkey')
    expect(req.userContent).not.toContain('<meeting-context>')
  })
})

it.each(['points', 'smart', 'full'] as const)(
  'uses proportionate initial depth in both lanes in %s mode',
  (whisperMode) => {
    for (const lane of ['ambient', 'hotkey'] as const) {
      for (const text of [
        'They want three to four subgraphs. I had about five.',
        'Can you implement a linked list in JavaScript?',
        'Did you use the unclear technology?',
      ]) {
        const snap = snapshot()
        snap.window = [{ speaker: 1, isUser: false, text }]
        const request = answerRequest(snap, { ...settings, whisperMode }, lane)
        expect(request.userContent).toContain('15-40 words')
        expect(request.userContent).toContain('Technical nouns alone')
        expect(request.userContent).toContain('only when implementation/code is requested')
        expect(request.userContent).not.toContain('artifact is useful')
        expect(request.userContent).not.toContain('artifact when useful')
      }
    }
  },
)

describe('prompt matching', () => {
  const promptsMatch = (a: SuggestionRequest, b: SuggestionRequest): boolean =>
    promptMismatchCategories(a, b).length === 0
  const turn = { text: 'Why?', speaker: 1 } as unknown as CompletedTurn
  const base = (): SuggestionRequest => automaticAnswerRequest(snapshot(), settings, turn, [turn])

  it('ignores only audio time and the accept closure', () => {
    expect(promptsMatch(base(), { ...base(), atMs: 999, accept: () => true })).toBe(true)
  })
  it('differs on any prompt field, including contextRevision and delivery', () => {
    for (const change of [
      { userContent: 'other' },
      { model: 'other' },
      { groundingContextId: 9 },
      { contextRevision: 4 },
      { delivery: 'buffered' as const },
    ])
      expect(promptsMatch(base(), { ...base(), ...change })).toBe(false)
  })
  it('matches a rebuilt request with the same told stories and split window, and only then', () => {
    const { window, question } = topicSwitchWindow(2)
    const asked = {
      text: 'Other than Lambda?',
      speaker: 0,
      startMs: question.startMs,
    } as CompletedTurn
    const live = (told: AssistSnapshot['told']): SuggestionRequest =>
      automaticAnswerRequest(
        { ...snapshot(), window: [...window], told: [...told] },
        settings,
        asked,
        [asked],
      )
    const story = { headline: 'At Acme I ran the federation.', detail: 'Invoicing was mine.' }
    expect(live([story]).userContent).toContain('Current exchange')
    expect(promptsMatch(live([story]), live([story]))).toBe(true)
    expect(promptsMatch(live([story]), live([story, { headline: 'New', detail: '' }]))).toBe(false)
  })
  it('is one prompt for every accepted verdict except a reference answer', () => {
    // built before the classifier speaks and rebuilt after: the verdict is not in it
    expect(promptsMatch(base(), base())).toBe(true)
    expect(base().userContent).not.toMatch(/\(a (?:question|request|objection)\)|put to Me\./)
    const reference = automaticAnswerRequest(snapshot(), settings, turn, [turn], 'reference')
    expect(reference.userContent).toContain('put to another participant')
    expect(promptsMatch(base(), reference)).toBe(false)
  })
  it('compares a field it has never heard of by default', () => {
    const future = { ...base(), someFutureField: 'x' } as unknown as SuggestionRequest
    expect(promptsMatch(base(), future)).toBe(false)
    expect(promptMismatchCategories(base(), future)).toEqual(['other'])
    expect(promptsMatch(future, { ...future })).toBe(true)
  })
  it('reports bounded names for actual prompt changes without exposing values', () => {
    const a = base()
    const b = {
      ...a,
      model: 'private-model',
      userContent: 'private conversation',
      maxTokens: 999,
      system: 'secret grounding',
    }
    expect(promptMismatchCategories(a, b)).toEqual([
      'grounding-context',
      'model-profile',
      'user-content',
    ])
    expect(promptsMatch(a, b)).toBe(false)
    const snap = snapshot()
    const first = automaticAnswerRequest(snap, settings, turn, [turn])
    snap.told = [{ headline: 'An answer just completed', detail: 'New factual content' }]
    expect(
      promptMismatchCategories(first, automaticAnswerRequest(snap, settings, turn, [turn])),
    ).toEqual(['user-content'])
  })
  it('never matches a request holding a screenshot, and compares turn spans by identity', () => {
    const image = { mediaType: 'image/png', base64: 'x' } as unknown as AssistImage
    expect(promptsMatch({ ...base(), image }, { ...base(), image })).toBe(false)
    const span = { startMs: 1, endMs: 2, completedAt: 3 }
    expect(
      promptsMatch(
        { ...base(), diagnosticTurns: [span] },
        { ...base(), diagnosticTurns: [{ ...span }] },
      ),
    ).toBe(false)
  })
})
