import { expect, it } from 'vitest'
import { manualRequest, type DetailSource } from './manual-requests'
import {
  answerRequest,
  coachRequest,
  type AssistSettings,
  type AssistSnapshot,
} from './suggestion-requests'
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
const snap: AssistSnapshot = {
  meetingId: 1,
  atMs: 0,
  system: 'stable job',
  cacheableContext: 'complete deck',
  meetingText: 'correction',
  contextRevision: 2,
  groundingContextId: 5,
  window: [],
  recent: [],
}
it('supports typed requests without speech with the full answer profile', () => {
  const req = manualRequest(snap, settings, { meetingId: 1, kind: 'typed', text: 'Explain this' })
  expect(req).toMatchObject({
    trigger: 'hotkey',
    purpose: 'answer',
    model: 'answer',
    maxTokens: 1200,
    effort: 'medium',
    timeoutMs: 60000,
    requestText: 'Explain this',
    contextRevision: 2,
    groundingContextId: 5,
  })
  expect(req.userContent).toContain('<typed-request>\nExplain this')
  expect(req.userContent).toContain('correction')
})
it('keeps job/deck cache blocks independent of text edits and excludes the deck from coaching', () => {
  const original = answerRequest(snap, settings, 'hotkey'),
    changed = answerRequest({ ...snap, meetingText: 'new' }, settings, 'hotkey')
  expect(changed.system).toBe(original.system)
  expect(changed.cacheableContext).toBe(original.cacheableContext)
  expect(changed.userContent).not.toBe(original.userContent)
  const coach = coachRequest(snap, settings, { excerpt: '', reason: 'long' }, () => true)
  expect(coach.cacheableContext).toBeUndefined()
  expect(coach.userContent).toContain('current slide only')
  expect(answerRequest({ ...snap, meetingText: '' }, settings, 'hotkey').userContent).not.toContain(
    'meeting-context',
  )
})
it('expands only eligible sources and replays immutable grounding rather than current speech', () => {
  const source: DetailSource = {
    id: 9,
    meetingId: 1,
    tMs: 0,
    trigger: 'ambient',
    purpose: 'answer',
    text: 'old answer',
    system: 'old job',
    cacheableContext: 'old deck',
    promptWindow: 'old transcript and correction',
    groundingContextId: 4,
    contextRevision: 1,
  }
  const req = manualRequest(
    snap,
    settings,
    { meetingId: 1, kind: 'detail', sourceSuggestionId: 9 },
    source,
  )
  expect(req).toMatchObject({
    system: 'old job',
    cacheableContext: 'old deck',
    contextRevision: 1,
    sourceSuggestionId: 9,
    maxTokens: 2400,
    timeoutMs: 60000,
  })
  expect(req.userContent).toContain('old transcript and correction')
  expect(req.userContent).not.toContain('complete deck')
  for (const patch of [
    { meetingId: 2 },
    { purpose: 'next-point' as const },
    { manualKind: 'detail' as const },
    { manualKind: 'audience' as const },
    { groundingContextId: null },
  ])
    expect(() =>
      manualRequest(
        snap,
        settings,
        { meetingId: 1, kind: 'detail', sourceSuggestionId: 9 },
        { ...source, ...patch },
      ),
    ).toThrow()
})
it('audience prompts request one question and use their bounded profile', () => {
  const req = manualRequest(snap, settings, { meetingId: 1, kind: 'audience' })
  expect(req).toMatchObject({ maxTokens: 200, effort: 'low', timeoutMs: 25000 })
  expect(req.userContent).toContain('exactly one short, speakable question')
})
