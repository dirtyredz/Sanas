import type { ReactNode } from 'react'
import { OpenSanasButton } from '../controls/OpenSanasButton'
import { AudienceButton } from '../suggestions/AudienceButton'
import { OverlayContext } from './context/OverlayContext'
import { OverlayCapturePanel } from '../capture/OverlayCapturePanel'
import { panelId, tabId } from '../shell/navigation/OverlayNavigation'
import type { SecondaryWorkspace, Workspace } from '../shell/navigation/overlay-navigation'
import { WORKSPACE_LABELS } from '../shell/navigation/overlay-shortcuts'
import type { OverlaySessionModel } from '../shell/OverlaySession'
import { AskWorkspace } from './composer/AskWorkspace'
import { SlidePanel } from './presentation/SlidePanel'
import { OverlayTranscript } from './transcript/OverlayTranscript'

/** One secondary workspace's frame. Every workspace stays mounted so drafts and scroll
 *  positions survive switching; inactive ones are hidden and inert (out of the tab order). */
function WorkspacePanel({
  id,
  current,
  children,
}: {
  id: SecondaryWorkspace
  current: Workspace
  children: ReactNode
}): React.JSX.Element {
  const active = id === current
  return (
    <section
      role="tabpanel"
      id={panelId(id)}
      aria-labelledby={tabId(id)}
      className={`workspace ${active ? 'is-active' : ''}`}
      inert={!active}
      aria-hidden={!active}
    >
      <h2 className="workspace-title">{WORKSPACE_LABELS[id]}</h2>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="workspace-body">
      <p className="ov-empty">{children}</p>
    </div>
  )
}

/** Ask, Screen, Slide, Transcript and Context below the answer preview. */
export function OverlayWorkspaces({
  session,
  workspace,
}: {
  session: OverlaySessionModel
  workspace: Workspace
}): React.JSX.Element {
  const { meetingId, active, suggestions, manual, presentation } = session
  const requestBusy = suggestions.requestedInFlight || manual.pending
  const audience = <AudienceButton manual={manual} active={active} requestBusy={requestBusy} />
  return (
    <div className="workspaces">
      <WorkspacePanel id="ask" current={workspace}>
        <AskWorkspace
          composer={session.composer}
          manual={manual}
          active={active}
          requestBusy={requestBusy}
        />
      </WorkspacePanel>
      <WorkspacePanel id="screen" current={workspace}>
        <OverlayCapturePanel
          meetingId={meetingId}
          active={active}
          answering={suggestions.requestedInFlight}
          capture={session.capture}
          shortcut={session.windowState.shortcuts.capture}
          onOpenAsk={() => session.navigation.select('ask')}
        />
      </WorkspacePanel>
      <WorkspacePanel id="slide" current={workspace}>
        {presentation.current ? (
          <SlidePanel state={presentation} audience={audience} />
        ) : (
          <Empty>
            {meetingId === null ? (
              'Slides appear here during a meeting with a deck.'
            ) : (
              <>
                This meeting has no slides. Add them in Sanas’s Live page. <OpenSanasButton />
              </>
            )}
          </Empty>
        )}
      </WorkspacePanel>
      <WorkspacePanel id="transcript" current={workspace}>
        <OverlayTranscript lines={session.lines} status={session.meeting.status} />
      </WorkspacePanel>
      <WorkspacePanel id="context" current={workspace}>
        {meetingId === null ? (
          <Empty>Meeting context can be edited once a meeting starts.</Empty>
        ) : (
          <OverlayContext key={meetingId} meetingId={meetingId} slideCount={presentation.count} />
        )}
      </WorkspacePanel>
    </div>
  )
}
