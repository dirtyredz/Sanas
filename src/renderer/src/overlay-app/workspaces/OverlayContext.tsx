import type { MeetingContext } from '@shared/live-controls/types'
import { useMeetingContext } from '../../lib/meeting/context/useMeetingContext'
import { useMeetingContextDraft } from '../../lib/meeting/context/useMeetingContextDraft'
import { OverlayButton } from '../controls/OverlayButton'
import { OverlayTextArea } from '../controls/OverlayTextArea'
import { MEETING_CONTEXT_MAX_CHARS } from '@shared/meeting/meeting-context'

/** Context: quick, text-only edits to this meeting's background. Unsaved text is never applied or
 *  carried over by opening Sanas. */
export function OverlayContext({ meetingId }: { meetingId: number }): React.JSX.Element {
  const { context, error } = useMeetingContext(meetingId)
  if (error)
    return (
      <p className="workspace-body ov-message ov-message--error" role="alert">
        {error}
      </p>
    )
  if (!context) return <p className="workspace-body ov-empty">Loading meeting context…</p>
  return <TextDraft key={meetingId} context={context} />
}

function TextDraft({ context }: { context: MeetingContext }): React.JSX.Element {
  const { draft, dispatch, unsaved, conflict, apply, reload } = useMeetingContextDraft(context)
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
        maxLength={MEETING_CONTEXT_MAX_CHARS}
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
    </div>
  )
}
