import type { CaptureStatus } from '@shared/live-controls/capture'

/**
 * The capture feedback channel: holds the latest status (so an overlay that mounts after a
 * broadcast can read it), stamps a monotonically increasing `seq`, and forwards each update to
 * the sink. CaptureRequests decides *what* happened; this only records and publishes it.
 */
export class CaptureStatusBroadcaster {
  private current: CaptureStatus = { meetingId: null, phase: 'idle', message: '', seq: 0 }

  constructor(private readonly publish: (status: CaptureStatus) => void) {}

  get(): CaptureStatus {
    return this.current
  }

  set(meetingId: number | null, phase: CaptureStatus['phase'], text = ''): void {
    this.current = { meetingId, phase, message: text, seq: this.current.seq + 1 }
    this.publish(this.current)
  }

  /** Back to idle, but only when there is stale feedback to clear (no needless seq bump). */
  clear(): void {
    if (this.current.phase !== 'idle') this.set(null, 'idle')
  }
}
