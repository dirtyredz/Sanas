import type { Expectation, Scenario } from './scenario'

export interface Evidence {
  kind: Expectation['kind']
  atMs: number
  text?: string
  passed?: boolean
}
export interface CheckResult {
  id: string
  kind: string
  passed: boolean
  reason: string
}
export function evaluate(
  scenario: Scenario,
  evidence: Evidence[],
  starts: Map<string, number>,
): CheckResult[] {
  return scenario.expectations.map((e) => {
    const start = e.after ? starts.get(e.after) : 0
    const found =
      start === undefined
        ? undefined
        : evidence.find(
            (v) =>
              v.kind === e.kind &&
              v.atMs >= start &&
              v.atMs <= start + (e.withinMs ?? Infinity) &&
              v.passed !== false &&
              (!e.contains || v.text?.toLowerCase().includes(e.contains.toLowerCase())),
          )
    return {
      id: e.id,
      kind: e.kind,
      passed: !!found,
      reason: found
        ? 'Observed within expectation window'
        : start === undefined
          ? 'Referenced step never ran'
          : 'No matching successful evidence within expectation window',
    }
  })
}
