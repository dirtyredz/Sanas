import type { CompletedTurn } from '../../../turns/types'

// Pure bookkeeping for stacked questions: the other side asks several in a row and the
// automatic lane must answer them together instead of only the newest. A question enters the
// ledger when it is admitted and leaves when a suggestion request covers it, when the user
// starts answering, or when it ages out. No timers, no I/O: the clock is passed in.

/** One suggestion covers at most this many questions: the newest plus up to two carried. */
export const QUESTION_CARRY_CAP = 3
/** Only questions asked within this long before the newest are carried forward. */
export const QUESTION_CARRY_WINDOW_MS = 30_000

export class QuestionLedger {
  private pending: CompletedTurn[] = []

  /** Remember an admitted question (idempotent). */
  record(turn: CompletedTurn, now: number): void {
    this.prune(now)
    if (!this.pending.includes(turn)) this.pending.push(turn)
  }

  /** The uncovered questions one request should address, oldest first, newest last. */
  select(now: number): CompletedTurn[] {
    this.prune(now)
    return this.pending.slice(-QUESTION_CARRY_CAP)
  }

  /** A published request covers exactly these members; unrelated questions remain pending. */
  cover(turns: readonly CompletedTurn[]): void {
    if (turns.length === 0) return
    this.pending = this.pending.filter((t) => !turns.some((q) => q.id === t.id))
  }

  clear(): void {
    this.pending = []
  }

  private prune(now: number): void {
    this.pending = this.pending.filter((t) => now - t.completedAt <= QUESTION_CARRY_WINDOW_MS)
  }
}
