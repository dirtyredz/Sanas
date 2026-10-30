import type { PresentationHistory, Slide, SlideEvent } from '@shared/presentation/types'
import { getDb } from '../index'
import { createMeeting } from './meetings'

export function createPresentationMeeting(jobId: number, title: string): number {
  const db = getDb()
  return db.transaction(() => {
    const id = createMeeting(jobId, title)
    db.prepare(
      'INSERT INTO meeting_slides SELECT ?, ordinal, title, talking_point, script, key_facts FROM job_slides WHERE job_id = ?',
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
    .prepare('INSERT INTO meeting_slide_events VALUES (?, ?, ?, ?)')
    .run(id, event.revision, event.ordinal, event.tMs)
}

export function getPresentationHistory(id: number): PresentationHistory {
  const slides = getDb()
    .prepare(
      'SELECT title, talking_point AS talkingPoint, script, key_facts AS keyFacts FROM meeting_slides WHERE meeting_id = ? ORDER BY ordinal',
    )
    .all(id) as Slide[]
  const events = getDb()
    .prepare(
      'SELECT revision, ordinal, t_ms AS tMs FROM meeting_slide_events WHERE meeting_id = ? ORDER BY t_ms, revision',
    )
    .all(id) as SlideEvent[]
  return { slides, events }
}
