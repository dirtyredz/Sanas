import { getDb } from '../index'
import type { Meeting } from '@shared/types'

export interface MeetingRow {
  id: number
  job_id: number
  title: string
  started_at: string
  ended_at: string | null
  audio_path: string | null
  summary: string | null
  action_items: string | null
}

export function toMeeting(r: MeetingRow): Meeting {
  return {
    id: r.id,
    jobId: r.job_id,
    title: r.title,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    audioPath: r.audio_path,
    summary: r.summary,
    actionItems: r.action_items,
  }
}

export function createMeeting(jobId: number, title: string): number {
  const res = getDb()
    .prepare(`INSERT INTO meetings (job_id, title) VALUES (?, ?)`)
    .run(jobId, title)
  return Number(res.lastInsertRowid)
}

export function endMeeting(meetingId: number): void {
  getDb().prepare(`UPDATE meetings SET ended_at = datetime('now') WHERE id = ?`).run(meetingId)
}

export function getMeeting(meetingId: number): Meeting | null {
  const row = getDb().prepare(`SELECT * FROM meetings WHERE id = ?`).get(meetingId) as
    MeetingRow | undefined
  return row ? toMeeting(row) : null
}

export function moveMeetingToJob(meetingId: number, jobId: number): void {
  getDb().prepare(`UPDATE meetings SET job_id = ? WHERE id = ?`).run(jobId, meetingId)
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
  actionItems: string,
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

/** Row-only delete (segments, suggestions, speaker names cascade). The audio file is
 *  the caller's job — use services/meetings/remove.ts, not this, from outside repos. */
export function deleteMeeting(meetingId: number): void {
  getDb().prepare(`DELETE FROM meetings WHERE id = ?`).run(meetingId)
}

/** Ended meetings whose end is older than `cutoff` (SQLite datetime text, UTC);
 *  a meeting still running has no ended_at and is never returned. */
export function listMeetingsEndedBefore(cutoff: string): Meeting[] {
  const rows = getDb()
    .prepare(`SELECT * FROM meetings WHERE ended_at IS NOT NULL AND ended_at < ? ORDER BY ended_at`)
    .all(cutoff) as MeetingRow[]
  return rows.map(toMeeting)
}

export function clearMeetingAudioPath(meetingId: number): void {
  getDb().prepare(`UPDATE meetings SET audio_path = NULL WHERE id = ?`).run(meetingId)
}
