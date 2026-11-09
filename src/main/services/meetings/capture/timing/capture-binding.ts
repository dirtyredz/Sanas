import {
  CAPTURE_PROBE_MS,
  type CaptureFrame,
  type CaptureProbe,
  type CaptureReply,
  type CaptureUnavailable,
} from '@shared/meeting/audio-capture'
import { CaptureTimingSession } from './capture-session'

export interface CaptureBindingCallbacks {
  /** The renderer's capture is gone or unusable: connection-scoped assistance must reset. */
  onLoss: () => void
  /** Accepted capture became discontinuous: the meeting must pause and reconnect capture. */
  onDiscontinuity: () => void
}

/** The meeting's binding to one renderer capture generation: owns the timing session and
 * the probe interval, routes replies, and gates which frames the meeting may ingest.
 * The meeting decides whether a bind is allowed (live session, matching meeting id). */
export class CaptureBinding {
  private readonly timing = new CaptureTimingSession()
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(private readonly callbacks: CaptureBindingCallbacks) {}

  bind(
    generation: string,
    channels: number,
    offsetMs: number,
    probe: (p: CaptureProbe) => void,
  ): boolean {
    if (!this.timing.bind(generation, channels, offsetMs)) return false
    this.timer = setInterval(() => {
      const p = this.timing.probe(performance.now())
      if (!p) return
      try {
        probe(p)
      } catch {
        this.timing.invalidate('probe-timeout')
      }
    }, CAPTURE_PROBE_MS)
    return true
  }

  reply(reply: CaptureReply, receipt: number): void {
    this.timing.reply(reply, receipt)
  }

  invalidMetadata(generation: string): void {
    if (!this.timing.matches(generation)) return
    this.timing.invalidate('missing-metadata')
    this.callbacks.onLoss()
  }

  /** The renderer ended this generation. A late stop for a retired one is ignored. */
  stop(generation: string): void {
    if (!this.timing.matches(generation)) return
    this.retire()
    this.callbacks.onLoss()
  }

  /** Drop the binding without notifying (session discarded). */
  retire(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    this.timing.stop()
  }

  /** True when the frame is accepted PCM the meeting should ingest. */
  accept(frame: CaptureFrame, receipt: number): boolean {
    const result = this.timing.accept(frame, receipt)
    if (result === 'discontinuity') this.callbacks.onDiscontinuity()
    return result === 'accepted'
  }

  invalidate(reason: CaptureUnavailable): void {
    this.timing.invalidate(reason)
  }

  endpoint(endMs: number, now: number): ReturnType<CaptureTimingSession['endpoint']> {
    return this.timing.endpoint(endMs, now)
  }
}
