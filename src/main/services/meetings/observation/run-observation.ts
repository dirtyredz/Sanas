import type { SuggestionEvent, SuggestionPurpose, SuggestionTrigger } from '@shared/types'
import type {
  SuggestionVisibility,
  SuggestionVisibilityState,
} from '@shared/live-controls/visibility'
import type { ProviderUsage, ProviderTiming } from '../../assistant/types'
import type { SuggestionOutcome, SuggestionRequest } from '../assist/suggestion-runner'
import { createObserverBus } from './observer-bus'

/** The model policy a run actually used (product profile, not provider vocabulary). */
export interface EffectiveProfile {
  model: string
  profile: 'full' | 'smart' | 'points' | 'other'
  maxTokens: number
  effort: 'low' | 'medium' | 'high'
}

// `at` is the runner's monotonic clock where the event happened (latency evidence). The
// 'visible' event carries broadcast text: consumers must not serialize it wholesale.
export type RunObservation =
  | {
      kind: 'begin'
      id: number
      meetingId: number
      purpose: SuggestionPurpose
      trigger: SuggestionTrigger
      spans: NonNullable<SuggestionRequest['diagnosticTurns']>
      /** Started unpublished alongside the classifier; it shows nothing until 'promoted'. */
      speculative?: boolean
      at: number
      effective?: EffectiveProfile
    }
  | { kind: 'visible'; event: SuggestionEvent }
  /** The provider's first non-empty text, shown or not (held no-op prefix, speculation). */
  | { kind: 'first-text'; id: number; meetingId: number; at: number }
  /** The first broadcast whose visible text is readable (not empty, the no-op or Markdown
   *  delimiters alone). Main broadcast is a proxy for visibility, not renderer paint. */
  | { kind: 'first-readable'; id: number; meetingId: number; at: number }
  | { kind: 'promoted'; id: number; meetingId: number; at: number }
  /** Provider usage for the run, partial when it did not complete. */
  | { kind: 'usage'; id: number; meetingId: number; usage: ProviderUsage }
  | { kind: 'provider'; id: number; meetingId: number; timing: ProviderTiming }
  | {
      kind: 'renderer'
      id: number
      meetingId: number
      state: SuggestionVisibilityState
      at: number
    }
  | {
      kind: 'settled'
      id: number
      meetingId: number
      outcome: SuggestionOutcome
      storedSuggestionId?: number
      at: number
    }
const bus = createObserverBus<RunObservation>()
export const subscribeRuns = bus.subscribe
export const observeRun = bus.publish

/** The renderer's visibility report for a run, published as run evidence. `windowVisible` is
 *  the only fact the caller adds: a hidden or minimized window overrides whatever the
 *  renderer claims. */
export function acknowledgeVisibility(value: SuggestionVisibility, windowVisible: boolean): void {
  observeRun({
    kind: 'renderer',
    id: value.runId,
    meetingId: value.meetingId,
    state: windowVisible ? value.state : 'hidden',
    at: performance.now(),
  })
}

const KNOWN_MODEL = /^claude-(opus|sonnet|haiku)-[0-9]+(?:-[0-9]+)*$/

/** The model policy a request will use, with any non-Claude-alias model name redacted. */
export function effectiveProfile(
  req: Pick<SuggestionRequest, 'model' | 'profile' | 'maxTokens' | 'effort'>,
): EffectiveProfile {
  return {
    model: KNOWN_MODEL.test(req.model) ? req.model : 'custom',
    profile: req.profile ?? 'other',
    maxTokens: req.maxTokens,
    effort: req.effort,
  }
}
