import { publicOutcome, type RequestOutcome } from '../meetings/assist/outcomes'
import type { LiveTurn } from './engine'

export interface LiveTransition {
  atMs: number
  event: string
  reason?: string
  span?: { startMs: number; endMs: number }
}
const overlaps = (
  a: { startMs: number; endMs: number },
  b: { startMs: number; endMs: number },
): boolean => a.startMs < b.endMs && a.endMs > b.startMs

/** STT audio spans, not request receipt time, associate delayed and carried requests. */
export function liveTurnReport(
  turns: LiveTurn[],
  requests: RequestOutcome[],
  transitions: LiveTransition[],
) {
  return turns.map((t) => {
    const correlated = requests.filter((r) =>
      r.turnSpans.some((s) => t.spans.some((f) => overlaps(s, f))),
    )
    const answers = correlated.filter((r) => r.purpose === 'answer')
    const visible = answers.flatMap((r) =>
      r.firstVisibleMs === undefined ? [] : [r.firstVisibleMs],
    )
    const completed = answers.flatMap((r) => (r.deliveredMs === undefined ? [] : [r.deliveredMs]))
    return {
      ...t,
      interviewerWords: t.text.trim().split(/\s+/).length,
      producedSuggestion: completed.length > 0,
      firstVisibleLatencyMs:
        t.finalMs === undefined || !visible.length ? null : Math.min(...visible) - t.finalMs,
      completionLatencyMs:
        t.finalMs === undefined || !completed.length ? null : Math.min(...completed) - t.finalMs,
      requests: correlated.map(publicOutcome),
      evidence: transitions.filter((e) => e.span && t.spans.some((s) => overlaps(s, e.span!))),
      observation: !t.spans.length
        ? 'no-loopback-final-observed'
        : !correlated.length
          ? 'no-correlated-request'
          : !completed.length
            ? 'request-without-delivered-suggestion'
            : 'delivered',
    }
  })
}
