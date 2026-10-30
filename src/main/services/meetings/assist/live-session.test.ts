import { afterEach, expect, it, vi } from 'vitest'
import type { AssistRequest } from '../../assistant/types'
const f = vi.hoisted(() => ({
  requests: [] as AssistRequest[],
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
  expect(f.requests[0].system).toContain('LATER script')
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
