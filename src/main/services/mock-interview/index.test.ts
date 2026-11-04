import { afterEach, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import type { Database } from 'better-sqlite3'
import type { MockSessionDeps } from './turns/session'
import { sqliteTestDatabase } from '../../db/testing/sqlite-test-database'

const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../../db/index', () => ({ getDb: () => mock.db }))
vi.mock('../../config/settings', () => ({
  loadSettings: () => ({ anthropicApiKey: 'stub', deepgramApiKey: 'stub' }),
}))
vi.mock('../../windows/broadcast', () => ({ broadcast: vi.fn() }))
vi.mock('../../windows/interviewer-window', () => ({
  closeInterviewer: vi.fn(),
  openInterviewer: vi.fn(),
}))
vi.mock('../../windows/overlay-window', () => ({ showOverlay: vi.fn() }))
vi.mock('../assistant/provider', () => ({ assistantProvider: {} }))
vi.mock('./shortcuts', () => ({ registerMockShortcuts: vi.fn() }))
vi.mock('./turns/interviewer', () => ({ createInterviewer: vi.fn() }))
vi.mock('../meetings/observation', () => ({ subscribeMeeting: vi.fn() }))
vi.mock('../meetings/assist/run-observation', () => ({ subscribeRuns: vi.fn() }))
vi.mock('../meetings/assist/diagnostics', () => ({ subscribeAssistance: vi.fn() }))
// Same grounding resolution and creation as ordinary Start, without STT or audio.
vi.mock('../meetings', async () => {
  const { createMeeting } = await import('../../db/repos/meeting/meeting-create')
  const { resolveStartGrounding } = await import('../meetings/context/start-grounding')
  return {
    currentState: () => ({ meetingId: null }),
    meetingAudioMs: () => 0,
    stopMeeting: vi.fn(),
    startMeeting: async (
      jobId: number,
      _channels: number,
      request: { practice?: boolean; interview?: boolean },
    ) => {
      const { job, resume, interviewProfile } = resolveStartGrounding(jobId, request, 'Profile')
      return {
        meetingId: createMeeting(job, 'Practice', {
          practice: request.practice,
          resume,
          interviewProfile,
        }),
        status: 'live',
      }
    },
  }
})
// Exercise the product's start callback without starting speech, windows or timers.
vi.mock('./turns/session', () => ({
  MockSession: class {
    id: number | null = null
    constructor(
      _plan: unknown,
      _interviewer: unknown,
      private deps: MockSessionDeps,
    ) {}
    async start(job: number): Promise<void> {
      this.id = (await this.deps.start(job)).meetingId
    }
    state() {
      return { meetingId: this.id, status: 'ended' }
    }
  },
}))
import { runMigrations } from '../../db/migrations'
import { createJob } from '../../db/repos/jobs'
import { setJobResume } from '../../db/repos/job/job-resume'
import { getMeetingGrounding } from '../../db/repos/meeting/meeting-grounding'
import { getMeeting } from '../../db/repos/meeting/meetings'
import { mockStartInput } from '../../ipc/mock-interview-validation'
import { startMock } from './index'

let close: (() => void) | undefined
afterEach(() => close?.())
it.each([true, false])('snapshots the job saved resume = %s at mock start', async (saved) => {
  const opened = sqliteTestDatabase()
  close = () => opened.sqlite.close()
  mock.db = opened.db
  runMigrations(mock.db)
  const job = createJob('Platform role').id
  const resume = { name: 'Synthetic', text: 'At ExampleCo I owned the migration.' }
  if (saved) setJobResume(job, resume)
  const input = mockStartInput('interview', job, 2)
  const state = await startMock(input.plan, input.job, input.channels, {} as WebContents)
  const grounding = getMeetingGrounding(state.meetingId!)
  expect(grounding.resume).toEqual(saved ? resume : null)
  expect(grounding.interviewProfile).toBe('Profile') // Mock always uses the profile
  expect(getMeeting(state.meetingId!)?.practice).toBe(true)
  // later edits never reach the started session
  setJobResume(job, null)
  expect(getMeetingGrounding(state.meetingId!).resume).toEqual(saved ? resume : null)
})
