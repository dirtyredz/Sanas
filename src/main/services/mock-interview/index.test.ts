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
vi.mock('../meetings', async () => {
  const { createMeeting } = await import('../../db/repos/meeting-create')
  return {
    currentState: () => ({ meetingId: null }),
    meetingAudioMs: () => 0,
    stopMeeting: vi.fn(),
    startMeeting: async (
      job: number,
      _channels: number,
      options: Parameters<typeof createMeeting>[2],
    ) => ({
      meetingId: createMeeting(job, 'Practice', options),
      status: 'live',
    }),
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
import { ensureDefaultJob } from '../../db/repos/jobs'
import { getMeetingResume } from '../../db/repos/meeting-resume'
import { getMeeting } from '../../db/repos/meetings'
import { mockStartInput } from '../../ipc/mock-interview-validation'
import { startMock } from './index'

let close: (() => void) | undefined
afterEach(() => close?.())
it.each([true, false])('stores the mock-start resume with attachment = %s', async (attached) => {
  const opened = sqliteTestDatabase()
  close = () => opened.sqlite.close()
  mock.db = opened.db
  runMigrations(mock.db)
  const resume = attached
    ? { name: 'Synthetic', text: 'At ExampleCo I owned the migration.' }
    : null
  const input = mockStartInput('interview', ensureDefaultJob(), 2, resume)
  const state = await startMock(
    input.plan,
    input.job,
    input.channels,
    {} as WebContents,
    input.resume,
  )
  expect(getMeetingResume(state.meetingId!)).toEqual(resume)
  expect(getMeeting(state.meetingId!)?.practice).toBe(true)
})
