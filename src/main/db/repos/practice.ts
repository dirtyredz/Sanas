import { getDb } from '../index'
import { meetingColumns, toMeeting, type MeetingRow } from './meeting/meeting-columns'
import type { MockResult, PracticeSession } from '@shared/mock-interview/types'

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
