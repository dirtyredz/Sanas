import { OverlayButton } from '../controls/OverlayButton'
import { OverlayTip } from '../controls/OverlayTip'

/** Capture screen: captures the display under the overlay and asks for an answer at once. */
export function OverlayCaptureAction({
  meetingId,
  live,
  answering,
  capturing,
  failed = false,
}: {
  meetingId: number | null
  live: boolean
  /** A requested answer is streaming (the capture answer, once admitted). */
  answering: boolean
  capturing: boolean
  /** The last capture failed: the same action reads as a retry. */
  failed?: boolean
}): React.JSX.Element {
  return (
    <OverlayTip text="Capture the screen under the overlay and explain it">
      <OverlayButton
        variant="primary"
        className="capture-screen"
        busy={capturing}
        disabled={!live || meetingId === null || answering}
        onClick={() => {
          if (meetingId !== null) void window.sanas.screenCapture.capture(meetingId).catch(() => {})
        }}
      >
        {capturing ? 'Capturing…' : failed ? 'Try again' : 'Capture screen'}
      </OverlayButton>
    </OverlayTip>
  )
}
