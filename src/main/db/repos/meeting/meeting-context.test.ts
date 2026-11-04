import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import type { Database } from 'better-sqlite3'
import { sqliteTestDatabase } from '../../testing/sqlite-test-database'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../../index', () => ({ getDb: () => mock.db }))
vi.mock('fs', () => ({ existsSync: () => false, unlinkSync: vi.fn() }))
import { runMigrations } from '../../migrations'
import { createJob, ensureDefaultJob } from '../jobs'
import { createMeeting } from './meeting-create'
import { getMeetingContext, hasMeetingContext, saveMeetingContext } from './meeting-context'
import { insertSegment, listSegments } from '../segments'
import { insertSuggestion, listSuggestions } from '../suggestions'
import { mergeMeetings } from '../../../services/meetings/merge/merge'

// Repository-local SQLite coverage for meeting context: revision 0 at creation, text-only
// revisions, and merge moving one part's context history onto the kept meeting.

let sqlite: DatabaseSync
beforeEach(() => {
  const opened = sqliteTestDatabase()
  sqlite = opened.sqlite
  mock.db = opened.db
  runMigrations(mock.db)
})
afterEach(() => sqlite?.close())

const count = (table: string, id: number): number =>
  (
    sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE meeting_id = ?`).get(id) as {
      n: number
    }
  ).n
const revisions = (id: number): unknown[] =>
  sqlite
    .prepare(
      'SELECT revision, text, deck_version AS deckVersion, t_ms AS tMs FROM meeting_context_revisions WHERE meeting_id = ? ORDER BY revision',
    )
    .all(id)

describe('createMeeting', () => {
  it('saves the exact Start context as revision 0, for a job and for Unsorted', () => {
    const job = createJob('Client A').id
    const text = '  Attendees: Dana (CFO)\nGoal: pilot scope  ' + 'x'.repeat(19950)
    const id = createMeeting(job, 'Kickoff', { meetingContext: text })
    expect(getMeetingContext(id)).toEqual({ meetingId: id, revision: 0, text })
    const unsorted = createMeeting(ensureDefaultJob(), 'Call', { meetingContext: 'Unsorted notes' })
    expect(getMeetingContext(unsorted).text).toBe('Unsorted notes')
    expect(getMeetingContext(createMeeting(job, 'Plain')).text).toBe('') // omitted = empty
  })

  it('writes the version-0 bookkeeping row but no slides or slide events', () => {
    const job = createJob('Client A').id
    // a job deck saved before presentation mode was retired is left exactly as it was
    sqlite.prepare("INSERT INTO job_slides VALUES (?, 0, 'Old deck', 'p', '', '')").run(job)
    const id = createMeeting(job, 'Kickoff', { meetingContext: 'ctx' })
    expect(count('meeting_deck_versions', id)).toBe(1)
    expect(count('meeting_slides', id)).toBe(0)
    expect(count('meeting_slide_events', id)).toBe(0)
    expect(sqlite.prepare('SELECT title FROM job_slides WHERE job_id = ?').all(job)).toEqual([
      { title: 'Old deck' },
    ])
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('rolls the meeting row back when the context insert fails', () => {
    const job = createJob('Client A').id
    const before = (sqlite.prepare('SELECT COUNT(*) AS n FROM meetings').get() as { n: number }).n
    sqlite.exec(
      "CREATE TRIGGER fail_context BEFORE INSERT ON meeting_context_revisions BEGIN SELECT RAISE(ABORT, 'disk full'); END",
    )
    expect(() => createMeeting(job, 'Kickoff', { meetingContext: 'ctx' })).toThrow('disk full')
    const after = (sqlite.prepare('SELECT COUNT(*) AS n FROM meetings').get() as { n: number }).n
    expect(after).toBe(before)
  })
})

describe('context revisions', () => {
  it('appends text revisions on the latest bookkeeping version and refuses a stale one', () => {
    const id = createMeeting(createJob('A').id, 'M', { meetingContext: 'start' })
    saveMeetingContext({ meetingId: id, revision: 1, text: 'edited' }, 1500)
    expect(getMeetingContext(id)).toEqual({ meetingId: id, revision: 1, text: 'edited' })
    expect(() => saveMeetingContext({ meetingId: id, revision: 1, text: 'again' }, 1600)).toThrow(
      'Context changed',
    )
    expect(revisions(id)).toEqual([
      { revision: 0, text: 'start', deckVersion: 0, tMs: 0 },
      { revision: 1, text: 'edited', deckVersion: 0, tMs: 1500 },
    ])
  })

  it('counts nonempty initial text or any applied revision (a clear included) as context', () => {
    const job = createJob('A').id
    expect(hasMeetingContext(createMeeting(job, 'none'))).toBe(false)
    expect(hasMeetingContext(createMeeting(job, 'initial', { meetingContext: 'x' }))).toBe(true)
    const cleared = createMeeting(job, 'cleared')
    saveMeetingContext({ meetingId: cleared, revision: 1, text: '' }, 10)
    expect(hasMeetingContext(cleared)).toBe(true)
  })
})

describe('merging meetings with context', () => {
  // three parts of one call, 10 minutes apart, each ended before the next began
  function parts(contexts: (string | null)[]): number[] {
    const job = createJob('Client A').id
    return contexts.map((ctx, i) => {
      const id = createMeeting(job, `Part ${i + 1}`, ctx === null ? {} : { meetingContext: ctx })
      sqlite
        .prepare('UPDATE meetings SET started_at = ?, ended_at = ? WHERE id = ?')
        .run(`2026-11-04 10:${i}0:00`, `2026-11-04 10:${i}5:00`, id)
      insertSegment({
        meetingId: id,
        tStartMs: 0,
        tEndMs: 900,
        speaker: 0,
        isUser: false,
        text: `p${i + 1}`,
      })
      insertSuggestion({
        meetingId: id,
        tMs: 500,
        trigger: 'hotkey',
        purpose: 'answer',
        promptWindow: '',
        text: `answer ${i + 1}`,
        contextRevision: 0,
      })
      return id
    })
  }

  it('moves a later part’s context history onto the kept meeting at its place in the timeline', () => {
    const [first, second, third] = parts([null, 'Agenda: pricing', null])
    saveMeetingContext({ meetingId: second, revision: 1, text: 'Agenda: pricing + SLA' }, 60_000)
    sqlite.prepare('UPDATE suggestions SET context_revision = 1 WHERE meeting_id = ?').run(second)
    const { meeting } = mergeMeetings([third, second, first])
    expect(meeting.id).toBe(first)
    expect(revisions(first)).toEqual([
      { revision: 0, text: '', deckVersion: 0, tMs: 0 },
      { revision: 1, text: 'Agenda: pricing', deckVersion: 0, tMs: 600_000 },
      { revision: 2, text: 'Agenda: pricing + SLA', deckVersion: 0, tMs: 660_000 },
    ])
    expect(getMeetingContext(first)).toMatchObject({ revision: 2, text: 'Agenda: pricing + SLA' })
    // each suggestion still names the revision it was made with
    expect(listSuggestions(first).map((s) => [s.text, s.contextRevision, s.tMs])).toEqual([
      ['answer 1', 0, 500],
      ['answer 2', 2, 600_500],
      ['answer 3', 0, 1_200_500],
    ])
    expect(listSegments(first)).toHaveLength(3)
    expect(count('meeting_context_revisions', second)).toBe(0)
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('keeps the kept meeting’s own context and unlinks the parts made without it', () => {
    const [first, second] = parts(['Attendees: Dana', null])
    const { meeting } = mergeMeetings([first, second])
    expect(revisions(meeting.id)).toEqual([
      { revision: 0, text: 'Attendees: Dana', deckVersion: 0, tMs: 0 },
    ])
    expect(listSuggestions(first).map((s) => s.contextRevision)).toEqual([0, null])
  })

  it('refuses two parts with context before changing anything', () => {
    const [first, second, third] = parts(['A', null, null])
    saveMeetingContext({ meetingId: third, revision: 1, text: '' }, 10) // cleared still counts
    expect(() => mergeMeetings([first, second, third])).toThrow(
      'Only one of the meetings being merged may have meeting context',
    )
    expect(listSegments(second)).toHaveLength(1)
    expect(revisions(third)).toHaveLength(2)
  })

  it('still refuses meetings recorded with legacy slides', () => {
    const [first, second] = parts([null, null])
    sqlite
      .prepare("INSERT INTO meeting_slides VALUES (?, 0, 0, 'Old slide', 'p', '', '')")
      .run(second)
    expect(() => mergeMeetings([first, second])).toThrow('presentation slides')
  })
})
