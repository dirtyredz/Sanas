import type { Database } from 'better-sqlite3'
import {
  neighbourSegments,
  summaryHits,
  transcriptHits,
  type HistoryHit,
} from '../../../db/repos/history/live'

/** Prompt-facing evidence: the kind label is what the model reads. */
export interface LiveHit extends HistoryHit {
  kind: 'transcript' | 'generated summary'
}
const MAX_HITS = 3

/** Interleaves the independently ranked transcript and summary indexes, drops duplicates
 * (same meeting + kind, or text already contained) and expands transcript hits with
 * nearby segments. Callers choose the connection so the worker can run it read-only. */
export function liveHits(db: Database, jobId: number, currentId: number, query: string): LiveHit[] {
  const transcript = transcriptHits(db, jobId, currentId, query).map((h): LiveHit => ({
    ...h,
    kind: 'transcript',
  }))
  const summaries = summaryHits(db, jobId, currentId, query).map((h): LiveHit => ({
    ...h,
    kind: 'generated summary',
  }))
  const results: LiveHit[] = []
  for (let i = 0; i < Math.max(transcript.length, summaries.length); i++)
    for (const hit of [transcript[i], summaries[i]]) {
      if (
        !hit ||
        results.some(
          (h) =>
            h.meetingId === hit.meetingId && (h.kind === hit.kind || h.text.includes(hit.text)),
        )
      )
        continue
      if (hit.time !== null) {
        // Keep the match first, neighbours after it.
        const neighbours = neighbourSegments(db, hit.meetingId, hit.time)
        if (neighbours.length) hit.text += '\nNearby transcript: ' + neighbours.join(' ')
      }
      results.push(hit)
      if (results.length === MAX_HITS) return results
    }
  return results
}
