import { getDb } from '../index'
import type { Meeting, Segment, SearchMatch } from '@shared/types'
import { MATCH_CLOSE, MATCH_OPEN } from '@shared/search-markers'
import type { FtsMatch } from '../fts-query'
import { toMeeting, type MeetingRow } from './meetings'

export function listSegments(meetingId: number): Segment[] {
  return getDb()
    .prepare(
      `SELECT id, meeting_id AS meetingId, t_start_ms AS tStartMs, t_end_ms AS tEndMs,
              speaker, is_user AS isUser, text
       FROM segments WHERE meeting_id = ? ORDER BY t_start_ms`,
    )
    .all(meetingId)
    .map((r) => {
      const row = r as Omit<Segment, 'isUser'> & { isUser: number }
      return { ...row, isUser: row.isUser === 1 }
    })
}

/** The segments just before and after one (ids are sequential within a meeting), for
 *  showing a hit in context. Includes the segment itself. */
export function listSegmentsAround(
  meetingId: number,
  segmentId: number,
  radius: number,
): Segment[] {
  return getDb()
    .prepare(
      `SELECT id, meeting_id AS meetingId, t_start_ms AS tStartMs, t_end_ms AS tEndMs,
              speaker, is_user AS isUser, text
       FROM segments WHERE meeting_id = ? AND id BETWEEN ? AND ? ORDER BY t_start_ms`,
    )
    .all(meetingId, segmentId - radius, segmentId + radius)
    .map((r) => {
      const row = r as Omit<Segment, 'isUser'> & { isUser: number }
      return { ...row, isUser: row.isUser === 1 }
    })
}

/** Ranked full-text search over every transcript (FTS5, bm25). Only an FtsMatch built by
 *  db/fts-query.ts is accepted, so raw user text can never reach the MATCH grammar. snippet()
 *  wraps each matched term in the shared markers; the renderer turns those into <mark>. */
export function searchSegments(
  match: FtsMatch,
  opts: { jobId?: number; limit?: number } = {},
): SearchMatch[] {
  if (!match) return []
  const rows = getDb()
    .prepare(
      `SELECT m.*, j.name AS job_name, s.id AS segment_id, s.t_start_ms AS t_start,
              snippet(segments_fts, 0, ?, ?, '…', 14) AS snippet
       FROM segments_fts f
       JOIN segments s ON s.id = f.rowid
       JOIN meetings m ON m.id = s.meeting_id
       JOIN jobs j ON j.id = m.job_id
       WHERE segments_fts MATCH ? AND (? IS NULL OR m.job_id = ?)
       ORDER BY bm25(segments_fts), m.started_at DESC
       LIMIT ?`,
    )
    .all(
      MATCH_OPEN,
      MATCH_CLOSE,
      match,
      opts.jobId ?? null,
      opts.jobId ?? null,
      opts.limit ?? 50,
    ) as (MeetingRow & {
    job_name: string
    segment_id: number
    t_start: number
    snippet: string
  })[]
  return rows.map((r) => ({
    meeting: toMeeting(r) as Meeting,
    jobName: r.job_name,
    segmentId: r.segment_id,
    tStartMs: r.t_start,
    snippet: r.snippet,
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
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(seg.meetingId, seg.tStartMs, seg.tEndMs, seg.speaker, seg.isUser ? 1 : 0, seg.text)
  return Number(res.lastInsertRowid)
}

/** Explicit delete for callers that replace a transcript in place (re-diarization). A
 *  cascade from the meetings row runs the same FTS triggers, so removeMeeting needs none. */
export function deleteSegmentsForMeeting(meetingId: number): void {
  getDb().prepare(`DELETE FROM segments WHERE meeting_id = ?`).run(meetingId)
}

/** Re-label a speaker's past segments when the user pins "that's me". */
export function setSpeakerIsUser(meetingId: number, speaker: number, isUser: boolean): void {
  getDb()
    .prepare(`UPDATE segments SET is_user = ? WHERE meeting_id = ? AND speaker = ?`)
    .run(isUser ? 1 : 0, meetingId, speaker)
}
