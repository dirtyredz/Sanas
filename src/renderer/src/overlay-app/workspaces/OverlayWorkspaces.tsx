import type { MeetingState } from '@shared/types'
import type { TranscriptLine } from '../../lib/meeting/useTranscript'
import type { CaptureStatusModel } from '../capture/useCaptureStatus'
import type { Workspace } from '../../lib/overlay-workspaces'
import type { ManualRequestsModel } from '../suggestions/useManualRequests'
import { AskWorkspace } from './composer/AskWorkspace'
import type { OverlayComposerModel } from './composer/useOverlayComposer'
import { OverlayCapturePanel } from './OverlayCapturePanel'
import { OverlayContext } from './OverlayContext'
import { OverlayTranscript } from './OverlayTranscript'
import { Empty, WorkspacePanel } from './WorkspacePanel'

/** Ask, Screen, Transcript and Context below the answer preview. Each view gets only the
 *  slices of the session it uses. */
export function OverlayWorkspaces({
  workspace,
  meetingId,
  meetingStatus,
  active,
  answering,
  requestBusy,
  lines,
  composer,
  manual,
  capture,
  captureShortcut,
  onOpenAsk,
}: {
  workspace: Workspace
  meetingId: number | null
  meetingStatus: MeetingState['status']
  /** A meeting is running (live or paused). */
  active: boolean
  /** A requested answer is in flight. */
  answering: boolean
  /** Any answer request (requested or manual) is pending. */
  requestBusy: boolean
  lines: TranscriptLine[]
  composer: OverlayComposerModel
  manual: ManualRequestsModel
  capture: CaptureStatusModel
  /** The global capture shortcut's label, or ''. */
  captureShortcut: string
  onOpenAsk: () => void
}): React.JSX.Element {
  return (
    <div className="workspaces">
      <WorkspacePanel id="ask" current={workspace}>
        <AskWorkspace
          composer={composer}
          manual={manual}
          active={active}
          requestBusy={requestBusy}
        />
      </WorkspacePanel>
      <WorkspacePanel id="screen" current={workspace}>
        <OverlayCapturePanel
          meetingId={meetingId}
          active={active}
          answering={answering}
          capture={capture}
          shortcut={captureShortcut}
          onOpenAsk={onOpenAsk}
        />
      </WorkspacePanel>
      <WorkspacePanel id="transcript" current={workspace}>
        <OverlayTranscript lines={lines} status={meetingStatus} />
      </WorkspacePanel>
      <WorkspacePanel id="context" current={workspace}>
        {meetingId === null ? (
          <Empty>Meeting context can be edited once a meeting starts.</Empty>
        ) : (
          <OverlayContext key={meetingId} meetingId={meetingId} />
        )}
      </WorkspacePanel>
    </div>
  )
}
