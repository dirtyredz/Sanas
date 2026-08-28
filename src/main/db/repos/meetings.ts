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

export function deleteMeeting(meetingId: number): void {
  getDb().prepare(`DELETE FROM meetings WHERE id = ?`).run(meetingId) // segments cascade
}
