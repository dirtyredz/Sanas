import type {
  ClassifierFailureReason,
  MalformedShape,
  VerdictLabel,
} from '../../assistant/classifier-verdict'
import type { ProviderUsage } from '../../assistant/types'
import type { CompletedTurn } from '../../turns/types'
import type { PromptMismatchCategory } from './suggestion-requests'

/** Why a speculation was discarded: the source's own reason (also the event's `reason`). */
export type DiscardReason =
  | 'prompt-changed'
  | 'ended-before-verdict'
  | 'not-generated'
  | 'no-snapshot'
  | 'new-final'
  | 'user-final'
  | InvalidationReason
  | `verdict ${VerdictLabel | ClassifierFailureReason}`

/** A lifecycle change that drops the candidate and its speculation. */
export type InvalidationReason = 'start' | 'stop-or-pause' | 'connection-reset' | 'identity-change'

/** A discarded speculation's reason as a bounded category (latency evidence). */
export type DiscardCategory =
  | 'prompt-changed'
  | 'rejected'
  | 'classifier-failed'
  | 'ended-before-verdict'
  | 'overtaken'
  | 'invalidated'
  | 'not-generated'
  | 'no-snapshot'
  /** Settled as discarded with no discard event seen. */
  | 'other'

/** Why a candidate ended without an answer, as a bounded category (latency evidence):
 *  `policy` = the coordinator turned it down (addressee, cooldown, no key, suspended). */
export type TurnedDownCategory =
  'policy' | 'expired' | 'prefilter' | 'superseded' | 'invalidated' | 'unknown'

/** Optional local observation only. No decisions, timers, IPC, keys or persistence. The turn
 *  carries transcript text: consumers copy allowlisted fields, never the event wholesale. */
export interface AssistDiagnostic {
  event: string
  turn?: CompletedTurn
  reason?: string
  /** The run this event concerns (answer start, speculation): correlates the candidate turn
   *  with its suggestion events and request records. */
  suggestionId?: number
  /** Monotonic time stamped where the event happened (latency evidence). */
  at?: number
  /** The classifier attempt (classifier-started, classified, classifier-usage). */
  attempt?: number
  /** classified, malformed only: the reply's shape, never its text. */
  shape?: MalformedShape
  /** classifier-usage: what the classifier call consumed. */
  usage?: ProviderUsage
  /** The candidate ends here without an answer (classified, not-classified, not-generated,
   *  superseded, invalidated): the typed reason, so evidence never parses `reason`. */
  turnedDown?: TurnedDownCategory
  /** classified only: the coordinator will answer this verdict. False for `none`, a failure,
   *  and a verdict it turns down (e.g. a question put to someone else). */
  accepted?: boolean
  /** speculation-discarded only: the category of `reason`, assigned where it was discarded. */
  discard?: DiscardCategory
  mismatchCategories?: PromptMismatchCategory[]
}
let observer: ((event: AssistDiagnostic) => void) | undefined
export function observeRehearsalAssistance(next?: (event: AssistDiagnostic) => void): void {
  if (!process.argv.includes('--rehearsal'))
    throw new Error('Rehearsal observer requires explicit mode')
  observer = next
}
const listeners = new Set<(event: AssistDiagnostic) => void>()
export function subscribeAssistance(listener: (event: AssistDiagnostic) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function observeAssistance(event: AssistDiagnostic): void {
  // Diagnostics must never alter admission or fail-closed behavior.
  try {
    observer?.(event)
    for (const listener of listeners) listener(event)
  } catch {
    /* observer is best effort */
  }
}
