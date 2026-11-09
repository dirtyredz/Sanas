import { expect, it } from 'vitest'
import { AnswerCoverage } from './answer-coverage'
import type { SuggestionEvent } from '@shared/types'

const q = { id: 1, channel: 0, text: 'Why use Node?' }
const event: SuggestionEvent = {
  suggestionId: 1,
  meetingId: 1,
  trigger: 'ambient',
  purpose: 'answer',
  kind: 'done',
  text: 'An answer',
  storedSuggestionId: 42,
}
it('normalizes only whitespace, scopes occurrences and meetings, and expires completed but not active entries', () => {
  let now = 0
  const coverage = new AnswerCoverage(() => now)
  const entry = coverage.reserve(1, [q], 'automatic', () => {})!
  expect(coverage.find(1, { ...q, text: ' Why  use Node? ' })).toBe(entry)
  expect(coverage.find(2, q)).toBeUndefined()
  expect(coverage.find(1, { ...q, id: 2 })).toBeUndefined()
  expect(coverage.find(1, { ...q, text: 'Why use Node for streaming?' })).toBeUndefined()
  now = 100_000
  expect(coverage.find(1, q)).toBe(entry)
  const lifecycle = coverage.lifecycle(entry)
  lifecycle.event(event)
  lifecycle.settled('done')
  now += 90_001
  expect(coverage.find(1, q)).toBeUndefined()
})
it('protects newer ownership and attempts from stale settlement; releases all failure outcomes', () => {
  const coverage = new AnswerCoverage(() => 0)
  for (const outcome of ['error', 'noop', 'discarded', 'cancelled', 'timeout'] as const) {
    const automatic = coverage.reserve(1, [q], 'automatic', () => {})!
    const old = coverage.lifecycle(automatic)
    const manual = coverage.reserve(1, [q], 'manual', () => {})!
    old.settled(outcome)
    expect(coverage.find(1, q)).toBe(manual)
    const stale = coverage.lifecycle(manual)
    const current = coverage.lifecycle(manual)
    stale.settled(outcome)
    expect(coverage.find(1, q)).toBe(manual)
    current.settled(outcome)
    expect(coverage.find(1, q)).toBeUndefined()
  }
})
it('reselects a full streaming snapshot and preserves the persisted id after completion', () => {
  const selected: unknown[] = []
  const coverage = new AnswerCoverage(
    () => 0,
    (e) => selected.push(e),
  )
  const entry = coverage.reserve(1, [q], 'automatic', () => {})!
  const lifecycle = coverage.lifecycle(entry)
  lifecycle.event({ ...event, kind: 'start', text: '' })
  lifecycle.event({ ...event, kind: 'delta', text: 'Hello ' })
  lifecycle.event({ ...event, kind: 'delta', text: 'world' })
  expect(coverage.reserve(1, [q], 'manual', () => {})).toBeNull()
  coverage.reuse(entry)
  expect(selected[0]).toMatchObject({ text: 'Hello world', streaming: true })
  lifecycle.event(event)
  lifecycle.settled('done')
  coverage.reuse(entry)
  expect(selected[1]).toMatchObject({ text: 'An answer', storedSuggestionId: 42, streaming: false })
})
