import type { PresentationHistory, Slide, SlideEvent } from '@shared/presentation/types'
import { getDb } from '../../index'

// Read-only access to slides recorded before presentation mode was retired (2026-11-04).
// Nothing writes `meeting_slides` or `meeting_slide_events` any more; these readers keep old
// meetings' markers in history, exports and summaries, and let merge refuse them.

function deckSlides(meetingId: number, version: number): Slide[] {
  return getDb()
    .prepare(
      `SELECT title, talking_point AS talkingPoint, script, key_facts AS keyFacts
    FROM meeting_slides WHERE meeting_id = ? AND deck_version = ? ORDER BY ordinal`,
    )
    .all(meetingId, version) as Slide[]
}

/** True when the meeting has recorded slides or slide events (a pre-retirement presentation).
 *  The empty version-0 bookkeeping row every meeting has does not count. */
export function hasLegacySlides(id: number): boolean {
  return !!getDb()
    .prepare(
      `SELECT 1 FROM meeting_slides WHERE meeting_id = ?
       UNION ALL SELECT 1 FROM meeting_slide_events WHERE meeting_id = ? LIMIT 1`,
    )
    .get(id, id)
}

export function getPresentationHistory(id: number): PresentationHistory {
  const versions: Record<number, Slide[]> = {}
  const rows = getDb()
    .prepare('SELECT version FROM meeting_deck_versions WHERE meeting_id = ? ORDER BY version')
    .all(id) as { version: number }[]
  for (const { version } of rows) versions[version] = deckSlides(id, version)
  const events = getDb()
    .prepare(
      'SELECT revision, deck_version AS deckVersion, ordinal, t_ms AS tMs FROM meeting_slide_events WHERE meeting_id = ? ORDER BY t_ms, revision',
    )
    .all(id) as SlideEvent[]
  return { events, versions }
}
