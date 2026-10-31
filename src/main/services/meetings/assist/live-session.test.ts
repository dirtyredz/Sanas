import { afterEach, expect, it, vi } from 'vitest'
import type { AssistRequest } from '../../assistant/types'
const f = vi.hoisted(() => ({
  requests: [] as AssistRequest[],
  saveGrounding: vi.fn(() => 1),
  deck: ['FIRST', 'LATER'].map((title) => ({
    title,
    talkingPoint: title,
    script: title + ' script',
    keyFacts: '',
  })),
}))
vi.mock('../../../config/settings', () => ({
  loadSettings: () => ({ anthropicApiKey: 'key', whisperMode: 'smart', coachWhileTalking: false }),
}))
vi.mock('../../../db/repos/jobs', () => ({ getJob: () => null, listGlossary: () => [] }))
vi.mock('../../../db/repos/meeting-presentation', () => ({
  getPresentationHistory: () => ({ slides: f.deck, events: [] }),
}))
vi.mock('../../../db/repos/meeting-context', () => ({
  getMeetingContext: () => ({
    meetingId: 1,
    revision: 0,
    deckVersion: 0,
    text: '',
    slides: f.deck,
    initialSlides: f.deck,
  }),
}))
vi.mock('../../../db/repos/suggestion-grounding', () => ({
  saveGrounding: f.saveGrounding,
  detailSource: vi.fn(),
  existingDetail: () => undefined,
}))
vi.mock('../../../db/repos/suggestions', () => ({ insertSuggestion: vi.fn() }))
vi.mock('../../../db/repos/speakers', () => ({ speakerNameMap: () => new Map() }))
vi.mock('../../../windows/broadcast', () => ({ broadcast: vi.fn() }))
vi.mock('../status/live-meeting', () => ({ liveMeetingId: () => 1, isLiveMeeting: () => true }))
vi.mock('../status/post-processing', () => ({
  markPostProcessing: vi.fn(),
  clearPostProcessing: vi.fn(),
}))
vi.mock('../../assistant/claude', () => ({
  claudeProvider: {
    complete: async (req: AssistRequest) => {
      f.requests.push(req)
      return 'answer'
    },
  },
}))
vi.mock('@shared/ipc', () => ({ IPC: { SuggestionEvent: 'suggestion' } }))
import { LiveSession } from './live-session'

afterEach(() => {
  f.requests.length = 0
  f.saveGrounding.mockClear()
})
it('allows pre-speech answers and keeps the full cached deck invariant across navigation, with independent summary evidence', async () => {
  let ordinal = 0
  const session = new LiveSession(
    () => 100,
    () => ({
      meetingId: 1,
      count: 2,
      ordinal,
      revision: ordinal + 1,
      current: f.deck[ordinal],
      next: ordinal ? null : f.deck[1],
    }),
  )
  session.begin(1)
  session.assistance.answerNow()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(f.requests[0].cacheableContext).toContain('LATER script')
  session.final(
    { speaker: 0, isUser: true, text: 'prior words', tStartMs: 0, tEndMs: 10 },
    { channel: 0, speaker: 0, role: 'user', text: 'prior words', tStartMs: 0, tEndMs: 10 },
  )
  ordinal = 1
  session.presentationChanged(100)
  session.assistance.answerNow()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(f.requests[1].system).toBe(f.requests[0].system)
  expect(f.requests[1].userContent).toContain('slide 2')
  expect(session.closing().window[0].text).toBe('prior words')
  expect(session.closing().prompt).not.toContain('LATER script')
  session.assistance.halt()
})

it('admits typed requests while paused, rejects busy/wrong-meeting and avoids audience calls without speech', async () => {
  const session = new LiveSession(
    () => 100,
    () => ({ meetingId: 1, revision: 0, count: 0, ordinal: 0, current: null, next: null }),
  )
  session.begin(1)
  session.assistance.halt()
  expect(session.request({ meetingId: 1, kind: 'audience' })).toMatchObject({
    accepted: false,
    reason: 'no-evidence',
  })
  expect(f.requests).toHaveLength(0)
  expect(() => session.request({ meetingId: 2, kind: 'typed', text: 'hello' })).toThrow(
    'no longer active',
  )
  expect(session.request({ meetingId: 1, kind: 'typed', text: 'hello' })).toEqual({
    accepted: true,
  })
  expect(session.request({ meetingId: 1, kind: 'typed', text: 'again' })).toMatchObject({
    accepted: false,
    reason: 'busy',
  })
  session.applyContext({
    meetingId: 1,
    revision: 1,
    deckVersion: 1,
    text: 'later correction',
    slides: [],
    initialSlides: f.deck,
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(f.requests[0].userContent).not.toContain('later correction')
  expect(f.requests[0].cacheableContext).toContain('LATER script')
  expect(session.request({ meetingId: 1, kind: 'typed', text: 'after edit' })).toEqual({
    accepted: true,
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(f.requests[1].userContent).toContain('later correction')
  expect(f.requests[1].cacheableContext).toBe('')
})

it('resolves grounding on context changes while snapshots only read the cached id', async () => {
  const session = new LiveSession(
    () => 100,
    () => ({ meetingId: 1, revision: 0, count: 0, ordinal: 0, current: null, next: null }),
  )
  session.begin(1)
  expect(f.saveGrounding).toHaveBeenCalledTimes(1)

  session.assistance.answerNow()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(f.saveGrounding).toHaveBeenCalledTimes(1)
  expect(session.request({ meetingId: 1, kind: 'audience' })).toMatchObject({
    accepted: false,
    reason: 'no-evidence',
  })
  expect(f.saveGrounding).toHaveBeenCalledTimes(1)

  session.applyContext({
    meetingId: 1,
    revision: 1,
    deckVersion: 1,
    text: 'new context',
    slides: [],
    initialSlides: f.deck,
  })
  expect(f.saveGrounding).toHaveBeenCalledTimes(2)
  expect(f.saveGrounding).toHaveBeenLastCalledWith(1, 1, expect.any(String), '')

  expect(session.request({ meetingId: 1, kind: 'typed', text: 'cached' })).toEqual({
    accepted: true,
  })
  expect(f.saveGrounding).toHaveBeenCalledTimes(2)
})
