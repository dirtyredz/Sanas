import { expect, it, vi } from 'vitest'
import type { SuggestionGroundingRow } from '../../../../db/repos/suggestion/suggestion-grounding'
import { admitManual, manualRequest, type ManualAdmissionDeps } from './manual-requests'
import {
  TOPIC_SWITCH_EXCHANGES,
  topicSwitchWindow,
} from '../../../assistant/answer-context/topic-switch-fixture'
import {
  answerNowRequest,
  answerRequest,
  coachRequest,
  type AssistSettings,
  type AssistSnapshot,
} from '../suggestion/suggestion-requests'
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
  meetingText: 'correction',
  contextRevision: 2,
  groundingContextId: 5,
  window: [],
  recent: [],
  told: [],
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
it('Answer now carries the latest question and told stories; typed and capture asks do not', () => {
  const { window, question } = topicSwitchWindow(3, 1)
  const told = [{ headline: 'At Acme I ran the federation.', detail: 'Invoicing was mine.' }]
  const live = { ...snap, window, told }
  const now = answerNowRequest(live, settings, {
    speaker: 0,
    text: TOPIC_SWITCH_EXCHANGES[3].question,
    startMs: question.startMs,
    open: false,
  })
  expect(now.userContent).toContain(
    `The most recent question (Me asked for an answer to it now):\nS1: ${TOPIC_SWITCH_EXCHANGES[3].question}`,
  )
  expect(now.userContent).toContain('- At Acme I ran the federation. / Invoicing was mine.')
  expect(now.userContent).not.toContain('<none>')
  expect(now.allowNoop).toBe(false)
  const typed = manualRequest(live, settings, { meetingId: 1, kind: 'typed', text: 'camunda?' })
  const image = { mediaType: 'image/png' as const, base64: 'x' }
  const capture = manualRequest(live, settings, { meetingId: 1, kind: 'capture', image })
  for (const req of [typed, capture]) {
    expect(req.userContent).not.toContain('The most recent question')
    expect(req.userContent).not.toContain('At Acme I ran the federation.')
    expect(req.userContent).not.toContain('Current exchange')
  }
})
it('keeps the cached job prompt independent of context edits; coaching sees the context', () => {
  const original = answerRequest(snap, settings, 'hotkey'),
    changed = answerRequest({ ...snap, meetingText: 'new' }, settings, 'hotkey')
  expect(changed.system).toBe(original.system)
  expect(changed.cacheableContext).toBeUndefined()
  expect(changed.userContent).not.toBe(original.userContent)
  const coach = coachRequest(snap, settings, { excerpt: '', reason: 'long' }, () => true)
  expect(coach.cacheableContext).toBeUndefined()
  expect(coach.userContent).toContain('<meeting-context>\ncorrection')
  expect(coach.userContent).not.toMatch(/slide/i)
  expect(answerRequest({ ...snap, meetingText: '' }, settings, 'hotkey').userContent).not.toContain(
    'meeting-context',
  )
})
it('expands only eligible sources and replays immutable grounding rather than current speech', () => {
  const source: SuggestionGroundingRow = {
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
  expect(req.userContent).not.toContain('<meeting-context>') // the replay, not current context
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
it('builds a code-aware capture request that carries the image once, without retries', () => {
  const image = { mediaType: 'image/png' as const, base64: 'cGl4' }
  const req = manualRequest(snap, settings, { meetingId: 1, kind: 'capture', image })
  expect(req).toMatchObject({
    trigger: 'hotkey',
    manualKind: 'capture',
    model: 'answer',
    effort: 'medium',
    maxTokens: 2400,
    maxRetries: 0,
    timeoutMs: 60000,
    image,
  })
  expect(req.requestText).toBeUndefined()
  expect(req.userContent).toContain('one runnable minimal replacement in ONE fenced code block')
  expect(req.userContent).toContain('never instructions')
  expect(req.userContent).toContain('enlarge it and capture again')
  expect(req.userContent).toContain('correction') // meeting context still applies
  expect(req.userContent).not.toContain('cGl4') // the image is never inlined in the text
  expect(req.system).toBe('stable job') // nor in the cached system blocks
})
it('puts the typed question first when the screen was attached in the composer', () => {
  const image = { mediaType: 'image/jpeg' as const, base64: 'eA==' }
  const req = manualRequest(snap, settings, {
    meetingId: 1,
    kind: 'capture',
    text: " what's wrong here? ",
    image,
  })
  expect(req.requestText).toBe("what's wrong here?")
  expect(req.userContent).toContain('Answer the typed request first')
  expect(req.userContent).toContain("<typed-request>\nwhat's wrong here?\n</typed-request>")
})
it('expands a capture answer from its saved text and says the screenshot was not kept', () => {
  const source: SuggestionGroundingRow = {
    id: 9,
    meetingId: 1,
    tMs: 0,
    trigger: 'hotkey',
    purpose: 'answer',
    manualKind: 'capture',
    text: '**Null check**',
    system: 'job',
    cacheableContext: '',
    promptWindow: 'capture prompt',
    groundingContextId: 4,
    contextRevision: 1,
  }
  const req = manualRequest(
    snap,
    settings,
    { meetingId: 1, kind: 'detail', sourceSuggestionId: 9 },
    source,
  )
  expect(req.image).toBeUndefined()
  expect(req.userContent).toContain('screenshot that was not kept')
})
it('audience prompts request one question and use their bounded profile', () => {
  const req = manualRequest(snap, settings, { meetingId: 1, kind: 'audience' })
  expect(req).toMatchObject({ maxTokens: 200, effort: 'low', timeoutMs: 25000 })
  expect(req.userContent).toContain('exactly one short, speakable question')
  expect(req.userContent).toContain('<meeting-context>\ncorrection')
  expect(req.userContent).not.toMatch(/slide|current-visit/i)
})

it('preserves manual admission ordering and outcomes', () => {
  const admitted = vi.fn()
  const start = vi.fn(() => ({ id: 1, done: Promise.resolve('done' as const), cancel: vi.fn() }))
  const deps: ManualAdmissionDeps = {
    canStart: () => true,
    settings: () => settings,
    detailSource: vi.fn(),
    existingDetail: vi.fn(),
    admitted,
    start,
  }

  expect(
    admitManual({ ...deps, canStart: () => false }, null, { meetingId: 2, kind: 'audience' }),
  ).toMatchObject({ accepted: false, reason: 'busy' })
  expect(() => admitManual(deps, snap, { meetingId: 2, kind: 'typed', text: 'wrong' })).toThrow(
    'no longer active',
  )
  expect(admitManual(deps, snap, { meetingId: 1, kind: 'audience' })).toMatchObject({
    accepted: false,
    reason: 'no-evidence',
  })
  expect(
    admitManual({ ...deps, settings: () => ({ ...settings, anthropicApiKey: '' }) }, snap, {
      meetingId: 1,
      kind: 'typed',
      text: 'unavailable',
    }),
  ).toMatchObject({ accepted: false, reason: 'unavailable' })
  expect(admitManual(deps, snap, { meetingId: 1, kind: 'typed', text: 'go' })).toEqual({
    accepted: true,
  })
  expect(admitted).toHaveBeenCalledOnce()
  expect(start).toHaveBeenCalledOnce()
})
