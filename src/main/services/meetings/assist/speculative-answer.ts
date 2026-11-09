import { isClassifierFailure } from '../../assistant/classifier-verdict'
import { observeAssistance, type DiscardCategory, type DiscardReason } from './diagnostics'
import type { CompletedTurn } from '../../turns/types'
import { promptMismatchCategories, type PromptMismatchCategory } from './suggestion-requests'
import type { SpeculativeHandle, SuggestionRequest, SuggestionRunner } from './suggestion-runner'

// The one automatic answer started BEFORE the classifier has spoken, so the classifier's
// latency overlaps the answer's time to first text instead of adding to it.
//
// It speculates the one neutral automatic prompt (answer-context/automatic-turn.ts), which
// serves every accepted verdict: question, request or objection, put to Me or to the room.
// When the verdict arrives, the caller builds the ordinary request again from the state at
// that moment; the speculation is published only if that request is the SAME prompt (same
// transcript window, grounding, recent answers, carried questions, model and budget).
// Anything else (a rejected verdict, a reference answer for another participant, a moved-on
// window, a changed ledger) discards it and the caller takes the ordinary path. A discarded
// speculation shows nothing and stores nothing; cooldown and ledger coverage are the
// caller's, applied only to a promoted answer.
//
// Cost: every prefilter candidate classified while the ambient lane is free pays for one
// answer call, including those the classifier then rejects. The started / promoted /
// discarded diagnostics make that spend countable.

/** The bounded category of a discard reason, emitted with the event so evidence never
 *  re-parses the reason string. */
export function discardCategory(reason: DiscardReason): DiscardCategory {
  switch (reason) {
    case 'prompt-changed':
    case 'ended-before-verdict':
    case 'not-generated':
    case 'no-snapshot':
      return reason
    case 'new-final':
    case 'user-final':
      return 'overtaken'
    case 'start':
    case 'stop-or-pause':
    case 'connection-reset':
    case 'identity-change':
      return 'invalidated'
    default:
      return isClassifierFailure(reason.slice('verdict '.length)) ? 'classifier-failed' : 'rejected'
  }
}

interface Pending {
  turn: CompletedTurn
  request: SuggestionRequest
  handle: SpeculativeHandle
}

export class SpeculativeAnswer {
  private pending: Pending | null = null
  private started = 0
  private promoted = 0
  private discarded = 0

  constructor(private runner: Pick<SuggestionRunner, 'speculate'>) {}

  /** Starts the speculation for `turn`, or returns null when speculation is unavailable, one
   *  is already pending, or the ambient lane is taken. */
  begin(turn: CompletedTurn, request: SuggestionRequest): SpeculativeHandle | null {
    if (this.pending) return null
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
    const mismatch = promptMismatchCategories(p.request, ordinary)
    if (mismatch.length) {
      this.discard(turn, 'prompt-changed', mismatch)
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
        discard: 'ended-before-verdict',
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
  discard(
    turn: CompletedTurn | null,
    reason: DiscardReason,
    mismatchCategories?: PromptMismatchCategory[],
  ): void {
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
      discard: discardCategory(reason),
      mismatchCategories,
    })
  }

  /** Running totals since the last `takeCounts`, then reset; null when none started. */
  takeCounts(): { started: number; promoted: number; discarded: number } | null {
    const out = this.started
      ? { started: this.started, promoted: this.promoted, discarded: this.discarded }
      : null
    this.started = this.promoted = this.discarded = 0
    return out
  }
}
