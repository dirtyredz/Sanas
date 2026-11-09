import { useCallback } from 'react'
import { OverlayButton } from '../controls/OverlayButton'
import { IconMore } from '../controls/overlay-icons'
import { OverlayResizeHandles } from '../layout/OverlayResizeHandles'
import { useOverlaySplit } from '../layout/useOverlaySplit'
import { OverlaySuggestions } from '../suggestions/OverlaySuggestions'
import { OverlayWorkspaces } from '../workspaces/OverlayWorkspaces'
import { OverlayNavigation } from './navigation/OverlayNavigation'
import { panelId, tabId } from './navigation/overlay-navigation'
import { OverlayHeader } from './OverlayHeader'
import { OverlayPreferences } from './OverlayPreferences'
import type { OverlaySessionModel } from './OverlaySession'
import { OverlayStatus } from './OverlayStatus'
import { OverlayTip } from '../controls/OverlayTip'

/** Window layout: header, persistent status, then the rail beside the answer surface. In a
 *  secondary workspace the answer becomes a preview above a draggable divider; Answer gives
 *  it the whole column. Workspace changes never resize or move the native window. */
export function OverlayShell({ session }: { session: OverlaySessionModel }): React.JSX.Element {
  const { meeting, settings, navigation, suggestions } = session
  const fullAnswer = navigation.workspace === 'answer'
  const split = useOverlaySplit(
    settings.answerRatio,
    settings.setAnswerRatio,
    settings.persistAnswerRatio,
    fullAnswer,
  )
  const { setPreferencesOpen, select } = navigation
  const closePreferences = useCallback(() => setPreferencesOpen(false), [setPreferencesOpen])
  return (
    <div className="overlay-panel">
      <OverlayHeader status={meeting.status} windowState={session.windowState}>
        {session.answerEveryQuestion.enabled && (
          <OverlayTip text="Answer every question is on">
            <span className="ov-badge ov-badge--accent">Every question</span>
          </OverlayTip>
        )}
        <OverlayTip text="Overlay preferences (Ctrl+,)">
          <OverlayButton
            ref={navigation.preferencesTriggerRef}
            variant="icon"
            aria-label="Overlay preferences"
            aria-haspopup="dialog"
            aria-expanded={navigation.preferencesOpen}
            aria-controls={navigation.preferencesOpen ? 'overlay-preferences' : undefined}
            onClick={() => setPreferencesOpen(!navigation.preferencesOpen)}
          >
            <IconMore />
          </OverlayButton>
        </OverlayTip>
      </OverlayHeader>
      {navigation.preferencesOpen && (
        <OverlayPreferences
          settings={settings}
          answerEveryQuestion={session.answerEveryQuestion}
          onClose={closePreferences}
          trigger={navigation.preferencesTriggerRef}
        />
      )}
      <OverlayStatus meeting={meeting} capture={session.capture} />
      <div className="overlay-frame">
        <OverlayNavigation workspace={navigation.workspace} onSelect={select} />
        <div
          className={`overlay-main ${fullAnswer ? 'is-answer' : 'is-split'}`}
          ref={split.contentRef}
          style={{ gridTemplateRows: split.rows }}
        >
          <div
            className="answer-region"
            id={panelId('answer')}
            role="tabpanel"
            aria-labelledby={tabId('answer')}
          >
            <OverlaySuggestions
              model={suggestions}
              manual={session.manual}
              live={session.active}
              status={meeting.status}
              mode={fullAnswer ? 'full' : 'preview'}
              onReadFull={() => select('answer')}
            />
          </div>
          <OverlayTip text="Drag to resize the answer preview; double-click for the full answer">
            <div
              className="overlay-divider"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize the answer preview"
              tabIndex={fullAnswer ? -1 : 0}
              hidden={fullAnswer}
              onDoubleClick={() => select('answer')}
              {...split.dividerProps}
            />
          </OverlayTip>
          <div className="workspace-region" aria-hidden={fullAnswer} inert={fullAnswer}>
            <OverlayWorkspaces
              workspace={navigation.workspace}
              meetingId={session.meetingId}
              meetingStatus={meeting.status}
              active={session.active}
              answering={suggestions.requestedInFlight}
              requestBusy={suggestions.requestedInFlight || session.manual.pending}
              lines={session.lines}
              composer={session.composer}
              manual={session.manual}
              capture={session.capture}
              captureShortcut={session.windowState.shortcuts.capture}
              onOpenAsk={() => select('ask')}
            />
          </div>
        </div>
      </div>
      <OverlayResizeHandles />
    </div>
  )
}
