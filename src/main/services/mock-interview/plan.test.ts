import { expect, it } from 'vitest'
import { loadLivePlan, parseLivePlan } from './plan'

it.each(['interview', 'client-qa'])('loads the shipped %s plan and local fixtures', (name) => {
  const p = loadLivePlan(`src/main/services/mock-interview/plans/${name}.json`)
  expect(p.silenceMs).toBe(2500)
  expect(p.topics.length).toBeGreaterThan(3)
  expect(p.topics.some((t) => t.screen)).toBe(true)
})
it('rejects scripted plans, duplicate IDs, unbounded durations and missing fixtures', () => {
  const p = loadLivePlan('src/main/services/mock-interview/plans/interview.json')
  expect(() => loadLivePlan('scripts/rehearsal/scenarios/mock-interview.json')).toThrow(
    'Invalid live plan',
  )
  expect(() => parseLivePlan({ ...p, topics: [p.topics[0], p.topics[0]] }, '.')).toThrow()
  expect(() => parseLivePlan({ ...p, durationMs: Infinity }, '.')).toThrow()
  expect(() => parseLivePlan({ ...p, silenceMs: 0 }, '.')).toThrow()
  expect(() =>
    parseLivePlan({ ...p, topics: [{ ...p.topics[0], screen: 'missing.png' }] }, '.'),
  ).toThrow('fixture')
})
