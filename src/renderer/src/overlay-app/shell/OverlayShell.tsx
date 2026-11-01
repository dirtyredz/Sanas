import { useEffect, useState } from 'react'
import { MeetingContextEditor } from '../../lib/meeting/MeetingContextEditor'
import { OverlayCaptureAction } from '../capture/OverlayCaptureAction'
import { OverlayButton } from '../controls/OverlayButton'
import { OverlayResizeHandles } from '../layout/OverlayResizeHandles'
import { useOverlaySplit } from '../layout/useOverlaySplit'
import { OverlaySuggestions } from '../suggestions/OverlaySuggestions'
import { OverlayComposer } from '../workspaces/composer/OverlayComposer'
import { SlidePanel } from '../workspaces/presentation/SlidePanel'
import { OverlayTranscript } from '../workspaces/transcript/OverlayTranscript'
import { AnswerEveryQuestion } from './AnswerEveryQuestion'
import { OverlayHeader } from './OverlayHeader'
import { OverlayOpacity } from './OverlayOpacity'
import type { OverlaySessionModel } from './OverlaySession'

/** Window layout (transitional: the stacked layout, restyled). */
export function OverlayShell({ session }: { session: OverlaySessionModel }): React.JSX.Element {
  const { meeting, meetingId, presentation, settings, suggestions, manual, composer } = session
  const [tab, setTab] = useState<'slide' | 'transcript' | 'context'>('slide')
  useEffect(() => setTab('slide'), [meetingId])
  const split = useOverlaySplit(
    settings.whisperRatio,
    settings.setWhisperRatio,
    settings.persistSplit,
  )
  const requestBusy = suggestions.requestedInFlight || manual.pending
  return (
    <div className="overlay-panel">
      <OverlayHeader status={meeting.status} windowState={session.windowState}>
        <OverlayOpacity settings={settings} />
      </OverlayHeader>
      {meeting.captureWarning && <p className="ov-banner">{meeting.captureWarning}</p>}
      <AnswerEveryQuestion model={session.answerEveryQuestion} />
      <div
        className={`overlay-content ${split.maximized ? 'whisper-maximized' : ''}`}
        ref={split.contentRef}
        style={{ gridTemplateRows: split.rows }}
      >
        <section className="presentation-region">
          {meetingId !== null && (
            <div className="ov-tabs" role="group" aria-label="View">
              {(['context', 'slide', 'transcript'] as const).map((name) => (
                <OverlayButton
                  key={name}
                  variant="quiet"
                  size="sm"
                  aria-pressed={tab === name}
                  onClick={() => setTab(name)}
                >
                  {name[0].toUpperCase() + name.slice(1)}
                </OverlayButton>
              ))}
            </div>
          )}
          {tab === 'context' && meetingId !== null ? (
            <div className="overlay-context">
              <MeetingContextEditor meetingId={meetingId} />
            </div>
          ) : presentation.current && tab === 'slide' ? (
            <SlidePanel state={presentation} />
          ) : (
            <OverlayTranscript lines={session.lines} status={meeting.status} />
          )}
        </section>
        <div
          className="overlay-splitter"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize transcript and whisper panels"
          title="Drag to resize; double-click to maximize the whisper"
          {...split.splitterProps}
        />
        <OverlaySuggestions
          model={suggestions}
          manual={manual}
          live={session.active}
          actions={
            <>
              <OverlayButton
                size="sm"
                disabled={meetingId === null}
                onClick={() => void window.sanas.overlay.activateComposer()}
              >
                Ask…
              </OverlayButton>
              <OverlayCaptureAction
                meetingId={meetingId}
                live={session.active}
                answering={suggestions.requestedInFlight}
                capturing={session.capture.capturing}
              />
              <OverlayButton
                size="sm"
                disabled={!session.active || requestBusy}
                onClick={() => void manual.request('audience')}
              >
                Ask the audience
              </OverlayButton>
              {session.capture.notice && (
                <p
                  className={`ov-message ${session.capture.notice.failed ? 'ov-message--error' : ''}`}
                  role="status"
                >
                  {session.capture.notice.text}
                </p>
              )}
              {session.composerOpen && <OverlayComposer model={composer} />}
            </>
          }
        />
      </div>
      <OverlayResizeHandles />
    </div>
  )
}
