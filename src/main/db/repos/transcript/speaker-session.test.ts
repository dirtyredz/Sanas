import { expect, it, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
import { sqliteTestDatabase } from '../../testing/sqlite-test-database'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../../index', () => ({ getDb: () => mock.db }))
import { runMigrations } from '../../migrations'
import { createJob } from '../job/jobs'
import { createMeeting } from '../meeting/meeting-create'
import { insertSegment, listSegments, setSpeakerIsUser } from './segments'
import { setSpeakerName, listSpeakerNames } from './speakers'
import { SpeakerSession } from '../../../services/meetings/capture/speaker-session'
import { carryUserIdentity } from '../../../services/meetings/postprocess/rediarize/speaker-carryover'

it('re-pinning a new connection preserves historical rows, names and batch overlap identity', () => {
  const opened = sqliteTestDatabase()
  mock.db = opened.db
  try {
    runMigrations(mock.db)
    const id = createMeeting(createJob('Continuity').id, 'Synthetic')
    const session = new SpeakerSession()
    const old = session.map(0)
    insertSegment({
      meetingId: id,
      speaker: old,
      isUser: true,
      text: 'Before',
      tStartMs: 0,
      tEndMs: 1000,
    })
    session.pin(old, true)
    setSpeakerName(id, old, 'Confirmed')
    const before = listSegments(id)[0]
    session.resetConnection()
    const next = session.map(0)
    insertSegment({
      meetingId: id,
      speaker: next,
      isUser: false,
      text: 'After',
      tStartMs: 1000,
      tEndMs: 2000,
    })
    setSpeakerIsUser(id, next, true)
    expect(listSegments(id)[0]).toEqual(before)
    expect(listSpeakerNames(id)).toEqual([{ speaker: old, name: 'Confirmed' }])
    expect([
      ...carryUserIdentity(
        listSegments(id).filter((row) => row.isUser),
        [{ speaker: 7, tStartMs: 0, tEndMs: 2000 }],
      ),
    ]).toEqual([7])
  } finally {
    opened.sqlite.close()
  }
})
