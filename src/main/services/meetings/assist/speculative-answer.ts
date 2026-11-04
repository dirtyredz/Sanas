import { observeAssistance } from './diagnostics'
import type { CompletedTurn } from '../../turns/types'
import type { SpeculativeHandle, SuggestionRequest, SuggestionRunner } from './suggestion-runner'

// The one automatic answer started BEFORE the classifier has spoken, so the classifier's
// latency overlaps the answer's time to first text instead of adding to it.
//
// It speculates exactly the prompt the ordinary path would build for a `question me` verdict.
// When the verdict arrives, the caller builds the ordinary request again from the state at
// that moment; the speculation is published only if that request is the SAME prompt (same
// transcript window, grounding, recent answers, carried questions, model and budget).
// Anything else (another verdict, a moved-on window, a changed ledger) discards it and the
// caller takes the ordinary path. A discarded speculation shows nothing and stores nothing;
// cooldown and ledger coverage are the caller's, applied only to a promoted answer.
//
// Cost: every prefilter candidate classified while the ambient lane is free pays for one
// answer call, including those the classifier then rejects. The started / promoted /
// discarded diagnostics make that spend countable.

/** The verdict a speculation assumes: the common interview case, and the only one whose
 *  prompt it may be published for. */
export const SPECULATED_VERDICT = { kind: 'question', addressee: 'me' } as const

interface Pending {
  turn: CompletedTurn
  request: SuggestionRequest
  handle: SpeculativeHandle
}

/** Everything that reaches the provider, or the stored suggestion's provenance. Audio time
 *  (`atMs`) is excluded: it only stamps the stored suggestion. */
function samePrompt(a: SuggestionRequest, b: SuggestionRequest): boolean {
  const turnsA = a.diagnosticTurns ?? []
  const turnsB = b.diagnosticTurns ?? []
  return (
    a.trigger === b.trigger &&
    a.purpose === b.purpose &&
    a.apiKey === b.apiKey &&
    a.workspaceId === b.workspaceId &&
    a.model === b.model &&
    a.system === b.system &&
    a.cacheableContext === b.cacheableContext &&
    a.userContent === b.userContent &&
    a.maxTokens === b.maxTokens &&
    a.effort === b.effort &&
    a.timeoutMs === b.timeoutMs &&
    a.allowNoop === b.allowNoop &&
    a.groundingContextId === b.groundingContextId &&
    a.contextRevision === b.contextRevision &&
    !a.image &&
    !b.image &&
    turnsA.length === turnsB.length &&
    turnsA.every((t, i) => t === turnsB[i])
  )
}

export class SpeculativeAnswer {
  private pending: Pending | null = null
  private started = 0
  private promoted = 0
  private discarded = 0

  constructor(private runner: Partial<Pick<SuggestionRunner, 'speculate'>>) {}

  /** Starts the speculation for `turn`, or returns null when speculation is unavailable, one
   *  is already pending, or the ambient lane is taken. */
  begin(turn: CompletedTurn, request: SuggestionRequest): SpeculativeHandle | null {
    if (this.pending || !this.runner.speculate) return null
    const handle = this.runner.speculate(request)
    if (!handle) return null
    this.pending = { turn, request, handle }
    this.started++
    observeAssistance({
      event: 'speculation-started',
      turn,
      suggestionId: handle.id,
    })
    return handle
  }

  pendingFor(turn: CompletedTurn): boolean {
    return this.pending?.turn === turn
  }

  /** The classifier accepted `turn` and the ordinary path would now send `ordinary`.
   *  Returns the published speculation when it is that same request and still running or
   *  held; otherwise discards it (freeing the lane at once) and returns null. */
  promote(turn: CompletedTurn, ordinary: SuggestionRequest): SpeculativeHandle | null {
    const p = this.pending
    if (!p || p.turn !== turn) return null
    if (!samePrompt(p.request, ordinary)) {
      this.discard(turn, 'prompt-changed')
      return null
    }
    this.pending = null
    if (!p.handle.promote()) {
      this.discarded++
      observeAssistance({
        event: 'speculation-discarded',
        turn,
        suggestionId: p.handle.id,
        reason: 'ended-before-verdict',
      })
      return null
    }
    this.promoted++
    observeAssistance({
      event: 'speculation-promoted',
      turn,
      suggestionId: p.handle.id,
    })
    return p.handle
  }

  /** Discards the pending speculation (for `turn` only, when given). Idempotent. */
  discard(turn: CompletedTurn | null, reason: string): void {
    const p = this.pending
    if (!p || (turn && p.turn !== turn)) return
    this.pending = null
    p.handle.cancel()
    this.discarded++
    observeAssistance({
      event: 'speculation-discarded',
      turn: p.turn,
      suggestionId: p.handle.id,
      reason,
    })
  }

  /** Running totals since the last `takeCounts`, then reset; null when none started. */
  takeCounts(): string | null {
    const out = this.started
      ? `started=${this.started} promoted=${this.promoted} discarded=${this.discarded}`
      : null
    this.started = this.promoted = this.discarded = 0
    return out
  }
}
