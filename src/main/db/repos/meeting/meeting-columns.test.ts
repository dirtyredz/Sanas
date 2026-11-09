import { afterEach, expect, it, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
import type { DatabaseSync } from 'node:sqlite'
import { sqliteTestDatabase } from '../../testing/sqlite-test-database'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../../index', () => ({ getDb: () => mock.db }))
import { runMigrations } from '../../migrations'
import { ftsAllOf } from '../../fts-query'
import { ensureDefaultJob } from '../job/jobs'
import { searchSegments } from '../history/transcripts'
import { insertSegment } from '../transcript/segments'
import { listPracticeSessions } from '../practice'
import { createMeeting } from './meeting-create'
import { getMeeting, listMeetings, listMeetingsEndedBefore } from './meetings'

let sqlite: DatabaseSync
afterEach(() => sqlite?.close())

it('meeting rows never carry resume or profile text, yet report interviewProfileUsed', () => {
  const opened = sqliteTestDatabase()
  sqlite = opened.sqlite
  mock.db = opened.db
  runMigrations(mock.db)
  const job = ensureDefaultJob()
  const secrets = { resume: 'SECRET-RESUME-TEXT', profile: 'SECRET-PROFILE-TEXT' }
  const withProfile = createMeeting(job, 'With profile', {
    resume: { name: 'cv', text: secrets.resume },
    interviewProfile: secrets.profile,
  })
  const without = createMeeting(job, 'Without profile', {
    resume: { name: 'cv', text: secrets.resume },
  })
  const practice = createMeeting(job, 'Practice', {
    practice: true,
    interviewProfile: secrets.profile,
  })
  for (const meetingId of [withProfile, without])
    insertSegment({
      meetingId,
      tStartMs: 0,
      tEndMs: 100,
      speaker: 0,
      isUser: false,
      text: 'indexed leakprobe',
    })
  sqlite.exec(`UPDATE meetings SET ended_at = '2000-01-01 00:00:00'`)

  const rows = [
    getMeeting(withProfile),
    getMeeting(without),
    ...listMeetings(job),
    ...listMeetingsEndedBefore('2001-01-01 00:00:00'),
    ...listPracticeSessions().map((p) => p.meeting),
    ...searchSegments(ftsAllOf('leakprobe')).map((s) => s.meeting),
  ]
  for (const meeting of rows) {
    const text = JSON.stringify(meeting)
    expect(text).not.toContain(secrets.resume)
    expect(text).not.toContain(secrets.profile)
    expect(meeting).not.toHaveProperty('interview_profile')
    expect(meeting).not.toHaveProperty('resume_text')
  }
  expect(getMeeting(withProfile)?.interviewProfileUsed).toBe(true)
  expect(getMeeting(without)?.interviewProfileUsed).toBe(false)
  const hits = searchSegments(ftsAllOf('leakprobe'))
  expect(hits).toHaveLength(2)
  expect(hits.find((h) => h.meeting.id === withProfile)?.meeting.interviewProfileUsed).toBe(true)
  expect(hits.find((h) => h.meeting.id === without)?.meeting.interviewProfileUsed).toBe(false)
  expect(listMeetings(job).find((m) => m.id === withProfile)?.interviewProfileUsed).toBe(true)
  expect(
    listPracticeSessions().find((p) => p.meeting.id === practice)?.meeting.interviewProfileUsed,
  ).toBe(true)
})
