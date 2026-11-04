import { expect, it, vi } from 'vitest'
import { validatePlan } from './plan'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
const loadLivePlan = (path: string) => validatePlan(JSON.parse(readFileSync(path, 'utf8')))

it.each(['interview', 'client-qa'])('loads the shipped %s plan and local fixtures', (name) => {
  const p = loadLivePlan(`src/main/services/mock-interview/plans/${name}.json`)
  expect(p.silenceMs).toBe(4000)
  expect(p.topics.length).toBeGreaterThan(3)
  expect(p.topics.some((t) => t.screen)).toBe(true)
})
it('rejects scripted plans, duplicate IDs, unbounded durations and missing fixtures', () => {
  const p = loadLivePlan('src/main/services/mock-interview/plans/interview.json')
  expect(() => loadLivePlan('scripts/rehearsal/scenarios/mock-interview.json')).toThrow(
    'Invalid live plan',
  )
  expect(() => validatePlan({ ...p, topics: [p.topics[0], p.topics[0]] })).toThrow()
  expect(() => validatePlan({ ...p, durationMs: Infinity })).toThrow()
  expect(() => validatePlan({ ...p, silenceMs: 0 })).toThrow()
  expect(() => validatePlan({ ...p, topics: [{ ...p.topics[0], screen: 'missing.png' }] })).toThrow(
    'fixture',
  )
})

vi.mock('./fixtures/architecture.png?asset', () => ({
  default: process.cwd() + '/src/main/services/mock-interview/fixtures/architecture.png',
}))

vi.mock('./fixtures/coding-boundary.png?asset', () => ({
  default: process.cwd() + '/src/main/services/mock-interview/fixtures/coding-boundary.png',
}))

vi.mock('./fixtures/coding-duplicates.png?asset', () => ({
  default: process.cwd() + '/src/main/services/mock-interview/fixtures/coding-duplicates.png',
}))

vi.mock('./fixtures/coding-sql.png?asset', () => ({
  default: process.cwd() + '/src/main/services/mock-interview/fixtures/coding-sql.png',
}))

vi.mock('./fixtures/dashboard.png?asset', () => ({
  default: process.cwd() + '/src/main/services/mock-interview/fixtures/dashboard.png',
}))

it('resolves every bundled plan and rehearsal scenario screen reference', async () => {
  const { plans, fixtureData } = await import('./catalog')
  for (const plan of Object.values(plans))
    for (const topic of plan.topics)
      if (topic.screen) expect(fixtureData(topic.screen)).toMatch(/^data:image\/png;base64,iVBOR/)
  const { loadScenario } = await import('../../rehearsal/scenario/scenario')
  for (const file of readdirSync('scripts/rehearsal/scenarios').filter((f) =>
    f.endsWith('.json'),
  )) {
    for (const step of loadScenario('scripts/rehearsal/scenarios/' + file).steps)
      if (step.kind === 'screen') expect(existsSync(step.image), step.image).toBe(true)
  }
})
it('validates bundled JSON when the production catalog is loaded', async () => {
  vi.resetModules()
  vi.doMock('./plans/interview.json', () => ({ default: { version: 99 } }))
  try {
    await expect(import('./catalog')).rejects.toThrow('Invalid live plan')
  } finally {
    vi.doUnmock('./plans/interview.json')
    vi.resetModules()
  }
})
