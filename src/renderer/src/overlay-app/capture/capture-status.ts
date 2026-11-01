import type { CaptureStatus } from '@shared/live-controls/capture'

/** What the overlay says about a capture: "Capturing…", the analysing notice while its answer
 *  streams, or a readable failure. Feedback from another meeting is never shown. */
export function captureNotice(
  status: CaptureStatus | null,
  meetingId: number | null,
  answering: boolean,
): { text: string; failed: boolean } | null {
  if (!status || status.phase === 'idle') return null
  if (status.meetingId !== null && status.meetingId !== meetingId) return null
  if (status.phase === 'analyzing' && !answering) return null
  return { text: status.message, failed: status.phase === 'failed' }
}

/** Newer statuses win; a late `getStatus` reply cannot overwrite a broadcast. */
export function newerStatus(current: CaptureStatus | null, next: CaptureStatus): CaptureStatus {
  return current && current.seq > next.seq ? current : next
}

/** A capture for this meeting is being taken right now. */
export function isCapturing(status: CaptureStatus | null, meetingId: number | null): boolean {
  return status?.phase === 'capturing' && status.meetingId === meetingId
}
