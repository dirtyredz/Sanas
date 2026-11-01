import type { MeetingContext } from '@shared/live-controls/types'
import { useMeetingContext } from '../../lib/meeting/useMeetingContext'
import { useMeetingContextDraft } from '../../lib/meeting/useMeetingContextDraft'
import { OpenSanasButton } from '../controls/OpenSanasButton'
import { OverlayButton } from '../controls/OverlayButton'
import { OverlayTextArea } from '../controls/OverlayTextArea'

/** Context: quick, text-only edits to this meeting's background. Apply never changes slides;
 *  full deck editing stays in the main window's Live page. Unsaved text is never applied or
 *  carried over by opening Sanas. */
export function OverlayContext({
  meetingId,
  slideCount,
}: {
  meetingId: number
  slideCount: number
}): React.JSX.Element {
  const { context, error } = useMeetingContext(meetingId)
  if (error)
    return (
      <p className="workspace-body ov-message ov-message--error" role="alert">
        {error}
      </p>
    )
  if (!context) return <p className="workspace-body ov-empty">Loading meeting context…</p>
  return <TextDraft key={meetingId} context={context} slideCount={slideCount} />
}

function TextDraft({
  context,
  slideCount,
}: {
  context: MeetingContext
  slideCount: number
}): React.JSX.Element {
  const { draft, dispatch, unsaved, conflict, apply, reload } = useMeetingContextDraft(context, {
    mode: 'text',
  })
  return (
    <div className="workspace-body overlay-context">
      <div className="context-head">
        <span className="ov-field-label">Background for this meeting only</span>
        {unsaved && <span className="ov-badge ov-badge--accent">Unsaved</span>}
      </div>
      <OverlayTextArea
        hideLabel
        label="Meeting context"
        rows={5}
        maxLength={20000}
        placeholder="Client, goals, names, numbers…"
        value={draft.text}
        disabled={draft.busy}
        onChange={(e) => dispatch({ type: 'text', text: e.target.value })}
      />
      {conflict && (
        <p className="ov-message ov-message--error" role="alert">
          Context changed in another window. Reload saved to use it — your text stays until you do.
        </p>
      )}
      <div className="workspace-actions">
        <OverlayButton
          variant="primary"
          size="sm"
          busy={draft.busy}
          disabled={!unsaved}
          onClick={() => void apply()}
        >
          Apply
        </OverlayButton>
        <OverlayButton size="sm" variant="quiet" disabled={draft.busy} onClick={reload}>
          Reload saved
        </OverlayButton>
      </div>
      {draft.notice && (
        <p className="ov-message" role="status">
          {draft.notice}
        </p>
      )}
      <p className="ov-message">
        {slideCount > 0 ? `Slides: ${slideCount}. ` : ''}Edit slides in Sanas’s Live page.{' '}
        <OpenSanasButton />
      </p>
    </div>
  )
}
