import type { SuggestionPurpose } from '@shared/types'
import { randomUUID } from 'node:crypto'
import type { MalformedShape } from '../../assistant/classifier-verdict'
import type { ProviderUsage, ProviderTiming } from '../../assistant/types'
import type { EffectiveProfile } from './run-observation'
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
import type { PromptMismatchCategory } from './suggestion-requests'

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
  providerPolicy?: Pick<Extract<ProviderTiming, { kind: 'policy' }>, 'effort' | 'thinking'>
  overflow?: number
  correlation?: 'linked' | 'missing' | 'not-applicable'
  sessionId?: string
  kind: 'run' | 'candidate' | 'visibility'
  visibility?: 'frame-after-commit' | 'hidden' | 'unselected'
  broadcastToRendererReceiptMs?: number
  candidateId?: number
  candidateTerminal?: boolean
  attemptId?: number
  runId?: number
  meetingId?: number
  storedSuggestionId?: number
  effective?: EffectiveProfile
  closeToClassifierStartMs?: number
  closeToClassifierEndMs?: number
  runToProviderRequestMs?: number
  providerRequestToFirstProtocolMs?: number
  providerRequestToFirstTextMs?: number
  attempts?: number
  retries?: number
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
  mismatchCategories?: PromptMismatchCategory[]
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
  terminalRecorded?: boolean
}

interface Run {
  providerPolicy?: LatencyRecord['providerPolicy']
  visibilityStates?: Set<string>
  mismatchCategories?: PromptMismatchCategory[]
  id: number
  meetingId: number
  effective?: EffectiveProfile
  providerStartAt?: number
  firstProtocolAt?: number
  attempts?: number
  storedSuggestionId?: number
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
  private readonly sessionId = randomUUID()
  private candidates = new Map<number, Candidate>()
  private runs = new Map<number, Run>()
  private finished: LatencyRecord[] = []
  private recentRuns = new Map<number, Run>()
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
      // Rejected candidates remain linked until their dependent run settles.
      const run = e.suggestionId === undefined ? undefined : this.runs.get(e.suggestionId)
      if (run) {
        run.discard = e.discard ?? 'other'
        run.mismatchCategories = e.mismatchCategories
      }
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
          this.turnDown(c, e.turnedDown ?? 'unknown')
        }
        return
      case 'not-classified':
      case 'not-generated':
      case 'superseded':
      case 'invalidated':
        this.turnDown(c, e.turnedDown ?? 'unknown')
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
    if (e.kind === 'renderer') {
      const r = this.runs.get(e.id) ?? this.recentRuns.get(e.id)
      if (!r || r.meetingId !== e.meetingId || r.firstReadableAt === undefined) return
      r.visibilityStates ??= new Set()
      if (r.visibilityStates.has(e.state)) return
      r.visibilityStates.add(e.state)
      this.push({
        kind: 'visibility',
        classification: r.path === 'manual' || r.path === 'next-point' ? 'n/a' : 'applies',
        meetingId: e.meetingId,
        runId: e.id,
        visibility: e.state,
        broadcastToRendererReceiptMs: diff(e.at, r.firstReadableAt),
      })
      return
    }
    if (e.kind === 'visible') return // carries text; readable timing comes as 'first-readable'
    if (e.kind === 'begin') {
      this.overflow += capSet(this.runs, e.id, {
        id: e.id,
        meetingId: e.meetingId,
        effective: e.effective,
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
    if (e.kind === 'provider') {
      if (e.timing.kind === 'policy')
        r.providerPolicy = { effort: e.timing.effort, thinking: e.timing.thinking }
      if (e.timing.kind === 'request-start') r.providerStartAt ??= e.timing.at
      else if (e.timing.kind === 'first-protocol') r.firstProtocolAt ??= e.timing.at
      else if (e.timing.kind === 'attempt') r.attempts = e.timing.attempt
      return
    }
    if (e.kind === 'first-text') r.firstTextAt ??= e.at
    else if (e.kind === 'first-readable') r.firstReadableAt ??= e.at
    else if (e.kind === 'promoted') r.promotedAt ??= e.at
    else if (e.kind === 'usage') r.usage = { ...e.usage }
    else if (e.kind === 'settled') {
      r.storedSuggestionId = e.storedSuggestionId
      this.runs.delete(r.id)
      capSet(this.recentRuns, r.id, r)
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
      closeToClassifierStartMs: diff(c.classifierStartAt, c.closedAt),
      closeToClassifierEndMs: diff(c.classifierEndAt, c.closedAt),
      classifierUsage: c.classifierUsage,
      turnedDown: c.turnedDown,
    }
  }

  /** With an open run, its settlement carries the terminal outcome. An earlier provider
   *  failure may already have a run record; a later rejection still needs its own terminal. */
  private turnDown(c: Candidate, why: TurnedDownCategory): void {
    c.turnedDown ??= why
    const open = [...this.runs.values()].some((r) => r.candidateId === c.id)
    if (open) return
    if (c.terminalRecorded) this.candidates.delete(c.id)
    else this.finishCandidate(c)
  }

  private finishCandidate(c: Candidate): void {
    this.candidates.delete(c.id)
    this.push({
      kind: 'candidate',
      candidateTerminal: true,
      classification: 'applies',
      ...this.candidateFields(c),
    })
  }

  private runRecord(r: Run, outcome: SuggestionOutcome): LatencyRecord {
    const c = r.candidateId === undefined ? undefined : this.candidates.get(r.candidateId)
    const terminal = !!c && !c.terminalRecorded && (outcome !== 'discarded' || !!c.turnedDown)
    // a published answer ends its candidate; a discarded speculation leaves it for the fallback
    if (c) {
      if (terminal) c.terminalRecorded = true
      const open = [...this.runs.values()].some((other) => other.candidateId === c.id)
      if (c.terminalRecorded && !open) this.candidates.delete(c.id)
    }
    const closedAt = c?.closedAt
    const lastFinalAt =
      closedAt === undefined || !c?.assembly ? undefined : closedAt - c.assembly.lastFinalToCloseMs
    const automatic = r.path !== 'manual' && r.path !== 'next-point'
    return {
      kind: 'run',
      classification: automatic ? 'applies' : 'n/a',
      ...(c ? this.candidateFields(c) : {}),
      candidateId: c?.id ?? r.candidateId,
      candidateTerminal: c ? terminal : undefined,
      runId: r.id,
      meetingId: r.meetingId,
      storedSuggestionId: r.storedSuggestionId,
      effective: r.effective,
      providerPolicy: r.providerPolicy,
      correlation: automatic
        ? r.candidateId === undefined
          ? 'missing'
          : 'linked'
        : 'not-applicable',
      runToProviderRequestMs: diff(r.providerStartAt, r.startAt),
      providerRequestToFirstProtocolMs: diff(r.firstProtocolAt, r.providerStartAt),
      providerRequestToFirstTextMs: diff(r.firstTextAt, r.providerStartAt),
      attempts: r.attempts,
      retries: r.attempts === undefined ? undefined : Math.max(0, r.attempts - 1),
      purpose: r.purpose,
      path: r.path,
      fallbackOf: r.fallbackOf,
      outcome,
      discard: outcome === 'discarded' ? (r.discard ?? 'other') : undefined,
      mismatchCategories: r.mismatchCategories,
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
      Object.entries({ sessionId: this.sessionId, overflow: this.overflow, ...record }).filter(
        ([, v]) => v !== undefined,
      ),
    ) as unknown as LatencyRecord
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
