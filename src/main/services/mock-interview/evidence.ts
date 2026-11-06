import type { MockResult } from '@shared/mock-interview/types'
import type { RunObservation } from '../meetings/assist/run-observation'
import type { AssistDiagnostic } from '../meetings/assist/diagnostics'
import { LatencyTracker } from '../meetings/assist/latency'
import type { LatencySummary } from '../meetings/assist/latency-summary'
import { proseWords, type RequestOutcome } from '../meetings/assist/outcomes'
import { liveTurnReport, type LiveTransition } from './report'
import type { LiveEngine } from './turns/engine'

/** Keeps only metadata and counts; Sanas answer text never enters the interviewer. Stage
 *  timing (the same redacted records the main log gets) is kept for a diagnostic summary,
 *  discarded speculations and their usage included; the practice result does not show it. */
export class MockEvidence {
  readonly requests: RequestOutcome[] = []
  readonly transitions: LiveTransition[] = []
  private readonly latency = new LatencyTracker()
  constructor(private now: () => number) {}
  assist(event: AssistDiagnostic): void {
    this.latency.assist(event)
  }
  latencySummary(): LatencySummary {
    return this.latency.summary()
  }
  run(event: RunObservation): void {
    this.latency.run(event)
    if (event.kind === 'begin') {
      this.requests.push({
        id: event.id,
        suggestionId: event.id,
        purpose: event.purpose,
        turnSpans: [...event.spans],
        stepIds: [],
        atMs: this.now(),
        status: 'pending',
        answer: '',
      })
      return
    }
    const id = event.kind === 'visible' ? event.event.suggestionId : event.id
    const r = this.requests.find((r) => r.id === id)
    if (!r) return
    if (event.kind === 'first-text') r.firstDeltaMs ??= this.now()
    else if (event.kind === 'usage') r.usage = { ...event.usage }
    else if (event.kind === 'promoted' || event.kind === 'first-readable') return
    else if (event.kind === 'settled' && event.outcome === 'discarded') {
      // an unpublished speculation was never an answer: it stays out of the per-question
      // report (its count lives in the assistance transitions)
      this.requests.splice(this.requests.indexOf(r), 1)
    } else if (event.kind === 'visible') {
      const e = event.event
      if ((e.kind === 'delta' && e.text) || e.kind === 'done') r.firstVisibleMs ??= this.now()
      if (e.kind === 'done') {
        r.deliveredMs = this.now()
        r.proseWords = proseWords(e.text)
      }
    } else {
      r.completedMs = this.now()
      r.status =
        event.outcome === 'done'
          ? 'completed'
          : event.outcome === 'noop'
            ? 'declined'
            : event.outcome === 'cancelled'
              ? 'cancelled'
              : 'failed'
    }
  }
  result(engine: LiveEngine, meetingId: number): MockResult {
    return {
      meetingId,
      plan: engine.plan.name,
      reason: engine.endReason ?? 'running',
      questions: liveTurnReport(engine.turns, this.requests, this.transitions).map((t) => ({
        id: t.id,
        text: t.text,
        followUp: t.followUp,
        fallback: t.fallback,
        producedSuggestion: t.producedSuggestion,
        firstVisibleLatencyMs: t.firstVisibleLatencyMs,
        spokenVisibleLatencyMs: t.spokenVisibleLatencyMs,
        completionLatencyMs: t.completionLatencyMs,
        words: t.requests.reduce((n, r) => n + (r.proseWords ?? 0), 0),
        reason: t.producedSuggestion
          ? 'delivered'
          : [
              t.observation,
              ...t.requests.map((r) =>
                r.status === 'pending' && engine.state === 'ended' ? 'pending-at-stop' : r.status,
              ),
              ...t.evidence.map((e) => e.reason ?? e.event),
            ].join(' · '),
      })),
    }
  }
}
