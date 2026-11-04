import type { MeetingContext } from '@shared/live-controls/types'
import { MEETING_CONTEXT_MAX_CHARS } from '@shared/meeting-context'
import { useMeetingContext } from './useMeetingContext'
import { useMeetingContextDraft } from './useMeetingContextDraft'

/** The Live page's editor for the running meeting's context: it opens on the text saved at
 *  Start (or the latest Apply). The overlay's Context edits the same saved text. */
export function MeetingContextEditor({ meetingId }: { meetingId: number }): React.JSX.Element {
  const { context, error } = useMeetingContext(meetingId)
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {context && <ContextDraftEditor key={meetingId} context={context} />}
    </>
  )
}

function ContextDraftEditor({ context }: { context: MeetingContext }): React.JSX.Element {
  const { draft, dispatch, unsaved, conflict, apply, reload } = useMeetingContextDraft(context)
  return (
    <div className="meeting-context-editor">
      <label className="field">
        <span>Meeting context</span>
        <textarea
          maxLength={MEETING_CONTEXT_MAX_CHARS}
          rows={5}
          value={draft.text}
          disabled={draft.busy}
          onChange={(e) => dispatch({ type: 'text', text: e.target.value })}
        />
      </label>
      {conflict && (
        <p role="alert">Context changed in another window. Reload to use the latest version.</p>
      )}
      <button disabled={draft.busy || !unsaved} onClick={() => void apply()}>
        Apply to this meeting
      </button>
      <button disabled={draft.busy} onClick={reload}>
        Reload saved context
      </button>
      <p role="status">{draft.notice}</p>
    </div>
  )
}
