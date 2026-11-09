import type { HistoryHit, Segment } from '@shared/types'
import { stripMatchMarkers } from '@shared/suggestion/search-markers'
import { ftsAnyOf } from '../../db/fts-query'
import { searchSegments } from '../../db/repos/history/transcripts'
import { listSegmentsAround } from '../../db/repos/segments'
const HITS = 24,
  RADIUS = 2,
  MAX_SOURCES = 8
interface Match {
  tStartMs: number
  snippet: string
}

export interface Excerpt {
  hit: HistoryHit
  /** the segments that matched, keyed by id (the rest of `lines` is their context) */
  matches: Map<number, Match>
  lines: Segment[]
}

/** Ranked meetings with the segments around each hit, deduplicated per meeting. */
export function retrieveHistory(question: string, jobId?: number): Excerpt[] {
  const hits = searchSegments(ftsAnyOf(question), { jobId, limit: HITS })
  const byMeeting = new Map<number, Excerpt>()
  for (const h of hits) {
    const match: Match = { tStartMs: h.tStartMs, snippet: stripMatchMarkers(h.snippet) }
    const around = listSegmentsAround(h.meeting.id, h.segmentId, RADIUS)
    const ex = byMeeting.get(h.meeting.id)
    if (ex) {
      const seen = new Set(ex.lines.map((s) => s.id))
      ex.lines.push(...around.filter((s) => !seen.has(s.id)))
      ex.lines.sort((a, b) => a.tStartMs - b.tStartMs)
      ex.matches.set(h.segmentId, match)
    } else {
      byMeeting.set(h.meeting.id, {
        hit: {
          meetingId: h.meeting.id,
          title: h.meeting.title,
          jobName: h.jobName,
          startedAt: h.meeting.startedAt,
          ...match,
        },
        matches: new Map([[h.segmentId, match]]),
        lines: around,
      })
    }
  }
  return [...byMeeting.values()].slice(0, MAX_SOURCES)
}
