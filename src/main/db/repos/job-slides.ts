import type { Slide } from '@shared/presentation/types'
import { getDb } from '../index'

export function getJobSlides(jobId: number): Slide[] {
  return getDb()
    .prepare(
      'SELECT title, talking_point AS talkingPoint, script, key_facts AS keyFacts FROM job_slides WHERE job_id = ? ORDER BY ordinal',
    )
    .all(jobId) as Slide[]
}

export function replaceJobSlides(jobId: number, slides: Slide[]): Slide[] {
  const db = getDb()
  db.transaction(() => {
    if (!db.prepare('SELECT id FROM jobs WHERE id = ?').get(jobId))
      throw new Error('Job not found.')
    db.prepare('DELETE FROM job_slides WHERE job_id = ?').run(jobId)
    const insert = db.prepare('INSERT INTO job_slides VALUES (?, ?, ?, ?, ?, ?)')
    slides.forEach((s, i) => insert.run(jobId, i, s.title, s.talkingPoint, s.script, s.keyFacts))
  })()
  return getJobSlides(jobId)
}
