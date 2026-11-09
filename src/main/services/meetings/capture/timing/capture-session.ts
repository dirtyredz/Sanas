import {
  CAPTURE_TIMEOUT_MS,
  type CaptureFrame,
  type CaptureProbe,
  type CaptureReply,
  type CaptureUnavailable,
} from '@shared/meeting/audio-capture'
import { CaptureClock } from './capture-clock'

/** Meeting-owned calibration. Only accepted capture advances the WAV/sample correspondence;
 * provider replay never calls this object. Probe replies cannot establish capture zero. */
export class CaptureTimingSession {
  readonly clock = new CaptureClock()
  private generation?: string
  private channels = 1
  private sequence?: number
  private end?: number
  private sourceEnd?: number
  private sourceRate?: number
  private origin?: number
  private offset = 0
  private nonce = 0
  private pending?: { nonce: number; sent: number }

  bind(generation: string, channels: number, offsetMs: number): boolean {
    if (this.generation) return false
    this.generation = generation
    this.channels = channels
    this.offset = offsetMs * 16
    this.sequence = this.end = this.sourceEnd = this.sourceRate = this.origin = undefined
    this.invalidate('missing-anchors')
    return true
  }

  matches(generation: string): boolean {
    return generation === this.generation
  }

  stop(): void {
    this.generation = undefined
    this.invalidate('stopped')
  }

  invalidate(reason: CaptureUnavailable): void {
    this.pending = undefined
    this.clock.invalidate(reason)
  }

  accept(frame: CaptureFrame, receipt: number): 'accepted' | 'stale' | 'discontinuity' {
    if (!this.matches(frame.generation)) return 'stale'
    if (
      frame.channels !== this.channels ||
      (this.sequence !== undefined &&
        (frame.sequence !== this.sequence + 1 ||
          frame.startFrame !== this.end ||
          frame.sourceRate !== this.sourceRate ||
          frame.sourceEndFrame <= this.sourceEnd!))
    ) {
      this.invalidate('discontinuity')
      return 'discontinuity'
    }
    this.origin ??= frame.startFrame
    this.sequence = frame.sequence
    this.end = frame.endFrame
    this.sourceEnd = frame.sourceEndFrame
    this.sourceRate = frame.sourceRate
    if (this.pending && receipt - this.pending.sent > CAPTURE_TIMEOUT_MS)
      this.invalidate('probe-timeout')
    return 'accepted'
  }

  probe(now: number): CaptureProbe | undefined {
    if (!this.generation || this.origin === undefined) return
    if (this.pending && now - this.pending.sent >= CAPTURE_TIMEOUT_MS)
      this.invalidate('probe-timeout')
    if (this.pending) return
    this.pending = { nonce: ++this.nonce, sent: now }
    return { generation: this.generation, nonce: this.nonce }
  }

  reply(reply: CaptureReply, received: number): void {
    const pending = this.pending
    if (!pending || !this.matches(reply.generation) || pending.nonce !== reply.nonce) return
    this.pending = undefined
    if (received - pending.sent > CAPTURE_TIMEOUT_MS) {
      this.invalidate('probe-timeout')
      return
    }
    if (
      this.origin === undefined ||
      reply.sourceRate !== this.sourceRate ||
      reply.outputFrame < this.origin ||
      reply.outputFrame < (this.end ?? 0) ||
      Math.abs((reply.sourceFrame / reply.sourceRate) * 16000 - reply.outputFrame) > 2
    ) {
      this.invalidate('discontinuity')
      return
    }
    // The frontier belongs to the process quantum just completed, plus two output
    // samples for interpolation/rounding. Browser/device latency is outside this reference.
    this.clock.add(
      reply.outputFrame,
      pending.sent,
      received,
      (reply.quantumFrames / reply.sourceRate) * 1000 + 2 / 16,
    )
  }

  endpoint(endMs: number, now: number) {
    if (this.origin === undefined)
      return { status: 'unavailable', reason: 'missing-metadata' } as const
    return this.clock.endpoint(endMs * 16 - this.offset + this.origin, now)
  }
}
