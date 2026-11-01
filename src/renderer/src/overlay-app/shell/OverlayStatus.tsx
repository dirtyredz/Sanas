import type { MeetingState } from '@shared/types'
import type { CaptureStatusModel } from '../capture/useCaptureStatus'

/** The first clause of a status message — what fits on one line before "Details". */
export function shortStatus(text: string): string {
  const clause = text.split(/\s[—–-]\s|(?<=[.!?])\s/)[0].trim()
  return clause.replace(/[.!?]$/, '')
}

function Expandable({ tone, text }: { tone: 'warn' | 'error'; text: string }): React.JSX.Element {
  const short = shortStatus(text)
  if (short === text.trim().replace(/[.!?]$/, ''))
    return <p className={`ov-status ov-status--${tone}`}>{text}</p>
  return (
    <details className={`ov-status ov-status--${tone}`}>
      <summary>
        <span className="ov-status-short">{short}</span>
        <span className="ov-status-more">Details</span>
      </summary>
      <p>{text}</p>
    </details>
  )
}

/** Persistent conditions, outside every workspace: the meeting error, the system-audio
 *  warning (never dismissed locally — it clears when main clears it) and capture progress.
 *  Announced politely; streamed answer text is not. */
export function OverlayStatus({
  meeting,
  capture,
}: {
  meeting: MeetingState
  capture: CaptureStatusModel
}): React.JSX.Element | null {
  const error = meeting.error ?? (meeting.status === 'error' ? 'Sanas hit an error.' : '')
  if (!error && !meeting.captureWarning && !capture.notice) return null
  return (
    <div className="overlay-status" aria-live="polite">
      {error && <Expandable tone="error" text={error} />}
      {meeting.captureWarning && <Expandable tone="warn" text={meeting.captureWarning} />}
      {capture.notice && (
        <p
          className={`ov-status ${capture.notice.failed ? 'ov-status--error' : 'ov-status--info'}`}
        >
          {capture.notice.text}
        </p>
      )}
    </div>
  )
}
