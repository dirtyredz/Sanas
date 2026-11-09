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
  coaching: false,
  notes: '',
}))
vi.mock('../../../config/settings', () => ({
  loadSettings: () => ({
    anthropicApiKey: 'key',
    whisperMode: 'smart',
    coachWhileTalking: f.coaching,
  }),
}))
vi.mock('../../../db/repos/meeting/meeting-grounding', () => ({
  getMeetingGrounding: () => ({ resume: null, interviewProfile: '', hasBiography: false }),
}))
vi.mock('../../../db/repos/job/jobs', () => ({
  getJob: () => ({
    name: 'Example',
    notes: f.notes,
    talkingPoints: '',
    persona: '',
    companyInfo: '',
    projectScope: '',
  }),
}))
vi.mock('../../../db/repos/job/glossary', () => ({ listGlossary: () => [] }))
vi.mock('../../../db/repos/meeting/meeting-context', () => ({
  getMeetingContext: () => ({ meetingId: 1, revision: 0, text: f.initialContext }),
}))
vi.mock('../../../db/repos/suggestion/suggestion-grounding', () => ({
  saveMeetingGrounding: f.saveMeetingGrounding,
  detailSource: vi.fn(),
  existingDetail: () => undefined,
}))
vi.mock('../../../db/repos/suggestion/suggestions', () => ({ insertSuggestion: vi.fn() }))
vi.mock('../../../db/repos/transcript/speakers', () => ({ speakerNameMap: () => new Map() }))
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
  f.coaching = false
  f.notes = ''
  vi.useRealTimers()
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
  session.final(
    { speaker: 1, isUser: false, text: 'What else did you build?', tStartMs: 1000, tEndMs: 2000 },
    {
      channel: 0,
      speaker: 1,
      role: 'other',
      text: 'What else did you build?',
      tStartMs: 1000,
      tEndMs: 2000,
    },
  )
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

it('keeps early user evidence through rolling-window eviction, coaching-off, resume, reconnect and Apply; retracts corrections', async () => {
  vi.useFakeTimers()
  f.notes = 'Database migration rollback'
  const session = new LiveSession(() => 0)
  session.begin(1)
  const feed = (text: string, speaker: number, start: number, end: number): void =>
    session.final(
      { speaker, isUser: true, text, tStartMs: start, tEndMs: end },
      { channel: 0, speaker, role: 'user', text, tStartMs: start, tEndMs: end },
    )
  feed('Database migration rollback worked.', 1, 0, 1000)
  for (let i = 0; i < 250; i++)
    feed(
      'Unrelated lengthy discussion on a different project and its daily status report.',
      2,
      1000 + i * 100,
      1100 + i * 100,
    )
  expect(f.requests).toHaveLength(0)
  session.assistance.halt()
  session.assistance.start()
  session.assistance.connectionReset()
  session.assistance.setIdentityNeedsConfirmation(true)
  session.applyContext({ meetingId: 1, revision: 1, text: 'Revised context' })
  f.coaching = true
  const explanation = 'Database migration ' + Array(45).fill('explanation').join(' ')
  feed(explanation, 2, 30000, 55000)
  expect(f.requests).toHaveLength(0) // identity reconfirmation still gates the coach
  session.assistance.setIdentityNeedsConfirmation(false)
  feed(explanation, 2, 60000, 85000)
  await vi.advanceTimersByTimeAsync(0)
  expect(f.requests.at(-1)?.userContent).toContain('Database migration rollback worked.')
  session.relabel(1, false)
  session.assistance.halt()
  session.assistance.start()
  feed(explanation, 2, 90000, 115000)
  await vi.advanceTimersByTimeAsync(0)
  expect(f.requests.at(-1)?.userContent).not.toContain('Database migration rollback worked.')
  session.assistance.halt()
})
