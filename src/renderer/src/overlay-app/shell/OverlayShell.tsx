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
          <span className="ov-badge ov-badge--accent" title="Answer every question is on">
            Every question
          </span>
        )}
        <OverlayButton
          ref={navigation.preferencesTriggerRef}
          variant="icon"
          aria-label="Overlay preferences"
          title="Overlay preferences (Ctrl+,)"
          aria-haspopup="dialog"
          aria-expanded={navigation.preferencesOpen}
          aria-controls={navigation.preferencesOpen ? 'overlay-preferences' : undefined}
          onClick={() => setPreferencesOpen(!navigation.preferencesOpen)}
        >
          <IconMore />
        </OverlayButton>
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
          <div
            className="overlay-divider"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize the answer preview"
            title="Drag to resize the answer preview; double-click for the full answer"
            tabIndex={fullAnswer ? -1 : 0}
            hidden={fullAnswer}
            onDoubleClick={() => select('answer')}
            {...split.dividerProps}
          />
          <div className="workspace-region" aria-hidden={fullAnswer} inert={fullAnswer}>
            <OverlayWorkspaces session={session} workspace={navigation.workspace} />
          </div>
        </div>
      </div>
      <OverlayResizeHandles />
    </div>
  )
}
