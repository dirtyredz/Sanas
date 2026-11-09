import type { ProviderUsage } from '../../assistant/types'

export type RequestStatus = 'pending' | 'completed' | 'declined' | 'failed' | 'cancelled'

/** What any consumer needs to time one request: who it was, when it was received, when text
 *  first arrived and became visible, and when it completed or was delivered (all on the
 *  observer's monotonic clock). */
export interface RequestTiming {
  id: number
  suggestionId?: number
  purpose: string
  atMs: number
  firstDeltaMs?: number
  firstVisibleMs?: number
  completedMs?: number
  deliveredMs?: number
  status: RequestStatus
}

/** A request's timing plus the correlation and reporting fields only the mock-interview and
 *  rehearsal diagnostics consumers keep (scenario steps, turn spans, image digest, verdict,
 *  usage, synthetic answer text). */
export interface RequestOutcome extends RequestTiming {
  manualKind?: string
  stepIds: string[]
  turnSpans: { startMs: number; endMs: number }[]
  imageDigest?: string
  pendingAtStop?: boolean
  answer: string
  proseWords?: number
  /** Canonical verdict ("question room", "none") or "malformed"; never the reply text. */
  classifier?: string
  /** Provider usage when reported; absent means unknown, not zero. */
  usage?: ProviderUsage
}

/** Public report contains timing, IDs and counts; synthetic text stays in private profile. */
export function publicOutcome(r: RequestOutcome): Omit<RequestOutcome, 'answer'> {
  const { answer, ...safe } = r
  return {
    ...safe,
    proseWords: r.purpose === 'classifier' ? undefined : (r.proseWords ?? proseWords(answer)),
  }
}

export function proseWords(text: string): number {
  return text
    .replace(/```[^]*?```/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}
