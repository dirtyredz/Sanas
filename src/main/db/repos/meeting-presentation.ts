import type { PresentationHistory, Slide, SlideEvent } from '@shared/presentation/types'
import { getDb } from '../index'
import { deckSlides, getMeetingContext } from './meeting-context'
import { createMeeting } from './meetings'

export function createPresentationMeeting(jobId: number, title: string): number {
  const db = getDb()
  return db.transaction(() => {
    const id = createMeeting(jobId, title)
    db.prepare('INSERT INTO meeting_deck_versions VALUES (?, 0)').run(id)
    db.prepare("INSERT INTO meeting_context_revisions VALUES (?, 0, '', 0, 0)").run(id)
    db.prepare(
      'INSERT INTO meeting_slides SELECT ?, 0, ordinal, title, talking_point, script, key_facts FROM job_slides WHERE job_id = ?',
    ).run(id, jobId)
    if (hasPresentation(id)) insertSlideEvent(id, { ordinal: 0, revision: 1, tMs: 0 })
    return id
  })()
}

export function hasPresentation(id: number): boolean {
  return !!getDb().prepare('SELECT 1 FROM meeting_slides WHERE meeting_id = ? LIMIT 1').get(id)
}

export function insertSlideEvent(id: number, event: SlideEvent): void {
  getDb()
    .prepare('INSERT INTO meeting_slide_events VALUES (?, ?, ?, ?, ?)')
    .run(id, event.revision, event.deckVersion ?? 0, event.ordinal, event.tMs)
}

export function getPresentationHistory(id: number): PresentationHistory {
  const slides = getMeetingContext(id).slides
  const versions: Record<number, Slide[]> = {}
  const rows = getDb()
    .prepare('SELECT version FROM meeting_deck_versions WHERE meeting_id = ?')
    .all(id) as { version: number }[]
  for (const { version } of rows) versions[version] = deckSlides(id, version)
  const events = getDb()
    .prepare(
      'SELECT revision, deck_version AS deckVersion, ordinal, t_ms AS tMs FROM meeting_slide_events WHERE meeting_id = ? ORDER BY t_ms, revision',
    )
    .all(id) as SlideEvent[]
  return { slides, events, versions }
}
