import { getDb } from '../index'
import type { Meeting, Segment } from '@shared/types'

interface MeetingRow {
  id: number
  job_id: number
  title: string
  started_at: string
  ended_at: string | null
  audio_path: string | null
  summary: string | null
  action_items: string | null
}

function toMeeting(r: MeetingRow): Meeting {
  return {
    id: r.id,
    jobId: r.job_id,
    title: r.title,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    audioPath: r.audio_path,
    summary: r.summary,
    actionItems: r.action_items
  }
}

export function createMeeting(jobId: number, title: string): number {
  const res = getDb()
    .prepare(`INSERT INTO meetings (job_id, title) VALUES (?, ?)`)
    .run(jobId, title)
  return Number(res.lastInsertRowid)
}

export function endMeeting(meetingId: number): void {
  getDb()
    .prepare(`UPDATE meetings SET ended_at = datetime('now') WHERE id = ?`)
    .run(meetingId)
}

export function getMeeting(meetingId: number): Meeting | null {
  const row = getDb().prepare(`SELECT * FROM meetings WHERE id = ?`).get(meetingId) as
    | MeetingRow
    | undefined
  return row ? toMeeting(row) : null
}

export function renameMeeting(meetingId: number, title: string): void {
  getDb().prepare(`UPDATE meetings SET title = ? WHERE id = ?`).run(title, meetingId)
}

export function updateMeetingAudioPath(meetingId: number, audioPath: string): void {
  getDb().prepare(`UPDATE meetings SET audio_path = ? WHERE id = ?`).run(audioPath, meetingId)
}

export function updateMeetingSummary(
  meetingId: number,
  summary: string,
  actionItems: string
): void {
  getDb()
    .prepare(`UPDATE meetings SET summary = ?, action_items = ? WHERE id = ?`)
    .run(summary, actionItems, meetingId)
}

export function listMeetings(jobId: number): Meeting[] {
  const rows = getDb()
    .prepare(`SELECT * FROM meetings WHERE job_id = ? ORDER BY started_at DESC`)
    .all(jobId) as MeetingRow[]
  return rows.map(toMeeting)
}

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

export function deleteMeeting(meetingId: number): void {
  getDb().prepare(`DELETE FROM meetings WHERE id = ?`).run(meetingId) // segments cascade
}
