import type { SuggestionPurpose } from '@shared/types'
import type { MalformedShape } from '../../assistant/classifier-verdict'
import { isNoSuggestion } from '../../assistant/compact-contract'
import type { ProviderUsage } from '../../assistant/types'
import type { TurnAssemblyTiming, TurnCompletion } from '../../turns/types'
import type { AssistDiagnostic } from './diagnostics'
import type { RunObservation } from './run-observation'
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

/** Why an unpublished speculation was discarded, as a bounded category. */
export type DiscardCategory =
  | 'prompt-changed'
  | 'rejected'
  | 'classifier-failed'
  | 'ended-before-verdict'
  | 'overtaken'
  | 'invalidated'
  | 'not-generated'
  | 'no-snapshot'
  | 'other'

export function discardCategory(reason: string | undefined): DiscardCategory {
  if (!reason) return 'other'
  if (reason === 'prompt-changed' || reason === 'ended-before-verdict') return reason
  if (reason === 'not-generated' || reason === 'no-snapshot') return reason
  if (reason === 'new-final' || reason === 'user-final') return 'overtaken'
  if (reason.startsWith('verdict ')) {
    const v = reason.slice('verdict '.length)
    return ['timeout', 'cancelled', 'malformed', 'provider'].includes(v)
      ? 'classifier-failed'
      : 'rejected'
  }
  if (['start', 'stop-or-pause', 'connection-reset', 'identity-change'].includes(reason))
    return 'invalidated'
  return 'other'
}

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
  shape?: MalformedShape
  classifierUsage?: ProviderUsage
  speculationRunId?: number
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

const ACCEPTED = /^(?:question|request|objection) (?:me|room|other)$/

/** True when broadcast text shows something a person can read: not the no-op, not only
 *  Markdown delimiters, filler markers or whitespace. */
export function hasReadableText(text: string): boolean {
  if (isNoSuggestion(text)) return false
  return /[\p{L}\p{N}]/u.test(text.replace(/<none>/gi, ''))
}

function capSet<K, V>(map: Map<K, V>, key: K, value: V): number {
  map.set(key, value)
  if (map.size <= OPEN_CAP) return 0
  map.delete(map.keys().next().value as K)
  return 1
}

const diff = (to?: number, from?: number): number | undefined =>
  to === undefined || from === undefined ? undefined : Math.round(to - from)

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

  assist(e: AssistDiagnostic): void {
    const turn = e.turn
    if (e.event === 'turn-completed' && turn) {
      if (turn.role === 'user') return // only other speakers' turns become candidates
      this.overflow += capSet(this.candidates, turn.id, {
        id: turn.id,
        closedAt: turn.completedAt,
        completion: turn.reason,
        assembly: turn.assembly ? { ...turn.assembly } : undefined,
      })
      return
    }
    if (e.event === 'speculation-discarded') {
      // its candidate may already be finished (a rejected verdict ends it first)
      const run = e.suggestionId === undefined ? undefined : this.runs.get(e.suggestionId)
      if (run) run.discard = discardCategory(e.reason)
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
        if (e.shape) c.shape = { ...e.shape, tokens: [...e.shape.tokens] }
        if (!this.accepted(c)) this.finishCandidate(c)
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

  private accepted(c: Candidate): boolean {
    return c.verdict !== undefined && ACCEPTED.test(c.verdict)
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
    }
  }

  private finishCandidate(c: Candidate): void {
    this.candidates.delete(c.id)
    this.push({ kind: 'candidate', classification: 'applies', ...this.candidateFields(c) })
  }

  private runRecord(r: Run, outcome: SuggestionOutcome): LatencyRecord {
    const c = r.candidateId === undefined ? undefined : this.candidates.get(r.candidateId)
    // a published answer ends its candidate; a discarded speculation leaves it for the fallback
    if (c && outcome !== 'discarded') this.candidates.delete(c.id)
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

/** Median of the defined values, or null when there are none. */
function median(values: (number | undefined)[]): number | null {
  const v = values.filter((x): x is number => x !== undefined).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2)
}

function tally(keys: (string | undefined)[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of keys) if (k !== undefined) out[k] = (out[k] ?? 0) + 1
  return out
}

export interface LatencyGroup {
  count: number
  closeToFirstReadableMs: number | null
  closeToFirstTextMs: number | null
  classifierMs: number | null
  lastFinalToFirstReadableMs: number | null
}

/** Bounded counts and medians for a report: delivered automatic answers grouped by verdict
 *  and completion path; failures, no-ops and discarded work are counted apart, never averaged
 *  in. Each candidate's verdict is counted once (a fallback run repeats it, so it is skipped). */
export function summarizeLatency(records: readonly LatencyRecord[], overflow = 0) {
  const runs = records.filter((r) => r.kind === 'run')
  const automatic = runs.filter((r) => r.classification === 'applies')
  const key = (r: LatencyRecord): string => `${r.verdict ?? 'unknown'} · ${r.path}`
  const delivered = automatic.filter((r) => r.outcome === 'done')
  const groups: Record<string, LatencyGroup> = {}
  for (const k of new Set(delivered.map(key))) {
    const g = delivered.filter((r) => key(r) === k)
    groups[k] = {
      count: g.length,
      closeToFirstReadableMs: median(g.map((r) => r.closeToFirstReadableMs)),
      closeToFirstTextMs: median(g.map((r) => r.closeToFirstTextMs)),
      classifierMs: median(g.map((r) => r.classifierMs)),
      lastFinalToFirstReadableMs: median(g.map((r) => r.lastFinalToFirstReadableMs)),
    }
  }
  const speculative = automatic.filter((r) => r.path === 'speculative')
  return {
    records: records.length,
    overflow,
    classifier: tally(
      records
        .filter((r) => r.kind === 'candidate' || r.path === 'speculative' || r.path === 'ordinary')
        .map((r) => r.verdict),
    ),
    speculation: {
      started: speculative.length,
      promoted: speculative.filter((r) => r.outcome !== 'discarded').length,
      discarded: speculative.filter((r) => r.outcome === 'discarded').length,
      discardReasons: tally(speculative.map((r) => r.discard)),
    },
    fallbacks: automatic.filter((r) => r.path === 'fallback').length,
    outcomes: tally(runs.map((r) => `${r.path} ${r.outcome}`)),
    /** Runs that settled without any provider usage: unknown, not zero. */
    missingUsage: runs.filter((r) => !r.usage).length,
    partialUsage: runs.filter((r) => r.usage?.partial).length,
    byVerdictAndPath: groups,
  }
}

export type LatencySummary = ReturnType<typeof summarizeLatency>
