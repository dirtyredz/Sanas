import { getDb } from '../index'
import { meetingColumns } from './meeting/meeting-columns'
import { toMeeting, type MeetingRow } from './meeting/meetings'
import type { MockResult, PracticeSession } from '@shared/mock-interview/types'

export const practiceSchema = `
ALTER TABLE meetings ADD COLUMN practice INTEGER NOT NULL DEFAULT 0 CHECK (practice IN (0,1));
CREATE TABLE mock_results (
  meeting_id INTEGER PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  result TEXT NOT NULL
);
CREATE INDEX idx_meetings_practice ON meetings(practice, started_at);
`

export function saveMockResult(result: MockResult): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO mock_results (meeting_id, result) VALUES (?, ?)')
    .run(result.meetingId, JSON.stringify(result))
}

export function listPracticeSessions(): PracticeSession[] {
  const rows = getDb()
    .prepare(
      `SELECT ${meetingColumns('m')}, r.result FROM meetings m
    LEFT JOIN mock_results r ON r.meeting_id = m.id
    WHERE m.practice = 1 ORDER BY m.started_at DESC, m.id DESC LIMIT 100`,
    )
    .all() as (MeetingRow & { result: string | null })[]
  return rows.map((r) => ({
    meeting: toMeeting(r),
    result: r.result ? (JSON.parse(r.result) as MockResult) : null,
  }))
}
