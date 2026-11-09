import {
  CAPTURE_MAX_INTERVAL_MS,
  CAPTURE_RETENTION_MS,
  type CaptureEndpoint,
  type CaptureUnavailable,
} from '@shared/meeting/audio-capture'

interface Anchor {
  frame: number
  lower: number
  upper: number
}

/** Ordered graph-frontier observations, bracketed solely in main's monotonic clock.
 * No interpolation/extrapolation or inferred one-way IPC delay. */
export class CaptureClock {
  private anchors: Anchor[] = []
  private reason: CaptureUnavailable = 'missing-anchors'

  invalidate(reason: CaptureUnavailable): void {
    this.anchors = []
    this.reason = reason
  }

  add(frame: number, sent: number, received: number, quantumMs: number): void {
    this.prune(received)
    const last = this.anchors.at(-1)
    if (
      ![frame, sent, received, quantumMs].every(Number.isFinite) ||
      received < sent ||
      quantumMs < 0 ||
      (last && (frame <= last.frame || sent < last.upper))
    )
      return
    this.anchors.push({ frame, lower: sent - quantumMs, upper: received })
    if (this.anchors.length > 128) this.anchors.shift()
  }

  endpoint(frame: number, now: number): CaptureEndpoint {
    this.prune(now)
    if (this.anchors.length < 2) return { status: 'unavailable', reason: this.reason }
    const left = [...this.anchors].reverse().find((a) => a.frame <= frame)
    const right = this.anchors.find((a) => a.frame >= frame)
    if (!left || !right) return { status: 'unavailable', reason: 'outside-history' }
    const lowerMs = Math.floor(left.lower),
      upperMs = Math.ceil(right.upper)
    if (upperMs - lowerMs > CAPTURE_MAX_INTERVAL_MS)
      return { status: 'unavailable', reason: 'wide-interval' }
    return { status: 'valid', lowerMs, upperMs }
  }

  private prune(now: number): void {
    const retained = this.anchors.filter((a) => now - a.lower <= CAPTURE_RETENTION_MS)
    if (retained.length < this.anchors.length) this.reason = 'outside-history'
    this.anchors = retained
  }
}
