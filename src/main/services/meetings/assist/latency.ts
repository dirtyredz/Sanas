import type { SuggestionPurpose } from '@shared/types'
import type { MalformedShape } from '../../assistant/classifier-verdict'
import type { ProviderUsage } from '../../assistant/types'
import type { TurnAssemblyTiming, TurnCompletion } from '../../turns/types'
import {
  subscribeAssistance,
  type AssistDiagnostic,
  type DiscardCategory,
  type TurnedDownCategory,
} from './diagnostics'
import { summarizeLatency, type LatencySummary } from './latency-summary'
import { subscribeRuns, type RunObservation } from './run-observation'
import type { SuggestionOutcome } from './suggestion-runner'

// Stage timing for automatic and requested answers, as redacted evidence.
//
// It listens to the two existing observation streams (assistance decisions and suggestion
// runs), whose events are stamped at their source with the monotonic clock, and correlates
// them by candidate (completed turn id), classifier attempt and run (suggestion id). What it
// keeps is ALLOWLISTED: ids, enums, canonical verdicts, durations, counts and provider usage.
// Never transcript or answer text, speaker names, prompts, raw provider output or error
// bodies, even though the events it reads carry some of them.
//
// Bounded: open candidates/runs and finished records are capped (oldest dropped, counted in
// `overflow`), and nothing is logged per delta. The main process logs one line per finished
// record (live-session.ts); rehearsal and Mock read the same records into their evidence.
//
// Durations only, no absolute times: monotonic origins differ between processes and runs, and
// audio-clock values (the turn's own timing proxy) are never mixed with monotonic ones.

const OPEN_CAP = 64
const RECORD_CAP = 200

export type RunPath = 'speculative' | 'ordinary' | 'fallback' | 'manual' | 'next-point'

/** One finished record: an answer run (with its candidate's stages when it had one), or a
 *  candidate the classifier did not accept. */
export interface LatencyRecord {
  kind: 'run' | 'candidate'
  candidateId?: number
  attemptId?: number
  runId?: number
  purpose?: SuggestionPurpose
  path?: RunPath
  /** 'n/a' for Answer now and next points, which bypass the classifier. */
  classification: 'applies' | 'n/a'
  /** Canonical verdict ("question room", "none") or failure category ("timeout"). */
  verdict?: string
  shape?: MalformedShape
  completion?: TurnCompletion
  assembly?: TurnAssemblyTiming
  /** The discarded speculation this ordinary run replaced. */
  fallbackOf?: number
  outcome?: SuggestionOutcome
  discard?: DiscardCategory
  /** The candidate ended without an answer: why (policy = the coordinator turned it down). */
  turnedDown?: TurnedDownCategory
  classifierMs?: number
  /** Turn close → this run's request start. */
  closeToRequestMs?: number
  requestToFirstTextMs?: number
  closeToFirstTextMs?: number
  closeToPromotionMs?: number
  /** Turn close → the first broadcast with readable content: the automatic benchmark. Main
   *  broadcast is a proxy for visibility, not renderer paint. */
  closeToFirstReadableMs?: number
  requestToFirstReadableMs?: number
  /** The last final's arrival → first readable: includes the turn-close delay. */
  lastFinalToFirstReadableMs?: number
  usage?: ProviderUsage
  classifierUsage?: ProviderUsage
}

interface Candidate {
  id: number
  closedAt?: number
  completion?: TurnCompletion
  assembly?: TurnAssemblyTiming
  attemptId?: number
  classifierStartAt?: number
  classifierEndAt?: number
  verdict?: string
  /** The classifier named something to answer (the event's typed flag). */
  accepted?: boolean
  shape?: MalformedShape
  classifierUsage?: ProviderUsage
  speculationRunId?: number
  /** Ended without an answer; recorded when its last open run settles, else at once. */
  turnedDown?: TurnedDownCategory
  /** A run record already carries this candidate's stages (a discarded speculation). */
  hadRun?: boolean
}

interface Run {
  id: number
  purpose: SuggestionPurpose
  path: RunPath
  candidateId?: number
  fallbackOf?: number
  startAt?: number
  firstTextAt?: number
  promotedAt?: number
  firstReadableAt?: number
  discard?: DiscardCategory
  usage?: ProviderUsage
}

function capSet<K, V>(map: Map<K, V>, key: K, value: V): number {
  map.set(key, value)
  if (map.size <= OPEN_CAP) return 0
  map.delete(map.keys().next().value as K)
  return 1
}

const diff = (to?: number, from?: number): number | undefined =>
  to === undefined || from === undefined ? undefined : Math.round(to - from)

/** Whole milliseconds: sub-millisecond monotonic noise is not evidence. */
const rounded = (a: TurnAssemblyTiming): TurnAssemblyTiming =>
  Object.fromEntries(
    Object.entries(a).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : v]),
  ) as unknown as TurnAssemblyTiming

export class LatencyTracker {
  private candidates = new Map<number, Candidate>()
  private runs = new Map<number, Run>()
  private finished: LatencyRecord[] = []
  /** Records or open entries dropped to stay bounded. */
  overflow = 0

  /** `onRecord` sees each finished record once (the main log); it must not throw back. */
  constructor(private onRecord?: (record: LatencyRecord) => void) {}

  records(): readonly LatencyRecord[] {
    return this.finished
  }

  /** Bounded counts and medians over the finished records (see latency-summary.ts). */
  summary(): LatencySummary {
    return summarizeLatency(this.finished, this.overflow)
  }

  assist(e: AssistDiagnostic): void {
    const turn = e.turn
    if (e.event === 'turn-completed' && turn) {
      if (turn.role === 'user') return // only other speakers' turns become candidates
      this.overflow += capSet(this.candidates, turn.id, {
        id: turn.id,
        closedAt: turn.completedAt,
        completion: turn.reason,
        assembly: turn.assembly ? rounded(turn.assembly) : undefined,
      })
      return
    }
    if (e.event === 'speculation-discarded') {
      // its candidate may already be finished (a rejected verdict ends it first)
      const run = e.suggestionId === undefined ? undefined : this.runs.get(e.suggestionId)
      if (run) run.discard = e.discard ?? 'other'
      return
    }
    const c = turn ? this.candidates.get(turn.id) : undefined
    if (!c) return
    switch (e.event) {
      case 'classifier-started':
        c.attemptId = e.attempt
        c.classifierStartAt = e.at
        return
      case 'classified':
        c.classifierEndAt = e.at
        c.verdict = typeof e.reason === 'string' ? e.reason.slice(0, 24) : undefined
        c.accepted = e.accepted === true
        if (e.shape) c.shape = { ...e.shape, tokens: [...e.shape.tokens] }
        if (!c.accepted) {
          c.turnedDown = e.turnedDown
          this.finishCandidate(c)
        }
        return
      case 'not-classified':
      case 'not-generated':
      case 'superseded':
      case 'invalidated':
        this.turnDown(c, e.turnedDown ?? 'policy')
        return
      case 'classifier-usage':
        if (e.usage) c.classifierUsage = { ...e.usage }
        return
      case 'speculation-started':
        c.speculationRunId = e.suggestionId
        this.link(e.suggestionId, c, 'speculative')
        return
      case 'answer-started':
        if (e.reason === 'ordinary')
          this.link(e.suggestionId, c, c.speculationRunId === undefined ? 'ordinary' : 'fallback')
        return
    }
  }

  run(e: RunObservation): void {
    if (e.kind === 'visible') return // carries text; readable timing comes as 'first-readable'
    if (e.kind === 'begin') {
      this.overflow += capSet(this.runs, e.id, {
        id: e.id,
        purpose: e.purpose,
        path: e.speculative
          ? 'speculative'
          : e.trigger === 'hotkey'
            ? 'manual'
            : e.purpose === 'next-point'
              ? 'next-point'
              : 'ordinary',
        startAt: e.at,
      })
      return
    }
    const r = this.runs.get(e.id)
    if (!r) return
    if (e.kind === 'first-text') r.firstTextAt ??= e.at
    else if (e.kind === 'first-readable') r.firstReadableAt ??= e.at
    else if (e.kind === 'promoted') r.promotedAt ??= e.at
    else if (e.kind === 'usage') r.usage = { ...e.usage }
    else if (e.kind === 'settled') {
      this.runs.delete(r.id)
      this.push(this.runRecord(r, e.outcome))
    }
  }

  private link(runId: number | undefined, c: Candidate, path: RunPath): void {
    const run = runId === undefined ? undefined : this.runs.get(runId)
    if (!run) return
    run.candidateId = c.id
    run.path = path
    if (path === 'fallback') run.fallbackOf = c.speculationRunId
  }

  private candidateFields(c: Candidate): Partial<LatencyRecord> {
    return {
      candidateId: c.id,
      attemptId: c.attemptId,
      verdict: c.verdict,
      shape: c.shape,
      completion: c.completion,
      assembly: c.assembly,
      classifierMs: diff(c.classifierEndAt, c.classifierStartAt),
      classifierUsage: c.classifierUsage,
      turnedDown: c.turnedDown,
    }
  }

  /** A candidate that will get no answer. With a run still open, that run's record carries it
   *  (see runRecord); with a discarded run already recorded, nothing more is owed; otherwise
   *  the candidate is its own record. Already finished candidates are not in the map. */
  private turnDown(c: Candidate, why: TurnedDownCategory): void {
    c.turnedDown ??= why
    const open = [...this.runs.values()].some((r) => r.candidateId === c.id)
    if (open) return
    if (c.hadRun) this.candidates.delete(c.id)
    else this.finishCandidate(c)
  }

  private finishCandidate(c: Candidate): void {
    this.candidates.delete(c.id)
    this.push({ kind: 'candidate', classification: 'applies', ...this.candidateFields(c) })
  }

  private runRecord(r: Run, outcome: SuggestionOutcome): LatencyRecord {
    const c = r.candidateId === undefined ? undefined : this.candidates.get(r.candidateId)
    // a published answer ends its candidate; a discarded speculation leaves it for the fallback
    if (c) {
      if (outcome !== 'discarded' || c.turnedDown) this.candidates.delete(c.id)
      else c.hadRun = true
    }
    const closedAt = c?.closedAt
    const lastFinalAt =
      closedAt === undefined || !c?.assembly ? undefined : closedAt - c.assembly.lastFinalToCloseMs
    const automatic = r.path !== 'manual' && r.path !== 'next-point'
    return {
      kind: 'run',
      classification: automatic ? 'applies' : 'n/a',
      ...(c ? this.candidateFields(c) : {}),
      runId: r.id,
      purpose: r.purpose,
      path: r.path,
      fallbackOf: r.fallbackOf,
      outcome,
      discard: outcome === 'discarded' ? (r.discard ?? 'other') : undefined,
      closeToRequestMs: diff(r.startAt, closedAt),
      requestToFirstTextMs: diff(r.firstTextAt, r.startAt),
      closeToFirstTextMs: diff(r.firstTextAt, closedAt),
      closeToPromotionMs: diff(r.promotedAt, closedAt),
      closeToFirstReadableMs: diff(r.firstReadableAt, closedAt),
      requestToFirstReadableMs: diff(r.firstReadableAt, r.startAt),
      lastFinalToFirstReadableMs: diff(r.firstReadableAt, lastFinalAt),
      usage: r.usage,
    }
  }

  private push(record: LatencyRecord): void {
    const clean = Object.fromEntries(
      Object.entries(record).filter(([, v]) => v !== undefined),
    ) as LatencyRecord
    this.finished.push(clean)
    if (this.finished.length > RECORD_CAP) {
      this.finished.shift()
      this.overflow++
    }
    try {
      this.onRecord?.(clean)
    } catch {
      /* evidence is best effort */
    }
  }
}

/** A tracker fed by the process-wide assistance and run observation streams, for callers
 *  that own the whole process's evidence (main log, rehearsal). `stop` unsubscribes both. */
export function observeLatency(onRecord?: (record: LatencyRecord) => void): {
  tracker: LatencyTracker
  summary(): LatencySummary
  stop(): void
} {
  const tracker = new LatencyTracker(onRecord)
  const unsubscribe = [
    subscribeAssistance((e) => tracker.assist(e)),
    subscribeRuns((e) => tracker.run(e)),
  ]
  return {
    tracker,
    summary: () => tracker.summary(),
    stop: () => {
      for (const off of unsubscribe) off()
    },
  }
}
