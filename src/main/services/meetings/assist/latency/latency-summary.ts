import type { TurnAssemblyTiming } from '../../../turns/types'
import type { LatencyRecord } from './latency'

// Bounded counts and medians for a report, computed from finished latency records.

/** Median of the defined values (whole ms), or null when there are none. */
export function median(values: readonly (number | undefined)[]): number | null {
  const v = values.filter((x): x is number => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2)
}

/** Count, median and nearest-rank p90 of the defined values; a missing stage is never zero. */
export function distribution(values: readonly (number | undefined)[]): {
  n: number
  median: number | null
  p90: number | null
} {
  const v = values.filter((x): x is number => Number.isFinite(x)).sort((a, b) => a - b)
  return { n: v.length, median: median(v), p90: v.length ? v[Math.ceil(v.length * 0.9) - 1] : null }
}

/** The one delivered-automatic-answer rule: an automatic run that finished and showed. */
export function isDeliveredAutomatic(r: LatencyRecord): boolean {
  return r.kind === 'run' && r.classification === 'applies' && r.outcome === 'done'
}

/** The per-stage durations a trial report distributes (field names of `LatencyRecord`). */
export const STAGE_FIELDS = [
  'classifierMs',
  'closeToClassifierStartMs',
  'closeToClassifierEndMs',
  'closeToRequestMs',
  'runToProviderRequestMs',
  'providerRequestToFirstProtocolMs',
  'providerRequestToFirstTextMs',
  'requestToFirstTextMs',
  'closeToPromotionMs',
  'requestToFirstReadableMs',
  'closeToFirstReadableMs',
  'lastFinalToFirstReadableMs',
  'questionEndToFirstReadableLowerMs',
  'questionEndToFirstReadableUpperMs',
  'captureIntervalWidthMs',
] as const satisfies readonly (keyof LatencyRecord)[]

/** The turn-assembly durations a trial report distributes (field names of `TurnAssemblyTiming`). */
export const ASSEMBLY_FIELDS = [
  'lastFinalToCloseMs',
  'boundaryToCloseMs',
  'timerLatenessMs',
  'ingressToAssemblyMs',
  'audioCursorGapMs',
] as const satisfies readonly (keyof TurnAssemblyTiming)[]

export function tally(keys: readonly (string | undefined)[]): Record<string, number> {
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
  const delivered = runs.filter(isDeliveredAutomatic)
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
    captureTiming: {
      delivered: delivered.length,
      valid: delivered.filter((r) => r.captureTiming === 'valid').length,
      unavailable: delivered.filter((r) => r.captureTiming !== 'valid').length,
      reasons: tally(
        delivered
          .filter((r) => r.captureTiming !== 'valid')
          .map((r) => r.captureTimingReason ?? 'missing-metadata'),
      ),
    },
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
