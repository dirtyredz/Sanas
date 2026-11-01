import type { MeetingContext } from '@shared/live-controls/types'
import { validateSlides } from '@shared/presentation/types'
import { SlideListEditor } from '../presentation/SlideListEditor'
import { selectedOrdinal } from './meeting-context-draft'
import { useMeetingContext } from './useMeetingContext'
import { useMeetingContextDraft } from './useMeetingContextDraft'
import { usePresentationState } from './usePresentationState'

/** The full meeting-context editor (main window, Live page): text, slides, restore, clear
 *  and continue-from. The overlay uses the text-only OverlayContext instead. */
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
  const presentation = usePresentationState(context.meetingId)
  const { draft, dispatch, conflict, apply, reload } = useMeetingContextDraft(context, context, {
    textOnly: false,
    presentationRevision: presentation.revision,
    currentOrdinal: presentation.ordinal,
  })
  const selected = selectedOrdinal(draft, presentation.ordinal)
  let invalid = ''
  try {
    validateSlides(draft.slides)
  } catch (e) {
    invalid = String(e)
  }
  const setSlides = (slides: MeetingContext['slides'], pin = false): void =>
    dispatch({ type: 'slides', slides, presentationRevision: presentation.revision, pin })
  return (
    <div className="meeting-context-editor">
      <label className="field">
        <span>Meeting context</span>
        <textarea
          maxLength={20000}
          rows={5}
          value={draft.text}
          onChange={(e) => dispatch({ type: 'text', text: e.target.value })}
        />
      </label>
      <details>
        <summary>Meeting slides</summary>
        <SlideListEditor slides={draft.slides} setSlides={(value) => setSlides(value)} />
        <button onClick={() => setSlides(draft.base.initialSlides, true)}>
          Restore meeting-start slides
        </button>
        <button onClick={() => setSlides([], true)}>Clear slides</button>
        {draft.slides.length > 0 && (
          <label>
            Continue from slide{' '}
            <select
              value={selected}
              onChange={(e) =>
                dispatch({
                  type: 'ordinal',
                  ordinal: Number(e.target.value),
                  presentationRevision: presentation.revision,
                })
              }
            >
              {draft.slides.map((s, i) => (
                <option key={i} value={i}>
                  {i + 1}: {s.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </details>
      {conflict && (
        <p role="alert">Context changed in another window. Reload to use the latest version.</p>
      )}
      {invalid && <p role="alert">{invalid}</p>}
      <button disabled={draft.busy || !!invalid} onClick={() => void apply()}>
        Apply to this meeting
      </button>
      <button disabled={draft.busy} onClick={reload}>
        Reload saved context
      </button>
      <p role="status">{draft.notice}</p>
    </div>
  )
}
