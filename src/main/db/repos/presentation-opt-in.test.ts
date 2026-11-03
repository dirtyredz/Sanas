import { afterEach, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { sqliteTestDatabase } from '../testing/sqlite-test-database'
import type { Database } from 'better-sqlite3'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../index', () => ({ getDb: () => mock.db }))
import { runMigrations } from '../migrations'
import { createJob } from './jobs'
import { createMeeting } from './meeting/meeting-create'
import { getPresentationHistory } from './meeting/meeting-presentation'

let sqlite: DatabaseSync
function database(): void {
  const opened = sqliteTestDatabase()
  sqlite = opened.sqlite
  mock.db = opened.db
}
afterEach(() => sqlite?.close())

import { replaceJobSlides } from './job-slides'
import { getMeetingContext } from './meeting/meeting-context'
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
  const first = createMeeting(job.id, 'Presentation', { usePresentationDeck: true })
  expect(getPresentationHistory(first).slides).toHaveLength(1)
  const off = createMeeting(job.id, 'Screening')
  expect(getPresentationHistory(off)).toMatchObject({ slides: [], events: [] })
  const unsorted = createJob('Unsorted')
  const next = createMeeting(unsorted.id, 'Recruiter')
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
