// Detects a socket that is open and fed PCM but has stopped answering with Results. Deepgram
// returns a Results message (empty ones included) every few seconds while audio flows, so a
// long silence from it WHILE we are sending means the connection is wedged, not quiet.

export const STALL_MS = 9_000
/** Audio counts as flowing only if a chunk was sent within this window. */
export const FLOW_WINDOW_MS = 2_000
export const CHECK_MS = 1_000

export interface WatchdogDeps {
  now(): number
  setInterval(fn: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
  onStall(): void
}

export class ResultWatchdog {
  private timer: unknown = null
  private armed = false
  private stopped = false
  private lastSendAt = 0
  private flowStartAt = 0
  private lastResultsAt = -Infinity

  constructor(private deps: WatchdogDeps) {}

  /** Call for every PCM chunk actually transmitted. The first call arms the watchdog. */
  audioSent(): void {
    if (this.stopped) return
    const now = this.deps.now()
    // a capture gap is not a stall: restart the clock when audio resumes
    if (!this.armed || now - this.lastSendAt > FLOW_WINDOW_MS) this.flowStartAt = now
    this.lastSendAt = now
    if (this.armed) return
    this.armed = true
    this.timer = this.deps.setInterval(() => this.check(), CHECK_MS)
  }

  /** A Results message arrived (an empty transcript still proves the socket is alive). */
  results(): void {
    this.lastResultsAt = this.deps.now()
  }

  stop(): void {
    this.stopped = true
    if (this.timer !== null) this.deps.clearInterval(this.timer)
    this.timer = null
  }

  private check(): void {
    const now = this.deps.now()
    if (now - this.lastSendAt > FLOW_WINDOW_MS) return
    if (now - Math.max(this.lastResultsAt, this.flowStartAt) < STALL_MS) return
    this.stop()
    this.deps.onStall()
  }
}
