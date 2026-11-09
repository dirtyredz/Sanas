/**
 * How long a candidate may stay silent before the interviewer gently prompts, once per question.
 * A deliberate global (docs/DECISIONS.md), unlike `silenceMs` which is per plan.
 */
export const IDLE_PROMPT_MS = 30000
export const IDLE_PROMPT_TEXT = 'Take your time — whenever you are ready.'

/**
 * The wait after an interviewer question: silence only counts once the candidate has spoken.
 * Pure clock bookkeeping; callers pass candidate-role evidence only, never interviewer speech.
 */
export class AnswerWait {
  private openedAt = 0
  private lastActivity = 0
  private spoke = false
  private prompted = false

  open(now: number): void {
    this.openedAt = this.lastActivity = now
    this.spoke = false
    this.prompted = false
  }
  /** Candidate interim or final text: the answer has begun. */
  begin(now: number): void {
    this.spoke = true
    this.lastActivity = now
  }
  /** Raw candidate-mic activity: extends an answer already begun, never starts one. */
  extend(now: number): void {
    this.lastActivity = now
  }
  /** Forget that the candidate spoke (provider reset). */
  clearSpoke(): void {
    this.spoke = false
  }
  advanceDue(now: number, silenceMs: number): boolean {
    return this.spoke && now - this.lastActivity >= silenceMs
  }
  promptDue(now: number): boolean {
    return !this.spoke && !this.prompted && now - this.openedAt >= IDLE_PROMPT_MS
  }
  /** The idle nudge is spoken at most once per question. */
  markPrompted(): void {
    this.prompted = true
  }
}
