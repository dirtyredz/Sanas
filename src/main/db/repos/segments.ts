import { getDb } from '../index'
import type { Meeting, Segment } from '@shared/types'
import { toMeeting, type MeetingRow } from './meetings'

export function listSegments(meetingId: number): Segment[] {
  return getDb()
    .prepare(
      `SELECT id, meeting_id AS meetingId, t_start_ms AS tStartMs, t_end_ms AS tEndMs,
              speaker, is_user AS isUser, text
       FROM segments WHERE meeting_id = ? ORDER BY t_start_ms`
    )
    .all(meetingId)
    .map((r) => {
      const row = r as Omit<Segment, 'isUser'> & { isUser: number }
      return { ...row, isUser: row.isUser === 1 }
    })
}

export interface SegmentMatch {
  meeting: Meeting
  jobName: string
  tStartMs: number
  snippet: string
}

/** Case-insensitive substring search over all transcripts, newest meetings first. */
export function searchSegments(query: string, limit = 50): SegmentMatch[] {
  const rows = getDb()
    .prepare(
      `SELECT m.*, j.name AS job_name, s.t_start_ms AS t_start, s.text AS snippet
       FROM segments s
       JOIN meetings m ON m.id = s.meeting_id
       JOIN jobs j ON j.id = m.job_id
       WHERE s.text LIKE ? ESCAPE '\\'
       ORDER BY m.started_at DESC, s.t_start_ms
       LIMIT ?`
    )
    .all(`%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, limit) as (MeetingRow & {
    job_name: string
    t_start: number
    snippet: string
  })[]
  return rows.map((r) => ({
    meeting: toMeeting(r),
    jobName: r.job_name,
    tStartMs: r.t_start,
    snippet: r.snippet
  }))
}

export function insertSegment(seg: {
  meetingId: number
  tStartMs: number
  tEndMs: number
  speaker: number
  isUser: boolean
  text: string
}): number {
  const res = getDb()
    .prepare(
      `INSERT INTO segments (meeting_id, t_start_ms, t_end_ms, speaker, is_user, text)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(seg.meetingId, seg.tStartMs, seg.tEndMs, seg.speaker, seg.isUser ? 1 : 0, seg.text)
  return Number(res.lastInsertRowid)
}

/** Re-label a speaker's past segments when the user pins "that's me". */
export function setSpeakerIsUser(meetingId: number, speaker: number, isUser: boolean): void {
  getDb()
    .prepare(`UPDATE segments SET is_user = ? WHERE meeting_id = ? AND speaker = ?`)
    .run(isUser ? 1 : 0, meetingId, speaker)
}
