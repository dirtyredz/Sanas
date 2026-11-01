import { OverlayButton } from '../controls/OverlayButton'
import { OverlayCaptureAction } from './OverlayCaptureAction'
import type { CaptureStatusModel } from './useCaptureStatus'

/** Screen: capture the display under the overlay and explain it at once. Opening this view
 *  never captures anything; progress also shows in the persistent status region. */
export function OverlayCapturePanel({
  meetingId,
  active,
  answering,
  capture,
  shortcut,
  onOpenAsk,
}: {
  meetingId: number | null
  active: boolean
  answering: boolean
  capture: CaptureStatusModel
  /** The global capture shortcut's label, or ''. */
  shortcut: string
  onOpenAsk: () => void
}): React.JSX.Element {
  return (
    <div className="workspace-body capture-panel">
      <p>Captures the display under this overlay and explains what is on it.</p>
      <OverlayCaptureAction
        meetingId={meetingId}
        live={active}
        answering={answering}
        capturing={capture.capturing}
      />
      {capture.notice && (
        <p
          className={`ov-message ${capture.notice.failed ? 'ov-message--error' : ''}`}
          role="status"
        >
          {capture.notice.text}
        </p>
      )}
      <p className="ov-message">
        To add a question first, attach the screen in Ask.{' '}
        <OverlayButton size="sm" variant="quiet" onClick={onOpenAsk}>
          Open Ask
        </OverlayButton>
      </p>
      <p className="ov-message">
        {shortcut ? `${shortcut} captures from any app. ` : ''}The screenshot is sent once and not
        saved.
      </p>
    </div>
  )
}
