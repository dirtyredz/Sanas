import type { Expectation, Scenario } from './scenario'
import { semanticMatch } from './semantics'
import type { RequestOutcome } from '../../../services/mock-interview/turns/request-outcome'

export interface Evidence {
  kind: Expectation['kind']
  atMs: number
  text?: string
  passed?: boolean
  requestId?: number
}
export interface CheckResult {
  id: string
  kind: string
  passed: boolean
  reason: string
  firstOutputLatencyMs?: number
  completionLatencyMs?: number
  turnCompletionLatencyMs?: number
  onsetLatencyMs?: number
  responsive?: boolean
}
export function evaluate(
  scenario: Scenario,
  evidence: Evidence[],
  starts: Map<string, number>,
  assistant: string = 'canned',
  requests: RequestOutcome[] = [],
  finalReceipts: Map<string, number> = new Map(),
  turnCompletions: Map<string, number> = new Map(),
): CheckResult[] {
  return scenario.expectations
    .filter((e) => !e.assistant || e.assistant === assistant)
    .map((e) => {
      const onset = e.after ? starts.get(e.after) : 0
      const step = scenario.steps.find((s) => s.id === e.after)
      const start =
        e.fromFinal && e.after && step?.kind === 'utterance'
          ? (finalReceipts.get(e.after) ??
            (onset === undefined ? undefined : onset + step.durationMs))
          : onset
      const matches = (v: Evidence): boolean => {
        const request = requests.find((r) => r.id === v.requestId)
        return (
          v.kind === e.kind &&
          v.passed !== false &&
          (!e.covers || (!!request && e.covers.every((id) => request.stepIds.includes(id)))) &&
          (!e.contains || !!v.text?.toLowerCase().includes(e.contains.toLowerCase())) &&
          (!e.rubric || (!!v.text && semanticMatch(e.rubric, v.text)))
        )
      }
      const found =
        start === undefined
          ? undefined
          : evidence.find(
              (v) => matches(v) && v.atMs >= start && v.atMs <= start + (e.withinMs ?? Infinity),
            )
      const late = evidence.find((v) => matches(v) && start !== undefined && v.atMs > start)
      const correlated = requests.filter(
        (r) => e.covers?.every((id) => r.stepIds.includes(id)) && r.purpose !== 'classifier',
      )
      const r = requests.find((r) => r.id === (found ?? late)?.requestId)
      const first = r?.firstVisibleMs
      return {
        id: e.id,
        kind: e.kind,
        passed: !!found,
        firstOutputLatencyMs:
          first !== undefined && start !== undefined ? first - start : undefined,
        completionLatencyMs:
          r?.completedMs !== undefined && start !== undefined ? r.completedMs - start : undefined,
        turnCompletionLatencyMs:
          r?.completedMs !== undefined && e.after && turnCompletions.has(e.after)
            ? r.completedMs - turnCompletions.get(e.after)!
            : undefined,
        onsetLatencyMs:
          r?.completedMs !== undefined && onset !== undefined ? r.completedMs - onset : undefined,
        responsive:
          e.responsivenessMs !== undefined && start !== undefined
            ? first !== undefined && first - start <= e.responsivenessMs
            : undefined,
        reason: found
          ? 'Observed within expectation window'
          : start === undefined
            ? 'Referenced step never ran'
            : late
              ? 'Delivered-late: correlated successful output missed completion deadline'
              : e.covers
                ? !correlated.length
                  ? 'Never-requested: inspect turn/classifier transitions'
                  : correlated.some((r) => r.pendingAtStop)
                    ? 'Pending-at-stop: inspect request outcome'
                    : correlated.some((r) => r.status === 'declined')
                      ? 'Declined: <none>'
                      : correlated.some((r) => r.status === 'failed' || r.status === 'cancelled')
                        ? 'Failed/cancelled: inspect request outcome'
                        : 'Wrong-content or undelivered: correlated output did not satisfy rubric'
                : 'No matching successful evidence within expectation window',
      }
    })
}
