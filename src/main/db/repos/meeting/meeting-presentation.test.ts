import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import type { Database } from 'better-sqlite3'
import { sqliteTestDatabase } from '../../testing/sqlite-test-database'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../../index', () => ({ getDb: () => mock.db }))
import { runMigrations } from '../../migrations'
import { createJob } from '../jobs'
import { createMeeting } from './meeting-create'
import { getPresentationHistory, hasLegacySlides } from './meeting-presentation'
import { presentationTimeline, slideMarker } from '@shared/presentation/timeline'

// Historical slide records: nothing writes them any more, so they are seeded here the way a
// pre-retirement build stored them (deck versions, slides, events), then read back.

let sqlite: DatabaseSync
beforeEach(() => {
  const opened = sqliteTestDatabase()
  sqlite = opened.sqlite
  mock.db = opened.db
  runMigrations(mock.db)
})
afterEach(() => sqlite?.close())

function legacyMeeting(): number {
  const id = createMeeting(createJob('Constellation').id, 'Deck review')
  const slide = sqlite.prepare("INSERT INTO meeting_slides VALUES (?, ?, ?, ?, 'p', 's', '')")
  slide.run(id, 0, 0, 'Intro')
  slide.run(id, 0, 1, 'Rollout')
  sqlite.prepare('INSERT INTO meeting_deck_versions VALUES (?, 1)').run(id)
  slide.run(id, 1, 0, 'Revised intro')
  const event = sqlite.prepare('INSERT INTO meeting_slide_events VALUES (?, ?, ?, ?, ?)')
  event.run(id, 1, 0, 0, 0)
  event.run(id, 2, 0, 1, 5000)
  event.run(id, 3, 1, 0, 5000) // same time: revision orders it
  sqlite.prepare('INSERT INTO meeting_deck_versions VALUES (?, 2)').run(id)
  event.run(id, 4, 2, null, 9000) // deck cleared
  return id
}

it('reads every recorded deck version and orders events by time, then revision', () => {
  const id = legacyMeeting()
  const history = getPresentationHistory(id)
  expect(history.versions).toEqual({
    0: [expect.objectContaining({ title: 'Intro' }), expect.objectContaining({ title: 'Rollout' })],
    1: [expect.objectContaining({ title: 'Revised intro' })],
    2: [],
  })
  expect(history.events.map((e) => e.revision)).toEqual([1, 2, 3, 4])
  const markers = presentationTimeline([{ tStartMs: 5000, text: 'spoken' }], history).map((row) =>
    row.kind === 'slide' ? slideMarker(row.event, row.title) : row.segment.text,
  )
  expect(markers).toEqual([
    'Slide 1 — Intro',
    'Slide 2 — Rollout',
    'Slide 1 — Revised intro',
    'spoken',
    'Slides cleared',
  ])
  expect(hasLegacySlides(id)).toBe(true)
})

it('treats the version-0 bookkeeping row alone as no history', () => {
  const id = createMeeting(createJob('A').id, 'Plain', { meetingContext: 'notes' })
  expect(getPresentationHistory(id)).toEqual({ events: [], versions: { 0: [] } })
  expect(hasLegacySlides(id)).toBe(false)
})
