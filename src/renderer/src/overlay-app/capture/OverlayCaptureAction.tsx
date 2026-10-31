import { useEffect, useState } from 'react'
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

export function OverlayCaptureAction({
  meetingId,
  live,
  answering,
}: {
  meetingId: number | null
  live: boolean
  /** A requested answer is streaming (the capture answer, once admitted). */
  answering: boolean
}): React.JSX.Element {
  const [status, setStatus] = useState<CaptureStatus | null>(null)
  useEffect(() => {
    const remove = window.sanas.screenCapture.onStatus((next) =>
      setStatus((current) => newerStatus(current, next)),
    )
    // a first-use shortcut can broadcast before this overlay existed: fetch what was missed
    void window.sanas.screenCapture
      .getStatus()
      .then((next) => setStatus((current) => newerStatus(current, next)))
      .catch(() => {})
    return remove
  }, [])
  const notice = captureNotice(status, meetingId, answering)
  const capturing = status?.phase === 'capturing' && status.meetingId === meetingId
  return (
    <>
      <button
        className="capture-screen"
        title="Capture the screen under the overlay and explain it"
        disabled={!live || meetingId === null || answering || capturing}
        onClick={() => {
          if (meetingId !== null) void window.sanas.screenCapture.capture(meetingId).catch(() => {})
        }}
      >
        Capture screen
      </button>
      {notice && (
        <p className={`capture-status ${notice.failed ? 'warn' : 'muted'}`} role="status">
          {notice.text}
        </p>
      )}
    </>
  )
}
