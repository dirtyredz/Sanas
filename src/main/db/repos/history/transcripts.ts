import type { Meeting, SearchMatch } from '@shared/types'
import { MATCH_CLOSE, MATCH_OPEN } from '@shared/suggestion/search-markers'
import type { FtsMatch } from '../../fts-query'
import { getDb } from '../../index'
import { meetingColumns, toMeeting, type MeetingRow } from '../meeting/meeting-columns'

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
      `SELECT ${meetingColumns('m')}, j.name AS job_name, s.id AS segment_id, s.t_start_ms AS t_start,
              snippet(segments_fts, 0, ?, ?, '…', 14) AS snippet
       FROM segments_fts f
       JOIN segments s ON s.id = f.rowid
       JOIN meetings m ON m.id = s.meeting_id
       JOIN jobs j ON j.id = m.job_id
       WHERE m.practice = 0 AND segments_fts MATCH ? AND (? IS NULL OR m.job_id = ?)
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
