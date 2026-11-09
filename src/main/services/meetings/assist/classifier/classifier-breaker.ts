export const CLASSIFIER_SUSPEND_MS = 30_000
/** One slow or failed check fails closed for its own turn; this many in a row suspend. */
export const CLASSIFIER_SUSPEND_AFTER = 3

export interface ClassifierBreakerDeps {
  now(): number
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  /** Called when suspension starts or is cleared. */
  availabilityChanged?(): void
  log(message: string): void
}

/** Circuit breaker for the turn classifier: consecutive provider/timeout failures suspend
 *  automatic answers for a while; a success or a reset closes it. Failure logs are throttled
 *  and never carry transcript text. */
export class ClassifierBreaker {
  private failures = 0
  private suspendedUntil = 0
  private timer: unknown
  private lastFailureLogAt = Number.NEGATIVE_INFINITY

  constructor(private deps: ClassifierBreakerDeps) {}

  suspended(): boolean {
    return this.deps.now() < this.suspendedUntil
  }

  recordSuccess(): void {
    this.failures = 0
  }

  /** Counts provider/timeout failures toward suspension; other failures only fail closed
   *  for their own turn. `diagnostic` is a bounded, text-free object. */
  recordFailure(reason: string, diagnostic: unknown): void {
    let suspended = false
    if (reason === 'provider' || reason === 'timeout') {
      this.failures++
      if (this.failures >= CLASSIFIER_SUSPEND_AFTER) {
        suspended = true
        this.suspendedUntil = this.deps.now() + CLASSIFIER_SUSPEND_MS
        this.deps.availabilityChanged?.()
        if (this.timer !== undefined) this.deps.clearTimer(this.timer)
        this.timer = this.deps.setTimer(() => this.reset(), CLASSIFIER_SUSPEND_MS)
        this.deps.log(
          `turn classifier ${this.failures} consecutive failures; automatic answers suspended ${CLASSIFIER_SUSPEND_MS / 1000}s`,
        )
      }
    }
    if (!suspended)
      this.logFailure(
        `turn classifier ${reason}; failing closed (${this.failures} consecutive) ${JSON.stringify(diagnostic ?? {})}`,
      )
  }

  /** Clears the count and any suspension (suspension expiry, meeting start/stop). */
  reset(): void {
    if (this.timer !== undefined) this.deps.clearTimer(this.timer)
    this.timer = undefined
    this.suspendedUntil = 0
    this.failures = 0
    this.deps.availabilityChanged?.()
  }

  private logFailure(message: string): void {
    const now = this.deps.now()
    if (now - this.lastFailureLogAt < CLASSIFIER_SUSPEND_MS) return
    this.lastFailureLogAt = now
    this.deps.log(message)
  }
}
