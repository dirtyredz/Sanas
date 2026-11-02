import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { parseScenario } from './scenario'
import { evaluate } from './assertions'
import { parseLivePlan } from './live/plan'

const valid = (): unknown =>
  JSON.parse(readFileSync('scripts/rehearsal/scenarios/client-checkin.json', 'utf8'))
it('scopes model content checks explicitly while retaining shared delivery checks', () => {
  const s = parseScenario(valid())
  s.expectations = [
    { id: 'delivery', kind: 'screen' },
    { id: 'concept', kind: 'screen', contains: 'boundary', assistant: 'claude' },
  ]
  const evidence = [{ kind: 'screen' as const, atMs: 1, text: 'canned response' }]
  expect(evaluate(s, evidence, new Map(), 'canned').map((c) => c.id)).toEqual(['delivery'])
  expect(evaluate(s, evidence, new Map(), 'claude').map((c) => c.passed)).toEqual([true, false])
  evidence[0].text = 'BOUNDARY error'
  expect(evaluate(s, evidence, new Map(), 'claude').every((c) => c.passed)).toBe(true)
  expect(evaluate(s, [], new Map(), 'canned')[0].passed).toBe(false)
  expect(() =>
    parseScenario({ ...s, expectations: [{ ...s.expectations[0], assistant: 'typo' }] }),
  ).toThrow('Invalid expectation assistant')
})
describe('versioned scenarios', () => {
  it.each(readdirSync('scripts/rehearsal/scenarios').filter((f) => f.endsWith('.json')))(
    'validates the %s scenario',
    (file) => {
      const raw = JSON.parse(readFileSync(`scripts/rehearsal/scenarios/${file}`, 'utf8'))
      const plan =
        raw.mode === 'live' ? parseLivePlan(raw, 'scripts/rehearsal/scenarios') : parseScenario(raw)
      expect(plan.version).toBe(1)
    },
  )
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
