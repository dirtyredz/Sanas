import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { sqliteTestDatabase } from '../testing/sqlite-test-database'
import type { Database } from 'better-sqlite3'
const mock = vi.hoisted(() => ({ db: null as unknown as Database, transcribe: vi.fn() }))
vi.mock('../index', () => ({ getDb: () => mock.db }))
vi.mock('../../config/settings', () => ({ loadSettings: () => ({ deepgramApiKey: 'stub' }) }))
vi.mock('../../services/stt', () => ({ sttProvider: { transcribeFile: mock.transcribe } }))
vi.mock('fs', () => ({ existsSync: () => true }))
import { runMigrations } from '../migrations'
import { createJob } from './jobs'
import { createMeeting } from './meeting/meeting-create'
import { updateMeetingAudioPath } from './meeting/meetings'
import { insertSegment, listSegments } from './segments'
import { setSpeakerName, listSpeakerNames } from './speakers'
import { rediarizeMeeting } from '../../services/meetings/rediarize/rediarize'

let sqlite: DatabaseSync
let meetingId: number
beforeEach(() => {
  const opened = sqliteTestDatabase()
  sqlite = opened.sqlite
  mock.db = opened.db
  runMigrations(mock.db)
  meetingId = createMeeting(createJob('Synthetic interview').id, 'Rollback fixture', {
    resume: { name: 'Synthetic', text: 'Camunda at ExampleCo' },
    interviewProfile: 'At ProfileCo I built PostgreSQL services',
  })
  updateMeetingAudioPath(meetingId, 'synthetic.wav')
  insertSegment({
    meetingId,
    tStartMs: 0,
    tEndMs: 1000,
    speaker: 1,
    isUser: false,
    text: 'original',
  })
  setSpeakerName(meetingId, 1, 'Recruiter')
  mock.transcribe.mockResolvedValue(
    Array.from({ length: 22 }, (_, i) => ({
      channel: i % 2 === 0 ? 1 : 0,
      speaker: 1,
      tStartMs: i * 1000,
      tEndMs: (i + 1) * 1000,
      text: `replacement ${i}`,
    })),
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  sqlite.close()
  vi.restoreAllMocks()
})

it('preserves old segments and names on an empty provider result', async () => {
  const before = listSegments(meetingId)
  mock.transcribe.mockResolvedValue([])
  expect(await rediarizeMeeting(meetingId, 2)).toBe(false)
  expect(listSegments(meetingId)).toEqual(before)
  expect(listSpeakerNames(meetingId)).toEqual([{ speaker: 1, name: 'Recruiter' }])
  expect(console.log).not.toHaveBeenCalled()
})

it.each(['segments', 'speakers'])(
  'rolls back deletion and inserts when %s insertion fails',
  async (table) => {
    const before = listSegments(meetingId)
    // Fail after deletion (and, for names, after all replacement segment inserts).
    sqlite.exec(`CREATE TRIGGER injected_failure BEFORE INSERT ON ${table}
    BEGIN SELECT RAISE(ABORT, 'injected replacement failure'); END`)
    expect(await rediarizeMeeting(meetingId, 2)).toBe(false)
    expect(listSegments(meetingId)).toEqual(before)
    expect(listSpeakerNames(meetingId)).toEqual([{ speaker: 1, name: 'Recruiter' }])
    expect(console.warn).toHaveBeenCalledWith(
      '[sanas] re-diarization failed (live segments kept):',
      expect.objectContaining({ message: 'injected replacement failure' }),
    )
    expect(console.log).not.toHaveBeenCalled()
  },
)

it('commits all 22 replacement rows and reports structural user/other counts', async () => {
  expect(await rediarizeMeeting(meetingId, 2)).toBe(true)
  expect(mock.transcribe).toHaveBeenLastCalledWith(
    'synthetic.wav',
    expect.objectContaining({
      keyterms: expect.arrayContaining(['Camunda', 'ProfileCo', 'PostgreSQL']),
    }),
  )
  const rows = listSegments(meetingId)
  expect(rows.map((s) => s.text)).toEqual(Array.from({ length: 22 }, (_, i) => `replacement ${i}`))
  expect(rows.filter((s) => s.isUser)).toHaveLength(11)
  expect(listSpeakerNames(meetingId)).toEqual([{ speaker: 1, name: 'Recruiter' }])
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining(
      '22 segments, 1 name(s) carried, 0 mono pins carried; 11 user / 11 other segments',
    ),
  )
  expect(console.warn).not.toHaveBeenCalled()
})
