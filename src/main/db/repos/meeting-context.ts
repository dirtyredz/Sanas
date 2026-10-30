import type { MeetingContext } from '@shared/live-controls/types'
import type { Slide, SlideEvent } from '@shared/presentation/types'
import { getDb } from '../index'

export function deckSlides(meetingId: number, version: number): Slide[] {
  return getDb()
    .prepare(
      `SELECT title, talking_point AS talkingPoint, script, key_facts AS keyFacts
    FROM meeting_slides WHERE meeting_id = ? AND deck_version = ? ORDER BY ordinal`,
    )
    .all(meetingId, version) as Slide[]
}
export function getMeetingContext(meetingId: number): MeetingContext {
  const row = getDb()
    .prepare(
      `SELECT revision, text, deck_version AS deckVersion FROM meeting_context_revisions
    WHERE meeting_id = ? ORDER BY revision DESC LIMIT 1`,
    )
    .get(meetingId) as Pick<MeetingContext, 'revision' | 'text' | 'deckVersion'> | undefined
  if (!row) throw new Error('Meeting not found.')
  return {
    meetingId,
    ...row,
    slides: deckSlides(meetingId, row.deckVersion),
    initialSlides: deckSlides(meetingId, 0),
  }
}
export function saveMeetingContext(next: MeetingContext, atMs: number, event?: SlideEvent): void {
  const db = getDb()
  db.transaction(() => {
    if (getMeetingContext(next.meetingId).revision !== next.revision - 1)
      throw new Error('Context changed. Reload before applying.')
    if (event) {
      db.prepare('INSERT INTO meeting_deck_versions VALUES (?, ?)').run(
        next.meetingId,
        next.deckVersion,
      )
      const insert = db.prepare('INSERT INTO meeting_slides VALUES (?, ?, ?, ?, ?, ?, ?)')
      next.slides.forEach((s, i) =>
        insert.run(
          next.meetingId,
          next.deckVersion,
          i,
          s.title,
          s.talkingPoint,
          s.script,
          s.keyFacts,
        ),
      )
      db.prepare('INSERT INTO meeting_slide_events VALUES (?, ?, ?, ?, ?)').run(
        next.meetingId,
        event.revision,
        next.deckVersion,
        event.ordinal,
        atMs,
      )
    }
    db.prepare('INSERT INTO meeting_context_revisions VALUES (?, ?, ?, ?, ?)').run(
      next.meetingId,
      next.revision,
      next.text,
      next.deckVersion,
      atMs,
    )
  })()
}
export function hasAppliedContext(meetingId: number): boolean {
  return !!getDb()
    .prepare(
      'SELECT 1 FROM meeting_context_revisions WHERE meeting_id = ? AND revision > 0 LIMIT 1',
    )
    .get(meetingId)
}
