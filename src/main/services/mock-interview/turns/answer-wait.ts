/** How long a candidate may stay silent before the interviewer gently prompts, once per question. */
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
  /** Candidate speech: interim or final text (starts the answer) or raw mic activity (only extends it). */
  heard(now: number, startsAnswer: boolean): void {
    if (startsAnswer) this.spoke = true
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
  /** Keep the once-only flag; restart the clock so a late answer is not instantly cut off. */
  markPrompted(now: number): void {
    this.prompted = true
    this.openedAt = now
  }
}
