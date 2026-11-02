import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseScenario } from './scenario'
import { evaluate } from './assertions'

const valid = (): unknown =>
  JSON.parse(readFileSync('scripts/rehearsal/scenarios/client-checkin.json', 'utf8'))
describe('versioned scenarios', () => {
  it.each(['client-checkin', 'standup', 'presentation'])('validates the %s starter', (name) => {
    expect(
      parseScenario(JSON.parse(readFileSync(`scripts/rehearsal/scenarios/${name}.json`, 'utf8')))
        .version,
    ).toBe(1)
  })
  it('rejects unsupported versions, duplicate IDs and backwards timing', () => {
    const s = parseScenario(valid())
    expect(() => parseScenario({ ...s, version: 2 })).toThrow('version')
    expect(() => parseScenario({ ...s, steps: [s.steps[0], s.steps[0]] })).toThrow('unique')
    expect(() => parseScenario({ ...s, steps: [...s.steps].reverse() })).toThrow('ordered')
  })
  it('rejects unknown fault names, references, and invalid utterance bounds', () => {
    const s = parseScenario(valid())
    expect(() =>
      parseScenario({
        ...s,
        steps: [{ id: 'f', atMs: 0, kind: 'fault', fault: 'typo', durationMs: 1 }],
      }),
    ).toThrow('fault')
    expect(() =>
      parseScenario({
        ...s,
        expectations: [{ id: 'e', kind: 'screen', after: 'nonexistent-step' }],
      }),
    ).toThrow('Unknown')
    expect(() => parseScenario({ ...s, steps: [{ ...s.steps[1], durationMs: 600000 }] })).toThrow(
      'utterance',
    )
  })
})
it('fails missing, late, unsuccessful and wrong-content evidence', () => {
  const s = parseScenario(valid())
  s.expectations = [
    { id: 'screen', kind: 'screen', after: 'screen', withinMs: 100, contains: 'dashboard' },
  ]
  const starts = new Map([['screen', 500]])
  for (const evidence of [
    [],
    [{ kind: 'screen' as const, atMs: 601, text: 'dashboard' }],
    [{ kind: 'screen' as const, atMs: 550, text: 'dashboard', passed: false }],
    [{ kind: 'screen' as const, atMs: 550, text: 'unrelated' }],
  ])
    expect(evaluate(s, evidence, starts)[0].passed).toBe(false)
  expect(evaluate(s, [{ kind: 'screen', atMs: 550, text: 'Dashboard' }], starts)[0].passed).toBe(
    true,
  )
  expect(evaluate(s, [{ kind: 'screen', atMs: 550, text: 'Dashboard' }], new Map())[0].passed).toBe(
    false,
  )
})
