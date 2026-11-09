vi.mock('../../../db/repos/job/memory/approved', () => ({
  getApprovedMemory: () => ({ text: '' }),
  ordinaryJob: () => false,
}))
vi.mock('../../../db/repos/meeting/meetings', () => ({ getMeeting: () => ({ practice: true }) }))
import { afterEach, expect, it, vi } from 'vitest'
import type { AssistRequest } from '../../assistant/types'
const f = vi.hoisted(() => ({
  requests: [] as AssistRequest[],
  answers: [] as string[],
  saveMeetingGrounding: vi.fn(() => 1),
  initialContext: '',
}))
vi.mock('../../../config/settings', () => ({
  loadSettings: () => ({ anthropicApiKey: 'key', whisperMode: 'smart', coachWhileTalking: false }),
}))
vi.mock('../../../db/repos/meeting/meeting-grounding', () => ({
  getMeetingGrounding: () => ({ resume: null, interviewProfile: '', hasBiography: false }),
}))
vi.mock('../../../db/repos/jobs', () => ({ getJob: () => null }))
vi.mock('../../../db/repos/job/glossary', () => ({ listGlossary: () => [] }))
vi.mock('../../../db/repos/meeting/meeting-context', () => ({
  getMeetingContext: () => ({ meetingId: 1, revision: 0, text: f.initialContext }),
}))
vi.mock('../../../db/repos/suggestion-grounding', () => ({
  saveMeetingGrounding: f.saveMeetingGrounding,
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
vi.mock('../../assistant/provider/claude', () => ({
  claudeProvider: {
    complete: async (req: AssistRequest) => {
      f.requests.push(req)
      return f.answers.shift() ?? 'answer'
    },
  },
}))
vi.mock('@shared/ipc', () => ({ IPC: { SuggestionEvent: 'suggestion' } }))
import { LiveSession } from './live-session'

afterEach(() => {
  f.requests.length = 0
  f.answers.length = 0
  f.saveMeetingGrounding.mockClear()
  f.initialContext = ''
})
it('remembers told stories across Answer now and typed lanes and shows them to the next answer', async () => {
  const session = new LiveSession(() => 100)
  session.begin(1)
  session.final(
    { speaker: 1, isUser: false, text: 'Walk me through the graph.', tStartMs: 0, tEndMs: 900 },
    {
      channel: 0,
      speaker: 1,
      role: 'other',
      text: 'Walk me through the graph.',
      tStartMs: 0,
      tEndMs: 900,
    },
  )
  f.answers.push('**At Acme I ran the federation.**\nThe invoicing subgraph was mine.')
  f.answers.push('**At Initech I built the intake service.**\nIt wrote to MongoDB.')
  session.assistance.answerNow()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(session.request({ meetingId: 1, kind: 'typed', text: 'node?' })).toEqual({
    accepted: true,
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  session.assistance.answerNow()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(f.requests).toHaveLength(3)
  expect(f.requests[2].userContent).toContain(
    '- At Acme I ran the federation. / The invoicing subgraph was mine.\n- At Initech I built the intake service. / It wrote to MongoDB.',
  )
  session.assistance.halt()
})
it('answers and coaches from the context saved at Start, with one frozen system prompt', async () => {
  f.initialContext = 'Attendees: Dana (CFO). Goal: agree pilot scope.'
  const session = new LiveSession(() => 100)
  session.begin(1)
  session.assistance.answerNow()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(f.requests).toHaveLength(0) // nothing to answer before anyone speaks
  session.final(
    { speaker: 1, isUser: false, text: 'What is the scope?', tStartMs: 0, tEndMs: 10 },
    { channel: 0, speaker: 1, role: 'other', text: 'What is the scope?', tStartMs: 0, tEndMs: 10 },
  )
  session.assistance.answerNow()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(f.requests[0].userContent).toContain('<meeting-context>\nAttendees: Dana (CFO).')
  expect(f.requests[0].cacheableContext).toBeUndefined()
  expect(f.requests[0].system + f.requests[0].userContent).not.toMatch(/slide|deck/i)
  expect(session.closing().prompt).toBe(f.requests[0].system)
  session.assistance.halt()
})

it('admits typed requests while paused, rejects busy/wrong-meeting and avoids audience calls without speech', async () => {
  const session = new LiveSession(() => 100)
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
  session.applyContext({ meetingId: 1, revision: 1, text: 'later correction' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(f.requests[0].userContent).not.toContain('later correction')
  expect(session.request({ meetingId: 1, kind: 'typed', text: 'after edit' })).toEqual({
    accepted: true,
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(f.requests[1].userContent).toContain('later correction')
})

it('saves grounding once at Start; context changes and snapshots only read the cached id', async () => {
  const session = new LiveSession(() => 100)
  session.begin(1)
  expect(f.saveMeetingGrounding).toHaveBeenCalledTimes(1)

  session.assistance.answerNow()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(f.saveMeetingGrounding).toHaveBeenCalledTimes(1)
  expect(session.request({ meetingId: 1, kind: 'audience' })).toMatchObject({
    accepted: false,
    reason: 'no-evidence',
  })
  expect(f.saveMeetingGrounding).toHaveBeenCalledTimes(1)

  expect(f.saveMeetingGrounding).toHaveBeenLastCalledWith(1, expect.any(String))
  session.applyContext({ meetingId: 1, revision: 1, text: 'new context' })
  expect(f.saveMeetingGrounding).toHaveBeenCalledTimes(1)

  expect(session.request({ meetingId: 1, kind: 'typed', text: 'cached' })).toEqual({
    accepted: true,
  })
  expect(f.saveMeetingGrounding).toHaveBeenCalledTimes(1)
})
