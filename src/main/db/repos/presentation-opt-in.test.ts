import { afterEach, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { Database } from 'better-sqlite3'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../index', () => ({ getDb: () => mock.db }))
import { runMigrations } from '../migrations'
import { createJob } from './jobs'
import { createPresentationMeeting, getPresentationHistory } from './meeting-presentation'

let sqlite: DatabaseSync
function database(): void {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  // Exercise actual SQLite SQL/transactions with Node's local binding; no Electron launch.
  mock.db = {
    prepare: (sql: string) => sqlite.prepare(sql),
    exec: (sql: string) => sqlite.exec(sql),
    pragma: (sql: string, opts?: { simple: boolean }) => {
      if (opts?.simple) return Object.values(sqlite.prepare(`PRAGMA ${sql}`).get()!)[0]
      sqlite.exec(`PRAGMA ${sql}`)
    },
    transaction: (fn: () => unknown) => () => {
      sqlite.exec('BEGIN')
      try {
        const result = fn()
        sqlite.exec('COMMIT')
        return result
      } catch (e) {
        sqlite.exec('ROLLBACK')
        throw e
      }
    },
  } as unknown as Database
}
afterEach(() => sqlite?.close())

import { replaceJobSlides } from './job-slides'
import { getMeetingContext } from './meeting-context'
import { MeetingPrompts } from '../../services/meetings/assist/meeting-prompts'
import { PresentationSession } from '../../services/meetings/presentation/session'
import { answerRequest } from '../../services/meetings/assist/suggestion-requests'
const settings = {
  anthropicApiKey: 'stub',
  anthropicWorkspaceId: '',
  nudgeModel: 'stub',
  answerModel: 'stub',
  classifierModel: 'stub',
  whisperMode: 'smart' as const,
  nudgeCooldownSec: 0,
  coachWhileTalking: false,
}
it('requires per-meeting deck opt-in and clears prior presentation request context', () => {
  database()
  runMigrations(mock.db)
  const job = createJob('Constellation')
  replaceJobSlides(job.id, [
    { title: 'Constellation deck', talkingPoint: 'branches', script: '', keyFacts: '' },
  ])
  const first = createPresentationMeeting(job.id, 'Presentation', false, true)
  expect(getPresentationHistory(first).slides).toHaveLength(1)
  const off = createPresentationMeeting(job.id, 'Screening')
  expect(getPresentationHistory(off)).toMatchObject({ slides: [], events: [] })
  const unsorted = createJob('Unsorted')
  const next = createPresentationMeeting(unsorted.id, 'Recruiter')
  const prompts = new MeetingPrompts()
  const presentation = new PresentationSession(
    () => {},
    () => {},
    () => {},
  )
  for (const [id, source] of [
    [first, job.id],
    [next, unsorted.id],
  ]) {
    presentation.begin(id, getPresentationHistory(id).slides)
    prompts.begin(source, getMeetingContext(id))
  }
  const request = answerRequest(
    {
      ...prompts.snapshot(),
      meetingId: next,
      atMs: 0,
      presentation: presentation.state(),
      window: [],
      recent: [],
    },
    settings,
    'hotkey',
  )
  expect(JSON.stringify(request)).not.toMatch(
    /Constellation|Selected presentation position|Prepared presentation/,
  )
})
